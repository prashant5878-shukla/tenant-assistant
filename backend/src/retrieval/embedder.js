import { embeddings } from '../llm/models.js';
import { TokenBudget } from '../llm/budget.js';

/** Default provider: Gemini embeddings through LangChain. */
export class GeminiEmbedder {
  embedDocuments(texts) {
    return embeddings().embedDocuments(texts);
  }
  embedQuery(text) {
    return embeddings().embedQuery(TokenBudget.clampQuestion(text)); // bounded input
  }
}

/**
 * Seam over the embedding provider. Tests inject a deterministic fake via `embedder.use(fake)`;
 * no other code touches LangChain embeddings directly.
 */
export class EmbedderGateway {
  constructor(provider = new GeminiEmbedder()) {
    this.provider = provider;
  }
  use(provider) {
    this.provider = provider;
  }
  embedDocuments(texts) {
    return this.provider.embedDocuments(texts);
  }
  embedQuery(text) {
    return this.provider.embedQuery(text);
  }
}

export const embedder = new EmbedderGateway();
