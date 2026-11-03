import { describe, it, expect } from 'vitest';
import { MetadataDetector } from '../src/ingestion/metadata.js';
import { PageChunker } from '../src/ingestion/chunker.js';
import { assertTenant, tenantFilter } from '../src/db/tenantGuard.js';
import { cosine } from '../src/retrieval/hybrid.js';

const md = new MetadataDetector();

describe('MetadataDetector', () => {
  it('reads revision dates and groups revisions into one family', () => {
    expect(md.dates('Revision 2026-09 – supersedes', 'x.pdf').effectiveDate).toBe('2026-09');
    expect(md.familyKey('datasheet', 'ALVERY-Datasheet_44.0672_AutoForm 67.pdf')).toBe(md.familyKey('datasheet', 'ALVERY-Datasheet_44.0672_AutoForm 67_rev2026-09.pdf'));
  });
  it('keeps spring-force sheets out of the datasheet family', () => {
    expect(md.familyKey('datasheet', 'ALVERY-44.0672_AutoForm 67_Spring_Force.pdf')).toBe('springforce:44.0672');
  });
  it('detects price list validity', () => {
    expect(md.dates('Valid from 1 January 2025 to 31 December 2025', 'Price_List_2025.pdf').effectiveDate).toBe('2025-01-01');
  });
});

describe('PageChunker', () => {
  const doc = { tenant: 'alvery', fileName: 'a.pdf', docType: 'datasheet', effectiveDate: '2024-06' };
  it('prefixes every chunk with tenant, file, page header', () => {
    const [c] = new PageChunker().chunk(doc, [{ page: 2, text: 'Pin stroke | 22 mm' }]);
    expect(c.text.startsWith('[tenant=alvery | file=a.pdf | type=datasheet | page=2')).toBe(true);
  });
  it('splits oversized pages on line boundaries without losing lines', () => {
    const text = Array.from({ length: 200 }, (_, i) => `row ${i} | value`).join('\n');
    const chunks = new PageChunker({ maxChars: 500 }).chunk(doc, [{ page: 1, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text.split('\n').slice(1).join('\n')).join('\n')).toBe(text);
  });
  it('skips empty pages', () => {
    expect(new PageChunker().chunk(doc, [{ page: 1, text: '  ' }])).toEqual([]);
  });
});

describe('tenantGuard', () => {
  it('rejects missing/odd tenants', () => {
    for (const bad of [undefined, '', '$ne', 'a b', { $ne: 'x' }]) expect(() => assertTenant(bad)).toThrow();
  });
  it('cannot be overridden through extra filters', () => {
    expect(tenantFilter('alvery', { tenant: 'nordhaven' }).tenant).toBe('alvery');
  });
});

describe('cosine', () => {
  it('is 1 for identical and 0 for orthogonal vectors', () => {
    expect(cosine([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});

import { TokenBudget } from '../src/llm/budget.js';
import { GeminiFactory } from '../src/llm/models.js';

describe('TokenBudget', () => {
  const hit = (n) => ({ text: 'x'.repeat(n * 4) });
  it('keeps best-ranked hits within the budget and skips ones that do not fit', () => {
    const { kept, dropped } = TokenBudget.fitDocuments([hit(100), hit(5000), hit(100)], 400);
    expect(kept.length).toBe(2);
    expect(dropped).toBe(1);
  });
  it('flags responses truncated by the output budget', () => {
    expect(() => TokenBudget.assertComplete({ response_metadata: { finishReason: 'MAX_TOKENS' } }, 'x')).toThrow(/budget/);
    expect(() => TokenBudget.assertComplete({ response_metadata: { finishReason: 'STOP' } }, 'x')).not.toThrow();
  });
  it('refuses to create a chat model without an output budget', () => {
    expect(() => new GeminiFactory().chat({})).toThrow(/maxOutputTokens/);
  });
});
