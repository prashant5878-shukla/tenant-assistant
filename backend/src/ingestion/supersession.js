import { documentsRepo, chunksRepo } from '../db/repositories.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('supersession');

/**
 * Within one familyKey the doc with the newest effectiveDate stays "current"; older ones become
 * "superseded". Runs per tenant after every ingest (also the hook Part B's incremental ingest uses).
 */
export class SupersessionService {
  constructor({ documents = documentsRepo, chunks = chunksRepo } = {}) {
    this.documents = documents;
    this.chunks = chunks;
  }

  async recompute(tenant) {
    const docs = await this.documents.list(tenant);
    const families = new Map();
    for (const d of docs) {
      if (!families.has(d.familyKey)) families.set(d.familyKey, []);
      families.get(d.familyKey).push(d);
    }
    for (const members of families.values()) {
      members.sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''));
      const [newest, ...older] = members;
      if (newest.status !== 'current') await this.#apply(tenant, newest, 'current', null);
      for (const d of older) {
        if (d.effectiveDate === newest.effectiveDate) continue; // same date: cannot tell, keep both current
        if (d.status !== 'superseded' || d.supersededBy !== newest.fileName) await this.#apply(tenant, d, 'superseded', newest.fileName);
      }
    }
  }

  async #apply(tenant, doc, status, by) {
    await this.documents.setStatus(tenant, doc._id, status, by);
    await this.chunks.setStatusForDocument(tenant, doc._id, status);
    log.info({ tenant, file: doc.fileName, status, by }, 'status changed');
  }
}
