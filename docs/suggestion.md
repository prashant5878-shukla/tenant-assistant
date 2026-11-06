# Suggestions and roadmap

Prioritised recommendations for the current architecture ([`architecture.md`](architecture.md)). Most important first.

## 1. Run the full evaluation and let it decide what is next
Run `npm run eval --fresh` and read the failures by category. Only a handful of questions have been checked live so far.

| If these categories fail | Then work on |
|---|---|
| `numeric_filter`, `aggregation`, `reasoning` | Structured product data (§2) |
| `versioning` | Revision handling and incremental ingest (§9) |
| `ocr` | OCR prompt / text normalisation |
| `abstain`, `isolation` | Prompt rules and the `verify` step |

## 2. Move filtering and price math out of the LLM
Parse the 21 data sheets and the price lists into a structured table (article number, dimensions, pin count, pin stroke, holding forces, price, price validity, each with source file and page). Then:
- Answer filter questions ("pin stroke ≥ 30 mm"), comparisons and price calculations with code; let the LLM only phrase the result.
- Use a router that emits a **typed query object** (`filter`, `price`, `setsContaining`, `compare`). Do not let the LLM write database queries.
- Keep conflicting values side by side (e.g. data sheet vs catalogue dimensions) with a source-priority rule, so a conflict is detected by code.
- Reject any extracted value that is not found verbatim (after unit and decimal-comma normalisation) on the cited page.
- Fall back to text search when the router is unsure or the query returns nothing.

## 3. Get answers faster
Answers currently take about 6–8 s, too slow for a live call. In order of effort:
1. Skip the query-analysis step for simple questions.
2. Lower the answer's thinking budget and context size.
3. Cache answers by (tenant, normalised question, index version).
4. Run query embedding and keyword search in parallel.
5. Stream the answer to the UI.
Measure time per graph node first and fix the biggest one.

## 4. Add authentication and authorisation
Anyone who can reach the API can ask, upload and delete for any client. The tenant must come from the signed-in user, never from the request. Until then the API must not be exposed.

## 5. Rate limits and upload hardening
Per-user request limits, a stricter file check (size, page count, malware scan) and quotas per tenant.

## 6. Save question logs and feedback
Store each question, retrieved chunks, citations, latency, cost and a thumbs up/down. This is how quality drops are noticed, and it provides new test questions.

## 7. Make jobs and search scale
- Upload jobs live in memory; use a queue (e.g. BullMQ + Redis) with the same event format.
- Vector search scans all chunks of a client; use a vector index (Atlas Vector Search, pgvector) once clients have thousands of chunks.
- Embedding at onboarding is the main cost; index lazily per tenant on first use.

## 8. Continuous checks
Run unit tests and the evaluation in CI on every change so a prompt change that lowers accuracy is caught. Keep the injection canary and the cross-tenant checks as permanent tests.

## 9. Incremental document updates
Uploading a newer revision already supersedes the older one and leaves other files untouched. Remaining polish:
- Parse "supersedes … of <date>" from the text as a cross-check of the family key.
- Show a change report (added / superseded / unchanged) after each upload.
- Re-extract structured data only for the new file and keep old values as history.

## 10. Trust features in the answers
- Verify that every number in an answer appears in a cited chunk (or is marked as calculated).
- Always show a price together with its validity date.
- Show "check before quoting" whenever an outdated or conflicting source was used (already shown for conflicts).

## What not to build yet
| Skip | Reason |
|---|---|
| Free-form text-to-SQL | Unsafe and unpredictable; typed queries are enough here. |
| Chat memory | Lets earlier answers leak into later ones; no one has asked for it. |
| Fine-tuning, reranking model, multi-language | No evidence yet that they are needed. |
| Document-management UI beyond upload/delete | Not needed for the current use. |
