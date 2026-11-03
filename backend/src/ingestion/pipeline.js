import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';
import { PdfExtractor } from './pdfExtractor.js';
import { GeminiOcr } from './ocr.js';
import { MetadataDetector } from './metadata.js';
import { PageChunker } from './chunker.js';
import { SupersessionService } from './supersession.js';
import { embedder } from '../retrieval/embedder.js';
import { retriever } from '../retrieval/hybrid.js';
import { documentsRepo, chunksRepo } from '../db/repositories.js';
import { assertTenant } from '../db/tenantGuard.js';
import { getLogger } from '../logger/index.js';
import { UsageMeter } from '../llm/usage.js';

const log = getLogger('ingest');

export class IngestionPipeline {
  static EMBED_BATCH = 50;

  constructor({
    extractor = new PdfExtractor(), ocr = new GeminiOcr(), metadata = new MetadataDetector(), chunker = new PageChunker(),
    supersession = new SupersessionService(), embed = embedder, documents = documentsRepo, chunks = chunksRepo,
  } = {}) {
    Object.assign(this, { extractor, ocr, metadata, chunker, supersession, embed, documents, chunks });
  }

  /** Ingest every PDF below `dir` for one tenant, then recompute which documents are current. */
  async ingestDirectory({ tenant, dir, concurrency = 3, useOcr = true }) {
    assertTenant(tenant);
    const files = await this.#listPdfs(dir);
    const usage = new UsageMeter();
    const limit = pLimit(concurrency);
    const results = await Promise.all(files.map((filePath) => limit(() => this.ingestFile({ tenant, filePath, rootDir: dir, usage, useOcr }))));
    await this.supersession.recompute(tenant);
    retriever.invalidate(tenant);
    return { tenant, results, usage: usage.toJSON() };
  }

  /** Ingest specific files (used by uploads and incremental updates), then refresh supersession + caches. */
  async ingestPaths({ tenant, filePaths, useOcr = true, onProgress = () => {} }) {
    assertTenant(tenant);
    const usage = new UsageMeter();
    const results = [];
    for (const filePath of filePaths) {
      const file = path.basename(filePath);
      onProgress({ type: 'file_start', file });
      const result = await this.ingestFile({ tenant, filePath, usage, useOcr, onProgress });
      results.push(result);
      onProgress({ type: 'file_done', file, result });
    }
    onProgress({ type: 'stage', file: '*', stage: 'finalizing' });
    await this.supersession.recompute(tenant);
    retriever.invalidate(tenant);
    return { tenant, results, usage: usage.toJSON() };
  }

  /**
   * Ingest one PDF. Idempotent: an unchanged file (same sha256) is skipped.
   * @returns {Promise<{file:string,status:'ingested'|'skipped'|'failed',pages?:number,chunks?:number,noTextPages?:number[],ocrPages?:number[],error?:string}>}
   */
  async ingestFile({ tenant, filePath, rootDir, usage = new UsageMeter(), useOcr = true, onProgress = () => {} }) {
    assertTenant(tenant);
    const fileName = path.basename(filePath);
    const stage = (name) => onProgress({ type: 'stage', file: fileName, stage: name });
    try {
      const sha256 = crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
      const existing = await this.documents.findByFile(tenant, fileName);
      if (existing?.sha256 === sha256) return { file: fileName, status: 'skipped' };

      stage('extracting');
      const { pages, pageCount } = await this.extractor.extract(filePath);
      const missing = pages.filter((p) => !p.hasTextLayer).map((p) => p.page);
      if (missing.length && useOcr) stage('ocr');
      const ocrPages = missing.length && useOcr ? await this.#runOcr(filePath, pages, missing, usage) : [];
      const noTextPages = missing.filter((n) => !ocrPages.includes(n));
      if (missing.length) log.warn({ tenant, fileName, missing, ocrPages }, 'pages without text layer');

      const relPath = path.relative(rootDir ?? path.dirname(filePath), filePath);
      const docType = this.metadata.docType(relPath, fileName);
      const dates = this.metadata.dates(pages.map((p) => p.text).join('\n'), fileName);
      const doc = await this.documents.upsert(tenant, {
        fileName, relPath, docType, sha256, pageCount, pagesWithoutText: noTextPages, ocrPages, ...dates,
        familyKey: this.metadata.familyKey(docType, fileName), status: 'current', supersededBy: null, ingestedAt: new Date(),
      });

      const chunks = this.chunker.chunk(doc, pages);
      stage('embedding');
      await this.#embed(chunks, usage);
      stage('saving');
      await this.chunks.replaceForDocument(tenant, doc._id, chunks);
      log.info({ tenant, fileName, pages: pageCount, chunks: chunks.length, docType, date: dates.effectiveDate }, 'ingested');
      return { file: fileName, status: 'ingested', pages: pageCount, chunks: chunks.length, noTextPages, ocrPages };
    } catch (err) {
      log.error({ tenant, fileName, err: err.message }, 'ingest failed');
      return { file: fileName, status: 'failed', error: err.message };
    }
  }

  async #runOcr(filePath, pages, missing, usage) {
    const done = [];
    try {
      const text = await this.ocr.recognize(filePath, usage);
      for (const n of missing) {
        if (text.get(n)) {
          pages[n - 1].text = text.get(n);
          pages[n - 1].hasTextLayer = true;
          done.push(n);
        }
      }
    } catch (err) {
      log.error({ filePath, err: err.message }, 'OCR failed; pages stay unindexed');
    }
    return done;
  }

  async #embed(chunks, usage) {
    for (let i = 0; i < chunks.length; i += IngestionPipeline.EMBED_BATCH) {
      const batch = chunks.slice(i, i + IngestionPipeline.EMBED_BATCH);
      const vectors = await this.embed.embedDocuments(batch.map((c) => c.text));
      usage.addEmbedChars(batch.reduce((n, c) => n + c.text.length, 0));
      batch.forEach((c, j) => (c.embedding = vectors[j]));
    }
  }

  async #listPdfs(dir) {
    const out = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.#listPdfs(p)));
      else if (e.name.toLowerCase().endsWith('.pdf')) out.push(p);
    }
    return out.sort();
  }
}
