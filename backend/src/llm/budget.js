import { config } from '../config/index.js';

/** Named per-call budgets (one place to tune cost and latency). */
export const BUDGETS = Object.freeze({
  analyze: { maxOutputTokens: config.BUDGET_ANALYZE_OUT, thinkingBudget: 0 }, // short JSON, no reasoning needed
  answer: { maxOutputTokens: config.BUDGET_ANSWER_OUT, thinkingBudget: config.BUDGET_ANSWER_THINKING },
  judge: { maxOutputTokens: config.BUDGET_JUDGE_OUT, thinkingBudget: 0 },
  ocr: { maxOutputTokens: config.BUDGET_OCR_OUT, thinkingBudget: 0 }, // transcription only
});

/** Input-side budgeting + detection of responses cut off by the output budget. */
export class TokenBudget {
  /** Cheap estimate (~4 chars/token); good enough for budgeting, not for billing. */
  static estimate(text) {
    return Math.ceil(text.length / 4);
  }

  /** Keeps the best-ranked hits that fit `maxTokens`; `hits` must already be sorted by relevance. */
  static fitDocuments(hits, maxTokens = config.BUDGET_CONTEXT_TOKENS) {
    const kept = [];
    let used = 0;
    for (const h of hits) {
      const t = TokenBudget.estimate(h.text) + 40; // + tag overhead
      if (used + t > maxTokens) continue; // a smaller, lower-ranked hit may still fit
      kept.push(h);
      used += t;
    }
    return { kept, dropped: hits.length - kept.length, tokens: used };
  }

  static clampQuestion(q) {
    return q.length > config.BUDGET_QUESTION_CHARS ? q.slice(0, config.BUDGET_QUESTION_CHARS) : q;
  }

  /** Throws when Gemini stopped because the output budget ran out (the JSON would be incomplete). */
  static assertComplete(message, label) {
    const reason = message?.response_metadata?.finishReason ?? message?.response_metadata?.finish_reason;
    if (reason === 'MAX_TOKENS' || reason === 'length') {
      throw new Error(`${label}: output token budget exhausted (finishReason=${reason}); raise the BUDGET_* setting`);
    }
  }
}
