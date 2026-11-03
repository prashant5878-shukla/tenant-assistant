import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * In-memory ingestion jobs with an event log. Each job keeps its full event history so a client that
 * connects late (or reconnects) can replay it; GET /jobs/:id gives the same state for plain polling.
 * Single-process only – a production setup would back this with a queue/Redis (see Part B design note).
 */
export class JobManager {
  static MAX_JOBS = 100;

  constructor() {
    this.jobs = new Map();
  }

  create({ tenant, fileNames }) {
    const job = {
      id: crypto.randomUUID(), tenant, status: 'running', startedAt: new Date().toISOString(),
      files: fileNames.map((name) => ({ name, status: 'queued', stage: null })),
      events: [], results: null, error: null, emitter: new EventEmitter(),
    };
    this.jobs.set(job.id, job);
    if (this.jobs.size > JobManager.MAX_JOBS) this.jobs.delete(this.jobs.keys().next().value); // drop the oldest
    return job;
  }

  get(id) {
    return this.jobs.get(id);
  }

  /** Record + broadcast one event and keep the per-file snapshot current. */
  emit(job, event) {
    const e = { seq: job.events.length, at: new Date().toISOString(), ...event };
    job.events.push(e);
    const f = job.files.find((x) => x.name === e.file);
    if (f) {
      if (e.type === 'stage') {
        f.status = 'running';
        f.stage = e.stage;
      }
      if (e.type === 'file_done') Object.assign(f, { status: e.result.status, stage: null, result: e.result });
    }
    job.emitter.emit('event', e);
  }

  finish(job, { results, error }) {
    job.status = error ? 'failed' : 'done';
    job.results = results ?? null;
    job.error = error ?? null;
    this.emit(job, { type: 'job_done', status: job.status, error: job.error });
  }

  /** Plain-JSON snapshot used by the polling endpoint. */
  snapshot(job) {
    const { emitter, events, ...rest } = job;
    return { ...rest, eventCount: events.length };
  }
}

export const jobManager = new JobManager();
