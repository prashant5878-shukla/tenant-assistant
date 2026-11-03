import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { assertTenant } from '../db/tenantGuard.js';
import { documentsRepo, chunksRepo } from '../db/repositories.js';
import { SupersessionService } from '../ingestion/supersession.js';
import { retriever } from '../retrieval/hybrid.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('documents');

/** Document lifecycle operations beyond ingestion (delete = first half of "update a document"). */
export class DocumentService {
  constructor({ documents = documentsRepo, chunks = chunksRepo, supersession = new SupersessionService(), uploadsRoot = path.join(config.projectRoot, 'backend/data/uploads') } = {}) {
    Object.assign(this, { documents, chunks, supersession, uploadsRoot });
  }

  /**
   * Remove a document and all of its chunks for ONE tenant. If it was the newest revision of its family,
   * the previous revision becomes current again (supersession is recomputed).
   * @returns {Promise<{deleted:boolean,fileName:string}>}
   */
  async delete({ tenant, fileName }) {
    assertTenant(tenant);
    const name = path.basename(String(fileName ?? ''));
    const doc = await this.documents.findByFile(tenant, name);
    if (!doc) return { deleted: false, fileName: name };

    await this.chunks.deleteForDocument(tenant, doc._id);
    await this.documents.deleteByFile(tenant, name);
    await fs.rm(path.join(this.uploadsRoot, tenant, name), { force: true }); // only exists for UI uploads
    await this.supersession.recompute(tenant);
    retriever.invalidate(tenant);
    log.info({ tenant, fileName: name }, 'document deleted');
    return { deleted: true, fileName: name };
  }
}

export const documentService = new DocumentService();
