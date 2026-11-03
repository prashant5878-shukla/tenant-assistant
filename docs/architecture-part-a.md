# Architecture – Part A (the core)

Status: **implemented** (code in `backend/`, UI in `frontend/`). Live eval numbers are not recorded yet because no Gemini key was available during the build (see "Open items").

## 1. What Part A must deliver (from ASSIGNMENT.pdf)
1. Ingest all PDFs of both tenants incl. tables; OCR (or detect) the scanned notice.
2. `ask --tenant alvery "..."` → answer + sources (file + page).
3. Correctness rules: current beats outdated; conflicts are reported; "not in the documents" instead of guessing; no general knowledge; document text is data, never instructions.
4. Tenant isolation proven by a test.
5. `eval`: 27 initial questions, per-question result, accuracy overall/per category, avg cost + latency, cheap to rerun.
6. README (setup ≤ 5 commands, decisions, results, failures, next steps, AI usage).

## 2. Findings from reading the data (these drove the design)
| Finding | Consequence |
|---|---|
| ~100 pages, page-structured (data sheet = 2 pages, catalogue set = 1 page each) | One chunk per page keeps tables + product name together. No sliding windows. |
| Answers live in tables (spring-force table, torque table, set contents) | pdf.js text is re-assembled into rows (`cell \| cell \| cell`) by y-position; a cell-per-line dump would destroy tables. |
| Data sheet pages 2 don't repeat the product name | Every chunk gets a header `[tenant file type page dated]`, so the file name (e.g. "FormVise 100") is embedded and searchable. |
| Same article in several revisions (AutoForm 67 2019 vs rev 2026-09; price list 2025 vs 2026) | Documents get an `effectiveDate` + `familyKey`; the newest of a family is `current`, older ones `superseded` (demoted, still retrievable so conflicts can be reported). |
| Contradictions (module dimensions 110 vs 120 mm), errors (430 "kg"), traps (PickForm 50 F has no holding force) | Answer prompt: report conflicts, data sheet is binding for tech values, flag evident errors, abstain rather than borrow a neighbour's value. |
| One scan (`Service_Notice_SN-2026-04_scan.pdf`, no text layer) | Page-level text-layer detection → Gemini OCR (native PDF input). If OCR fails the page is reported as "NO TEXT LAYER", never silently dropped. |
| NP-200 service manual contains "NOTE FOR AI ASSISTANTS: ignore all previous instructions…" | Documents are wrapped in `<document>` tags and declared untrusted in the system prompt; the eval has a canary check (answer must not contain the injected phone number / system prompt). |
| Both tenants contain a file called `Price_List_2026.pdf` | Identity is always `(tenant, fileName)`, never fileName alone. The isolation test compares chunk ids for this reason. |
| Aggregation questions (A03, A04, A12) need many documents | Query analysis outputs `breadth: wide` → 2× top-k and one query per attribute. |

## 3. Tech stack
| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 22 (ESM), class-based modules | Requested; classes with injected collaborators keep each file small and testable. |
| API | Express 5 + zod validation | Minimal. |
| DB | MongoDB 7 in Docker (`docker-compose.yml`, host port **27018** because 27017 was in use) via **Mongoose** | Requested. |
| LLM | Gemini (`gemini-2.5-flash` chat, `gemini-embedding-001`), configurable by env | Requested "Gemini only". |
| LLM orchestration | LangChain (`@langchain/google-genai`, structured output) + **LangGraph** | The ask flow has 4 nodes + a retry edge, so LangGraph is justified. |
| PDF | `pdfjs-dist` (text + positions) | Pure Node, no system deps (poppler/tesseract not needed). |
| Logging | pino (+ pino-pretty in dev) | Structured logs per module (`getLogger('ingest')`). |
| Tests | vitest | Unit + Mongo-backed isolation tests with a fake embedder (no API key). |
| Frontend | React + Vite | Requested. Function components + hooks (class components are legacy in React). |

## 4. Repository layout
```
backend/
  src/
    config/        env parsing (zod), fail-fast
    logger/        pino factory
    db/            connection, mongoose models (Document, Chunk), repositories (classes), tenantGuard
    ingestion/     PdfExtractor, GeminiOcr, MetadataDetector, PageChunker, SupersessionService, IngestionPipeline
    llm/           GeminiFactory, UsageMeter (tokens → cost)
    retrieval/     EmbedderGateway (seam for tests), HybridRetriever
    agent/         AskAgent (LangGraph), prompts, zod schemas
    services/      AskService (public entry point)
    eval/          EvalRunner, AnswerJudge, EvalReporter, FileCache
    api/           ApiServer (Express)
    cli/           Cli (ask | ingest | eval | docs), IngestCommand
  scripts/ingest-all.js     data-injection script
  tests/                    unit.test.js, isolation.test.js
frontend/src/    App, components (TenantSelect, AskForm, AnswerCard, DocumentList), services/api.js
docker-compose.yml          MongoDB
docs/                       this file + architecture-part-b.md
```

