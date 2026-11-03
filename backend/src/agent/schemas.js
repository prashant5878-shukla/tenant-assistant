import { z } from 'zod';

export const analysisSchema = z.object({
  queries: z.array(z.string()).min(1).max(4).describe('1-4 short search queries (product names, article numbers, attribute words, synonyms)'),
  breadth: z.enum(['narrow', 'wide']).describe('wide = needs to scan many documents (filters, "which ... ", comparisons, lists, aggregations)'),
});

export const answerSchema = z.object({
  status: z.enum(['ANSWERED', 'NOT_IN_DOCUMENTS']),
  answer: z.string().describe('The answer, or a short statement that the documents do not cover it'),
  conflicts: z.array(z.string()).describe('Contradictions between sources, outdated values, or evident data errors; empty if none'),
  sources: z.array(z.object({ file: z.string(), page: z.number() })).describe('Every file/page the answer relies on, copied from the document tags'),
});
