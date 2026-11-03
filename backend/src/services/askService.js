import { AskAgent } from '../agent/graph.js';
import { assertTenant } from '../db/tenantGuard.js';
import { documentsRepo } from '../db/repositories.js';
import { UsageMeter } from '../llm/usage.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('ask');

/** Public entry point shared by CLI, HTTP API and eval. */
export class AskService {
  constructor({ documents = documentsRepo, agentFactory = (usage) => new AskAgent({ usage }) } = {}) {
    this.documents = documents;
    this.agentFactory = agentFactory;
  }

  async ask({ tenant, question }) {
    assertTenant(tenant);
    if (!question?.trim()) throw new Error('Question is empty');
    const known = await this.documents.tenants();
    if (!known.includes(tenant)) throw new Error(`Unknown tenant "${tenant}". Known: ${known.join(', ') || '(none ingested)'}`);

    const usage = new UsageMeter();
    const t0 = performance.now();
    const final = await this.agentFactory(usage).invoke({ tenant, question: question.trim() });
    const latencyMs = Math.round(performance.now() - t0);

    const out = {
      tenant, question, ...final.result,
      retrieved: final.hits.map((h) => ({ file: h.fileName, page: h.page, status: h.status })),
      usage: usage.toJSON(), latencyMs,
    };
    log.info({ tenant, status: out.status, latencyMs, costUsd: out.usage.costUsd }, 'asked');
    return out;
  }
}

export const askService = new AskService();
