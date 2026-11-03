import { DocumentModel } from './models/Document.js';
import { ChunkModel } from './models/Chunk.js';
import { tenantFilter, assertTenant } from './tenantGuard.js';

/** Data access for PDFs. Every method takes a tenant and builds its filter via tenantFilter(). */
export class DocumentsRepository {
  async upsert(tenant, doc) {
    return DocumentModel.findOneAndUpdate(tenantFilter(tenant, { fileName: doc.fileName }), { ...doc, tenant }, { upsert: true, returnDocument: 'after' }).lean();
  }
  async findByFile(tenant, fileName) {
    return DocumentModel.findOne(tenantFilter(tenant, { fileName })).lean();
  }
  async list(tenant) {
    return DocumentModel.find(tenantFilter(tenant)).sort({ fileName: 1 }).lean();
  }
  async setStatus(tenant, id, status, supersededBy = null) {
    return DocumentModel.updateOne(tenantFilter(tenant, { _id: id }), { status, supersededBy });
  }
  async deleteByFile(tenant, fileName) {
    return DocumentModel.findOneAndDelete(tenantFilter(tenant, { fileName })).lean();
  }
  async tenants() {
    return DocumentModel.distinct('tenant');
  }
}

/** Data access for text chunks + embeddings. Same tenant-first rule as above. */
export class ChunksRepository {
  async replaceForDocument(tenant, docId, chunks) {
    assertTenant(tenant);
    await ChunkModel.deleteMany(tenantFilter(tenant, { docId }));
    if (chunks.length) await ChunkModel.insertMany(chunks.map((c) => ({ ...c, tenant, docId })));
  }
  async setStatusForDocument(tenant, docId, status) {
    return ChunkModel.updateMany(tenantFilter(tenant, { docId }), { status });
  }
  async deleteForDocument(tenant, docId) {
    return ChunkModel.deleteMany(tenantFilter(tenant, { docId }));
  }
  async count(tenant) {
    return ChunkModel.countDocuments(tenantFilter(tenant));
  }
  /** All chunks of ONE tenant incl. embeddings; vector scoring happens in the app layer. */
  async allWithEmbeddings(tenant) {
    return ChunkModel.find(tenantFilter(tenant)).select('+embedding').lean();
  }
  async textSearch(tenant, query, limit) {
    return ChunkModel.find(tenantFilter(tenant, { $text: { $search: query } }), { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean();
  }
}

export const documentsRepo = new DocumentsRepository();
export const chunksRepo = new ChunksRepository();
