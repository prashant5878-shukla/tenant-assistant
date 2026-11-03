import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.coerce.number().default(4000),

  MONGO_URI: z.string().default('mongodb://localhost:27018'),
  MONGO_DB: z.string().default('leadlane'),

  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),

  // USD per 1M tokens, used only for the cost column of the eval report.
  PRICE_IN_PER_M: z.coerce.number().default(0.3),
  PRICE_OUT_PER_M: z.coerce.number().default(2.5),
  PRICE_EMBED_PER_M: z.coerce.number().default(0.15),

  // Token budgets per LLM call. maxOutputTokens includes Gemini "thinking" tokens, so thinking is capped separately.
  BUDGET_ANALYZE_OUT: z.coerce.number().default(512),
  BUDGET_ANSWER_OUT: z.coerce.number().default(4096),
  BUDGET_ANSWER_THINKING: z.coerce.number().default(1024),
  BUDGET_JUDGE_OUT: z.coerce.number().default(768),
  BUDGET_OCR_OUT: z.coerce.number().default(8192),
  BUDGET_CONTEXT_TOKENS: z.coerce.number().default(24000), // max retrieved-document tokens sent to the answer call
  BUDGET_QUESTION_CHARS: z.coerce.number().default(1000),

  RESOURCE_DIR: z.string().default(path.join(projectRoot, 'resource')),
  RETRIEVAL_TOP_K: z.coerce.number().default(14),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = Object.freeze({ ...parsed.data, projectRoot });

export function requireApiKey() {
  if (!config.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set. Copy backend/.env.example to backend/.env and add your Gemini key.');
  }
  return config.GOOGLE_API_KEY;
}
