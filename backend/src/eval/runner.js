import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';
import { config } from '../config/index.js';
import { askService } from '../services/askService.js';
import { documentsRepo } from '../db/repositories.js';
import { AnswerJudge } from './judge.js';
import { EvalReporter } from './report.js';
import { FileCache } from './cache.js';
import { UsageMeter } from '../llm/usage.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('eval');
const SRC = path.resolve(config.projectRoot, 'backend/src');

export class EvalRunner {
  constructor({ ask = askService, reporter = new EvalReporter(), cache = new FileCache(path.join(config.projectRoot, 'backend/data/eval-cache.json')) } = {}) {
    this.ask = ask;
    this.reporter = reporter;
    this.cache = cache;
  }

  async #loadQuestions(phase) {
    const all = JSON.parse(await fs.readFile(path.join(config.RESOURCE_DIR, 'eval/questions_public.json'), 'utf8'));
    return all.filter((q) => q.phase === phase);
  }

  /** Cache key changes when the prompts/agent code, the models or the indexed documents change. */
  async #fingerprint() {
    const files = ['agent/prompts.js', 'agent/graph.js', 'retrieval/hybrid.js', 'ingestion/chunker.js'];
    const code = await Promise.all(files.map((f) => fs.readFile(path.join(SRC, f), 'utf8')));
    const docs = [];
    for (const t of (await documentsRepo.tenants()).sort()) docs.push(...(await documentsRepo.list(t)).map((d) => `${t}/${d.fileName}/${d.sha256}/${d.status}`));
    return FileCache.key(code, docs, config.GEMINI_CHAT_MODEL, config.GEMINI_EMBED_MODEL);
  }

  async run({ phase = 'initial', fresh = false, only, concurrency = 3 } = {}) {
    let questions = await this.#loadQuestions(phase);
    if (only?.length) questions = questions.filter((q) => only.includes(q.id));
    const fp = await this.#fingerprint();
    const judgeUsage = new UsageMeter();
    const judge = new AnswerJudge({ usageSink: judgeUsage });
    const limit = pLimit(concurrency);

    const rows = await Promise.all(
      questions.map((q) =>
        limit(async () => {
          const key = FileCache.key('answer', fp, q.tenant, q.question);
          let result = fresh ? undefined : await this.cache.get(key);
          const cached = Boolean(result);
          if (!result) {
            try {
              result = await this.ask.ask({ tenant: q.tenant, question: q.question });
            } catch (err) {
              log.error({ id: q.id, err: err.message }, 'ask failed');
              result = { status: 'ERROR', answer: err.message, conflicts: [], sources: [], usage: { costUsd: 0 }, latencyMs: 0 };
            }
            if (result.status !== 'ERROR') await this.cache.set(key, result);
          }
          const jKey = FileCache.key('judge', q.id, q.expected_answer, result.answer, result.status);
          let verdict = fresh ? undefined : await this.cache.get(jKey);
          if (!verdict) {
            verdict = await judge.judge(q, result);
            await this.cache.set(jKey, verdict);
          }
          return { id: q.id, category: q.category, tenant: q.tenant, cached, latencyMs: result.latencyMs, costUsd: result.usage?.costUsd ?? 0, ...verdict, answer: result.answer, status: result.status, sources: result.sources };
        }),
      ),
    );
    rows.sort((a, b) => a.id.localeCompare(b.id));
    this.reporter.print(rows);
    await fs.writeFile(path.join(config.projectRoot, 'backend/data/last-eval.json'), JSON.stringify({ at: new Date().toISOString(), phase, rows }, null, 2));
    return rows;
  }
}
