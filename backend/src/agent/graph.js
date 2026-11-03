import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { chatModel } from '../llm/models.js';
import { BUDGETS, TokenBudget } from '../llm/budget.js';
import { retriever as defaultRetriever } from '../retrieval/hybrid.js';
import { config } from '../config/index.js';
import { getLogger } from '../logger/index.js';
import { analysisSchema, answerSchema } from './schemas.js';
import { ANALYZE_SYSTEM, ANSWER_SYSTEM, answerUserPrompt } from './prompts.js';

const log = getLogger('agent');
export const NOT_IN_DOCUMENTS_TEXT = 'This is not covered in the documents available for this client.';

const State = Annotation.Root({
  tenant: Annotation(),
  question: Annotation(),
  queries: Annotation(),
  breadth: Annotation(),
  hits: Annotation(),
  sentHits: Annotation(),
  draft: Annotation(),
  feedback: Annotation(),
  attempts: Annotation(),
  result: Annotation(),
});

/**
 * LangGraph pipeline: analyze -> retrieve -> answer -> verify (-> answer once more if verification fails).
 * One instance per request: `usage` is attributed to that request's cost.
 */
export class AskAgent {
  static MAX_ATTEMPTS = 2;

  constructor({ usage, retriever = defaultRetriever }) {
    this.usage = usage;
    this.retriever = retriever;
    this.graph = this.#build();
  }

  invoke({ tenant, question }) {
    return this.graph.invoke({ tenant, question, attempts: 0 });
  }

  #build() {
    return new StateGraph(State)
      .addNode('analyze', (s) => this.analyze(s))
      .addNode('retrieve', (s) => this.retrieve(s))
      .addNode('answer', (s) => this.answer(s))
      .addNode('verify', (s) => this.verify(s))
      .addEdge(START, 'analyze')
      .addEdge('analyze', 'retrieve')
      .addEdge('retrieve', 'answer')
      .addEdge('answer', 'verify')
      .addConditionalEdges('verify', (s) => (s.result ? END : 'answer'))
      .compile();
  }

  /** Node 1: turn the question into search queries and decide how broad the search must be. */
  async analyze(s) {
    const model = chatModel(BUDGETS.analyze).withStructuredOutput(analysisSchema, { includeRaw: true });
    const { parsed, raw } = await model.invoke([new SystemMessage(ANALYZE_SYSTEM), new HumanMessage(`Question: ${TokenBudget.clampQuestion(s.question)}`)]);
    this.usage.addMessage(raw);
    TokenBudget.assertComplete(raw, 'analyze');
    return { queries: [...new Set([s.question, ...parsed.queries])], breadth: parsed.breadth };
  }

  /** Node 2: tenant-scoped hybrid retrieval. */
  async retrieve(s) {
    const topK = s.breadth === 'wide' ? config.RETRIEVAL_TOP_K * 2 : config.RETRIEVAL_TOP_K;
    const hits = await this.retriever.search({ tenant: s.tenant, queries: s.queries, topK, usage: this.usage });
    log.debug({ tenant: s.tenant, queries: s.queries, hits: hits.map((h) => `${h.fileName}#${h.page}`) }, 'retrieved');
    return { hits };
  }

  /** Node 3: grounded answer with structured output. */
  async answer(s) {
    const { kept, dropped, tokens } = TokenBudget.fitDocuments(s.hits);
    if (dropped) log.warn({ dropped, tokens }, 'context budget: lowest-ranked chunks dropped');
    const model = chatModel(BUDGETS.answer).withStructuredOutput(answerSchema, { includeRaw: true });
    const { parsed, raw } = await model.invoke([
      new SystemMessage(ANSWER_SYSTEM),
      new HumanMessage(answerUserPrompt({ question: TokenBudget.clampQuestion(s.question), context: this.#formatContext(kept), feedback: s.feedback })),
    ]);
    this.usage.addMessage(raw);
    TokenBudget.assertComplete(raw, 'answer');
    return { draft: parsed, sentHits: kept, attempts: (s.attempts ?? 0) + 1 };
  }

  /** Node 4: deterministic guard. Only citations that point at retrieved chunks survive. */
  verify(s) {
    const d = s.draft;
    const notCovered = { result: { status: 'NOT_IN_DOCUMENTS', answer: NOT_IN_DOCUMENTS_TEXT, conflicts: [], sources: [] } };
    if (d.status === 'NOT_IN_DOCUMENTS') {
      return { result: { status: 'NOT_IN_DOCUMENTS', answer: d.answer || NOT_IN_DOCUMENTS_TEXT, conflicts: [], sources: [] } };
    }
    const allowed = new Set((s.sentHits ?? s.hits).map((h) => `${h.fileName}#${h.page}`));
    const sources = this.#dedupe(d.sources.filter((x) => allowed.has(`${x.file}#${x.page}`)));
    if (sources.length) return { result: { status: 'ANSWERED', answer: d.answer, conflicts: d.conflicts ?? [], sources } };
    if (s.attempts < AskAgent.MAX_ATTEMPTS) {
      return { feedback: 'Your sources were missing or did not match the document tags. Cite file and page exactly as tagged, or return NOT_IN_DOCUMENTS.' };
    }
    return notCovered;
  }

  #formatContext(hits) {
    return hits
      .map(
        (h) =>
          `<document file="${h.fileName}" page="${h.page}" type="${h.docType}" dated="${h.effectiveDate ?? 'unknown'}" status="${h.status === 'superseded' ? 'SUPERSEDED' : 'current'}">\n${h.text}\n</document>`,
      )
      .join('\n');
  }

  #dedupe(arr) {
    return [...new Map(arr.map((x) => [`${x.file}#${x.page}`, { file: x.file, page: x.page }])).values()];
  }
}
