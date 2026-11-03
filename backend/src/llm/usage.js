import { config } from '../config/index.js';

/** Accumulates token usage across LLM calls of one request so the eval can report cost. */
export class UsageMeter {
  constructor() {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.embedTokens = 0;
    this.llmCalls = 0;
  }
  addMessage(msg) {
    const u = msg?.usage_metadata;
    if (!u) return;
    this.inputTokens += u.input_tokens ?? 0;
    this.outputTokens += u.output_tokens ?? 0;
    this.llmCalls += 1;
  }
  /** Embedding APIs return no usage; estimate ~4 chars per token. */
  addEmbedChars(chars) {
    this.embedTokens += Math.ceil(chars / 4);
  }
  get costUsd() {
    return (
      (this.inputTokens * config.PRICE_IN_PER_M + this.outputTokens * config.PRICE_OUT_PER_M + this.embedTokens * config.PRICE_EMBED_PER_M) /
      1e6
    );
  }
  toJSON() {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens, embedTokens: this.embedTokens, llmCalls: this.llmCalls, costUsd: +this.costUsd.toFixed(6) };
  }
}
