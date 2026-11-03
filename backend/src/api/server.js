import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { assertTenant } from '../db/tenantGuard.js';
import { ensureIndexes } from '../db/connection.js';
import { IngestionPipeline } from '../ingestion/pipeline.js';
import { jobManager } from '../services/jobManager.js';
import { config } from '../config/index.js';
import { connectDb } from '../db/connection.js';
import { askService } from '../services/askService.js';
import { documentsRepo } from '../db/repositories.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('api');
const askBody = z.object({ tenant: z.string(), question: z.string().min(2).max(1000) });

export class ApiServer {
  constructor({ ask = askService, documents = documentsRepo, pipeline = new IngestionPipeline() } = {}) {
    this.pipeline = pipeline;
    this.jobs = jobManager;
    this.ask = ask;
    this.documents = documents;
    this.app = express();
    this.app.use(cors(), express.json({ limit: '50kb' }));
    this.#routes();
    this.app.use((err, _req, res, _next) => {
      log.error({ err: err.message }, 'request failed');
      res.status(err.status ?? 500).json({ error: err.message });
    });
  }

  #routes() {
    const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

    this.app.get('/api/health', (_req, res) => res.json({ ok: true }));

    this.app.get('/api/tenants', wrap(async (_req, res) => res.json({ tenants: (await this.documents.tenants()).sort() })));

    this.app.get('/api/documents', wrap(async (req, res) => {
      const docs = await this.documents.list(String(req.query.tenant ?? ''));
      res.json({ documents: docs.map(({ _id, sha256, ...d }) => d) });
    }));

    // Dashboard upload: multipart fields `tenant` + `files` (PDFs). Files are held in memory, validated, then ingested.
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });
    this.app.post('/api/documents', upload.array('files', 20), wrap(async (req, res) => {
      let tenant;
      try {
        tenant = assertTenant(String(req.body.tenant ?? ''));
      } catch {
        return res.status(400).json({ error: 'Invalid client id (use lowercase letters, digits, - or _; 2-41 chars)' });
      }
      const files = (req.files ?? []).filter((f) => f.mimetype === 'application/pdf' && f.buffer.subarray(0, 5).toString() === '%PDF-');
      if (!files.length) return res.status(400).json({ error: 'Upload at least one valid PDF file' });

      const dir = path.join(config.projectRoot, 'backend/data/uploads', tenant);
      await fs.mkdir(dir, { recursive: true });
      const filePaths = [];
      for (const f of files) {
        const safe = path.basename(f.originalname).replace(/[^\w.() -]/g, '_'); // no path traversal
        const target = path.join(dir, safe);
        await fs.writeFile(target, f.buffer);
        filePaths.push(target);
      }
      await ensureIndexes();

      // Run in the background; the client follows progress via SSE (or polls GET /api/jobs/:id).
      const job = this.jobs.create({ tenant, fileNames: filePaths.map((p) => path.basename(p)) });
      this.pipeline
        .ingestPaths({ tenant, filePaths, onProgress: (e) => this.jobs.emit(job, e) })
        .then((r) => this.jobs.finish(job, { results: r.results }))
        .catch((err) => {
          log.error({ err: err.message, jobId: job.id }, 'ingest job failed');
          this.jobs.finish(job, { error: err.message });
        });
      res.status(202).json({ jobId: job.id, tenant, files: job.files.map((f) => f.name) });
    }));

    // Polling endpoint: current snapshot of a job.
    this.app.get('/api/jobs/:id', wrap(async (req, res) => {
      const job = this.jobs.get(req.params.id);
      if (!job) return res.status(404).json({ error: 'Unknown job' });
      res.json(this.jobs.snapshot(job));
    }));

    // Server-Sent Events: replays the job's history, then streams live events until the job ends.
    this.app.get('/api/jobs/:id/events', (req, res) => {
      const job = this.jobs.get(req.params.id);
      if (!job) return res.status(404).json({ error: 'Unknown job' });
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const send = (e) => res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
      const from = Number(req.get('Last-Event-ID') ?? -1) + 1; // resume after reconnect
      job.events.slice(from).forEach(send);
      if (job.status !== 'running') return res.end();
      const onEvent = (e) => {
        send(e);
        if (e.type === 'job_done') res.end();
      };
      const beat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
      job.emitter.on('event', onEvent);
      req.on('close', () => {
        clearInterval(beat);
        job.emitter.off('event', onEvent);
      });
    });

    this.app.post('/api/ask', wrap(async (req, res) => {
      const body = askBody.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: 'tenant and question (2-1000 chars) are required' });
      res.json(await this.ask.ask(body.data));
    }));
  }

  async start() {
    await connectDb();
    return this.app.listen(config.PORT, () => log.info(`API listening on http://localhost:${config.PORT}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await new ApiServer().start();
