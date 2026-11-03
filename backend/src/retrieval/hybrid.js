import { chunksRepo } from '../db/repositories.js';
import { assertTenant } from '../db/tenantGuard.js';
import { embedder } from './embedder.js';

const RRF_K = 60;
const SUPERSEDED_PENALTY = 0.6;
const CACHE_TTL_MS = 30_000;

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Hybrid retrieval for ONE tenant: vector similarity + Mongo $text, fused with reciprocal rank fusion
 * over all query variants. Superseded documents stay retrievable (so conflicts can be reported) but are demoted.
 * Both candidate lists come from tenant-filtered repository calls, so cross-tenant leakage is impossible by construction.
 */
export class HybridRetriever {
  constructor({ chunks = chunksRepo, embed = embedder } = {}) {
    this.chunks = chunks;
    this.embed = embed;
    this.cache = new Map(); // tenant -> { at, chunks }
  }

  invalidate(tenant) {
    tenant ? this.cache.delete(tenant) : this.cache.clear();
  }

  async #tenantChunks(tenant) {
    const hit = this.cache.get(tenant);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.chunks;
    const chunks = await this.chunks.allWithEmbeddings(tenant);
    this.cache.set(tenant, { at: Date.now(), chunks });
    return chunks;
  }

  async search({ tenant, queries, topK, usage }) {
    assertTenant(tenant);
    const chunks = await this.#tenantChunks(tenant);
    const byId = new Map(chunks.map((c) => [String(c._id), c]));
    const scores = new Map();
    const bump = (id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));

    for (const q of queries) {
      const qv = await this.embed.embedQuery(q);
      usage?.addEmbedChars(q.length);
      chunks
        .map((c) => ({ id: String(c._id), s: cosine(qv, c.embedding) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, topK * 2)
        .forEach((x, i) => bump(x.id, i));

      let lexical = [];
      try {
        lexical = await this.chunks.textSearch(tenant, q, topK * 2);
      } catch {
        /* stop-word-only query: the vector list alone is fine */
      }
      lexical.forEach((c, i) => byId.has(String(c._id)) && bump(String(c._id), i));
    }

    return [...scores.entries()]
      .map(([id, s]) => ({ chunk: byId.get(id), score: s * (byId.get(id).status === 'superseded' ? SUPERSEDED_PENALTY : 1) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk, score }) => ({
        id: String(chunk._id), fileName: chunk.fileName, page: chunk.page, docType: chunk.docType,
        effectiveDate: chunk.effectiveDate, status: chunk.status, text: chunk.text, score,
      }));
  }
}

export const retriever = new HybridRetriever();
