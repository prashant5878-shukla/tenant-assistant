import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { config, requireApiKey } from '../config/index.js';

/** Creates Gemini chat/embedding clients lazily so commands that need no LLM work without an API key. */
export class GeminiFactory {
  #embedder;

  /**
   * @param {{temperature?:number,maxOutputTokens:number,thinkingBudget?:number}} opts
   * maxOutputTokens is mandatory: no LLM call may run without an explicit output budget.
   */
  chat({ temperature = 0, maxOutputTokens, thinkingBudget = 0 } = {}) {
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error('chat(): maxOutputTokens budget is required');
    return new ChatGoogleGenerativeAI({
      model: config.GEMINI_CHAT_MODEL, apiKey: requireApiKey(), temperature, maxRetries: 3, maxOutputTokens, thinkingBudget,
    });
  }

  embeddings() {
    this.#embedder ??= new GoogleGenerativeAIEmbeddings({ model: config.GEMINI_EMBED_MODEL, apiKey: requireApiKey() });
    return this.#embedder;
  }
}

export const gemini = new GeminiFactory();
export const chatModel = (opts) => gemini.chat(opts);
export const embeddings = () => gemini.embeddings();
