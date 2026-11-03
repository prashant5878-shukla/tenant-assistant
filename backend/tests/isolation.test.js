import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { connectDb, closeDb, ensureIndexes } from '../src/db/connection.js';
import { embedder } from '../src/retrieval/embedder.js';
import { retriever } from '../src/retrieval/hybrid.js';
import { IngestionPipeline } from '../src/ingestion/pipeline.js';
import { documentsRepo, chunksRepo } from '../src/db/repositories.js';
import { FakeEmbedder } from './helpers.js';

const DATA = path.join(config.RESOURCE_DIR, 'data');
const QUERIES = ['NP-450 maximum head', 'FormVise 100 list price', 'maintenance interval', 'price list 2026 unit price', 'pump flow rate m3/h', 'pin stroke holding force', 'warranty'];

let files;
let ids; // tenant -> Set of chunk ids it owns (file names alone are NOT unique across tenants: both have Price_List_2026.pdf)

beforeAll(async () => {
  embedder.use(new FakeEmbedder());
  await connectDb();
  await mongoose.connection.dropDatabase();
  await ensureIndexes();
  const pipeline = new IngestionPipeline();
  for (const tenant of ['alvery', 'nordhaven']) {
    await pipeline.ingestDirectory({ tenant, dir: path.join(DATA, tenant), useOcr: false });
  }
  ids = {
    alvery: new Set((await chunksRepo.allWithEmbeddings('alvery')).map((c) => String(c._id))),
    nordhaven: new Set((await chunksRepo.allWithEmbeddings('nordhaven')).map((c) => String(c._id))),
  };
  files = {
    alvery: new Set((await documentsRepo.list('alvery')).map((d) => d.fileName)),
    nordhaven: new Set((await documentsRepo.list('nordhaven')).map((d) => d.fileName)),
  };
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await closeDb();
});

describe('ingestion', () => {
  it('loads all 33 alvery and 4 nordhaven PDFs', () => {
    expect(files.alvery.size).toBe(33);
    expect(files.nordhaven.size).toBe(4);
  });
  it('reports the scanned notice as having no text layer (OCR disabled here)', async () => {
    const d = await documentsRepo.findByFile('alvery', 'Service_Notice_SN-2026-04_scan.pdf');
    expect(d.pagesWithoutText).toEqual([1]);
  });
  it('marks the 2025 price list superseded by 2026 and keeps both files', async () => {
    const old = await documentsRepo.findByFile('alvery', 'Price_List_2025.pdf');
    const cur = await documentsRepo.findByFile('alvery', 'Price_List_2026.pdf');
    expect(old.status).toBe('superseded');
    expect(cur.status).toBe('current');
  });
  it('is idempotent: re-ingesting unchanged files is skipped', async () => {
    const r = await new IngestionPipeline().ingestDirectory({ tenant: 'nordhaven', dir: path.join(DATA, 'nordhaven'), useOcr: false });
    expect(r.results.every((x) => x.status === 'skipped')).toBe(true);
  });
});

describe('tenant isolation', () => {
  it.each([['alvery', 'nordhaven'], ['nordhaven', 'alvery']])('%s retrieval never returns %s documents', async (tenant, other) => {
    for (const q of QUERIES) {
      const hits = await retriever.search({ tenant, queries: [q], topK: 40 });
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) {
        expect(ids[tenant].has(h.id), `${tenant} got foreign chunk ${h.fileName}#${h.page}`).toBe(true);
        expect(ids[other].has(h.id)).toBe(false);
        expect(h.text.includes(`tenant=${tenant} `)).toBe(true);
      }
    }
  });

  it('a query that literally names the other tenant\'s product still returns only own documents', async () => {
    const hits = await retriever.search({ tenant: 'alvery', queries: ['NP-450 centrifugal pump Nordhaven Pumpen'], topK: 40 });
    expect(hits.every((h) => !/nordhaven|NP-\d{3}/i.test(h.fileName))).toBe(true);
    expect(hits.every((h) => !/Nordhaven Pumpen AG/.test(h.text))).toBe(true);
  });

  it('repositories refuse to run without a valid tenant, and filter injection is rejected', async () => {
    await expect(chunksRepo.textSearch(undefined, 'pump', 5)).rejects.toThrow(/tenant/i);
    await expect(chunksRepo.allWithEmbeddings({ $ne: 'alvery' })).rejects.toThrow(/tenant/i);
    await expect(retriever.search({ tenant: '', queries: ['x'], topK: 3 })).rejects.toThrow(/tenant/i);
  });

  it('every stored chunk is owned by the tenant of its document', async () => {
    for (const tenant of ['alvery', 'nordhaven']) {
      const chunks = await chunksRepo.allWithEmbeddings(tenant);
      expect(chunks.every((c) => c.tenant === tenant && files[tenant].has(c.fileName))).toBe(true);
    }
  });
});

describe('document delete', () => {
  it('removes only that tenant\'s document, even when the file name exists in both tenants', async () => {
    const { documentService } = await import('../src/services/documentService.js');
    const before = await chunksRepo.count('nordhaven');
    const r = await documentService.delete({ tenant: 'alvery', fileName: 'Price_List_2026.pdf' });
    expect(r.deleted).toBe(true);
    expect(await chunksRepo.count('nordhaven')).toBe(before);
    expect(await documentsRepo.findByFile('nordhaven', 'Price_List_2026.pdf')).not.toBeNull();
    expect(await documentsRepo.findByFile('alvery', 'Price_List_2026.pdf')).toBeNull();
  });

  it('restores the previous revision as current when the newest one is deleted', async () => {
    const old = await documentsRepo.findByFile('alvery', 'Price_List_2025.pdf');
    expect(old.status).toBe('current'); // 2026 list is gone, so 2025 is the newest again
  });

  it('is a no-op for unknown files and rejects bad tenants', async () => {
    const { documentService } = await import('../src/services/documentService.js');
    expect((await documentService.delete({ tenant: 'alvery', fileName: 'nope.pdf' })).deleted).toBe(false);
    await expect(documentService.delete({ tenant: '$ne', fileName: 'x.pdf' })).rejects.toThrow(/tenant/i);
  });
});