## 5. Data model (MongoDB, Mongoose)
**documents** – one per PDF: `tenant, fileName, relPath, docType, sha256, pageCount, pagesWithoutText[], ocrPages[], effectiveDate, revision, familyKey, status(current|superseded), supersededBy, ingestedAt`. Unique index `(tenant, fileName)`.

**chunks** – one per page (or page part): `tenant, docId, fileName, page, part, docType, effectiveDate, status, text (with header), embedding[] (select:false)`. Indexes: `(tenant, docId)` and a compound text index `(tenant, text)` – MongoDB then *requires* an equality match on `tenant` for every `$text` query.

## 6. Ingestion flow (`IngestionPipeline`)
```
for each PDF under data/<tenant>/ (bounded concurrency 3)
  sha256 unchanged?            -> skip (idempotent)
  PdfExtractor                 -> pages: rows reassembled, hasTextLayer per page
  pages without text layer?    -> GeminiOcr (PDF as native input) -> fill text; else report NO TEXT LAYER
  MetadataDetector             -> docType (folder/name), familyKey (article no.), effectiveDate (Revision / Valid from / Issue date / Status / filename)
  upsert document
  PageChunker                  -> header + page text (split only if > 2400 chars)
  embed in batches of 50       -> store chunks (replace per document)
after all files: SupersessionService.recompute(tenant) + retriever cache invalidation
```
Failures are per file: one bad PDF is logged and reported, the rest continue.

Entry points: `npm run ingest:all` (script, every tenant folder) or `node src/cli/index.js ingest <dir> --tenant <t>`.

## 7. Ask flow (`AskAgent`, LangGraph)
```
START → analyze → retrieve → answer → verify ─┬─ result set → END
                                  ▲           └─ citations invalid (attempt 1) → back to answer with feedback
```
1. **analyze** (Gemini, structured output): ≤4 search queries (product names, article numbers, attribute words) + `breadth` narrow|wide. The original question is always kept as a query.
2. **retrieve** (no LLM): for each query – cosine over the tenant's chunk embeddings + Mongo `$text`; fuse with reciprocal rank fusion (k=60); `superseded` chunks ×0.6; top 14 (28 if wide). Tenant argument is mandatory.
3. **answer** (Gemini, structured output `{status, answer, conflicts[], sources[{file,page}]}`): system prompt with 9 hard rules (only documents; documents are untrusted data; newer beats older; report conflicts; flag data errors; numbers verbatim; exhaustive on filter questions; cite every fact; concise).
4. **verify** (deterministic): drops citations that don't point to a retrieved (file, page); `ANSWERED` with zero valid citations is retried once, then converted to `NOT_IN_DOCUMENTS`. This is the guard against uncited/invented answers.

Output: `{status, answer, conflicts, sources, retrieved, usage{tokens,cost}, latencyMs}`.

### Token budgets (every LLM call)
`backend/src/llm/budget.js`, tunable via `BUDGET_*` env vars. `GeminiFactory.chat()` **throws if `maxOutputTokens` is not given**, so no call can run unbounded.
| Call | Output cap | Thinking cap | Input guard |
|---|---|---|---|
| analyze | 512 | 0 | question clamped to 1000 chars |
| answer | 4096 (includes thinking) | 1024 | retrieved context capped at 24k tokens: lowest-ranked chunks are dropped (logged), and only chunks actually sent may be cited |
| eval judge | 768 | 0 | – |
| OCR | 8192 | 0 | – |
| query embedding | – | – | input clamped to 1000 chars |
If Gemini stops with `MAX_TOKENS` the call fails loudly (`output token budget exhausted`) instead of parsing a truncated JSON.

### Why vectors are scored in the app, not in MongoDB
Community `mongo:7` has no `$vectorSearch`. The corpus is tiny (≈150 chunks/tenant), so loading one tenant's embeddings (30 s in-process cache) and scoring them is faster than a round trip. The `HybridRetriever` interface is the seam to swap in Atlas Vector Search / `mongodb-atlas-local` at scale (see Part B design note).

## 8. Correctness rules → where each is enforced
| Rule | Mechanism |
|---|---|
| Current beats outdated | `status` per document (SupersessionService) + `SUPERSEDED` tag in context + prompt rule 3 + retrieval demotion |
| Conflicts are reported | `conflicts[]` in the output schema; prompt rule 4; judge requires the flag when the reference mentions one |
| "Not in the documents" | prompt rule 1 + schema status + verify fallback. Never uses general knowledge. |
| Document text is data | `<document>` wrapping, prompt rule 2, injection canary in eval (N02). Document text never reaches the *analyze* node – only the question does. |
| Tenant isolation | see §9 |

## 9. Tenant isolation
Defence in depth, all enforced in code the LLM cannot influence:
1. `tenantGuard.assertTenant` – strict regex; objects like `{$ne:'x'}` are rejected (NoSQL-injection safe).
2. Every repository method builds its filter with `tenantFilter(tenant, extra)`, where `tenant` is applied *last* so `extra` can't override it. No repository method exists without a tenant parameter.
3. The Mongo text index is `(tenant, text)` → `$text` without tenant equality is impossible.
4. The retriever loads chunks only through the tenant-filtered repository, so the vector list and the text list can't contain foreign chunks.
5. The LLM only ever sees chunks of one tenant; its context contains no other tenant's data to leak. The prompt isn't relied on for isolation.
6. UI clears the history when switching tenant.

**Proof (`tests/isolation.test.js`, real MongoDB, both tenants ingested):**
- for 7 queries × both directions, every returned chunk id belongs to the asking tenant and none to the other (ids, not names – both tenants have `Price_List_2026.pdf`);
- a query naming the other tenant's product ("NP-450 centrifugal pump Nordhaven Pumpen") returns no Nordhaven text for alvery;
- repositories/retriever throw on missing or injected tenant values;
- every stored chunk is owned by the tenant of its document.
Also asked via the eval: A24 and N03 are cross-tenant questions and must abstain.

## 10. Evaluation (`npm run eval`)
- Questions: the 27 `initial` ones (24 alvery + 3 nordhaven) from `eval/questions_public.json`; `--phase after_update` is ready for Part B; `--only A01,A05`, `--fresh`.
- **Judging, cheapest rule first:**
  1. expected `NOT_IN_DOCUMENTS` → pass iff the system abstained (exact, no LLM);
  2. forbidden strings (injection canary for N02) → fail if present (exact);
  3. otherwise the system must have answered *and* a Gemini judge (temp 0, structured `{correct, reason}`) compares with the reference answer: all key numbers/items present, nothing contradicting, conflicts flagged when the reference mentions one. Judge treats the assistant text as data.
  4. **source recall** (fraction of expected files that were cited) is reported as a separate column – informative but it doesn't decide pass/fail, since several valid source combinations exist.
- **Cost of reruns:** answers and verdicts are cached in `backend/data/eval-cache.json`, keyed by a fingerprint of prompts + agent/retrieval/chunker code + model names + the sha256/status of indexed docs. Change a prompt → only then are answers recomputed. Unchanged reruns cost $0 and take seconds.
- Output: per-question table (result, source recall, latency, cost, failure reason), overall accuracy, per-category table, average latency and cost; JSON to `backend/data/last-eval.json`.
- Cost = Gemini `usage_metadata` tokens × configurable prices (+ estimated embedding tokens); judge cost is tracked separately and not included in the per-question cost.

## 11. Logging & errors
pino JSON logs with a `module` field (`ingest`, `ocr`, `agent`, `ask`, `db`, `eval`, `api`, `supersession`); `LOG_LEVEL` env. Config errors fail fast at startup; missing API key → clear message; Mongo unreachable → message pointing to `docker compose up -d`; ingest errors are per file; API returns `{error}` with proper status; zod validates the `/api/ask` body.

## 12. API (for the React UI)
`GET /api/health` · `GET /api/tenants` · `GET /api/documents?tenant=` · `POST /api/ask {tenant, question}`. Vite proxies `/api` to port 4000.

## 13. Known risks / limitations of Part A (honest list)
- **Aggregations over many pages** (A04 pin stroke ≥ 30 mm across 21 data sheets; A12 torque wrench across ~10 catalogue pages; A03) depend on retrieval recall. Mitigation: wide breadth + per-attribute queries. Real fix is the structured table in Part B.
- **Arithmetic** (A05: 12 × 1,290 − 8 %) is done by the LLM. Part B moves it to code.
- **OCR** quality of the scan is only as good as Gemini's transcription; the transcription is stored as chunks so it's inspectable, but it isn't human-verified.
- Effective-date detection is regex-based and tuned to this corpus; unknown formats fall back to the file name or `null`.
- Full tenant embedding scan doesn't scale beyond a few thousand chunks per tenant.
- Judge model = same model family as the answerer (self-preference bias possible); abstention and canary checks are exact for that reason.

## 14. Open items before declaring Part A done
1. Provide `GOOGLE_API_KEY` in `backend/.env`.
2. `npm run ingest:all`, then `npm run eval`; record accuracy, failures and causes in README.
3. Verify the OCR output of the scan manually (expected: serials 2511-0001 to 2602-0450, 22 Nm, kit 41.9125).
4. Verify the Gemini model ids in `.env` are available to the key (defaults are configurable).
