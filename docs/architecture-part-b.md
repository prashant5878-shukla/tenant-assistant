# Architecture – Part B (go further)

Status: **planned, not implemented.** Part A was finished first, as requested. This file is the detailed plan; it builds on the seams that Part A already leaves.

## 0. Prioritisation
The assignment says the choice of what to do in Part B (and what *not* to) is evaluated. Order by value/risk:

| # | Item | Why | Decision |
|---|---|---|---|
| B1 | Structured product data + routing | Fixes the weakest Part A categories (numeric_filter, aggregation, reasoning, table) deterministically | Do first |
| B2 | Incremental ingestion + the 2 `after_update` questions | Small: Part A already has sha256 skip + supersession | Do second |
| B3 | Design note (≤ 2 pages, no code) | Required content, mostly thinking | Do third |
| B4 | Extras: API + UI (exist), **upload dashboard (done, §4a)**, Docker Compose (Mongo only), caching (eval cache exists) | Mostly done | Add compose services for backend/frontend, answer cache |

Explicitly **not** doing (and why): auth/SSO (out of scope for a take-home), fine-tuned rerankers, multi-language support, a generic text-to-SQL agent (unsafe/unpredictable – we use a fixed query DSL instead).

## 1. B1 – Structured product catalogue and routing

### 1.1 Data model (Mongo collections, per tenant)
`products`: one row per article number.
```
tenant, articleNo, name, line (METRO/MICRO/PRO/AUTO), kind (module|set|accessory),
dimensions{w,l,h,unit}, pinCount, pinDiameterMm, pinStrokeMm, weightKg,
clampingMechanism, holdingForce{passiveKn, activeKn, ratedKn, atTorque[{nm,kn}]},
setContents[{articleNo, qty, description, extra}],
includedInSets[articleNo], successorOf/replacedBy, discontinued{bool, date},
prices[{validFrom, validTo, listEur, source{file,page}}],
discountRules[{minQty, pct, validFrom, source}],
facts: { <attr>: { value, unit, source{file,page}, docStatus } }
```
Every value carries `source{file,page}` and the document's `status`, so structured answers are cited exactly like retrieved ones. Conflicting values from several documents are *both* kept (`facts.dimensions = [{value:"52x120x100", source: datasheet, priority:1}, {value:"52x110x100", source: catalogue, priority:2}]`) with a source-priority rule (data sheet > catalogue > flyer for technical values; newest price list for prices) – the conflict becomes detectable by code, not by LLM luck.

### 1.2 Extraction pipeline
1. **Deterministic first**: data sheets share one template ("Technical data" key/value rows, "Included in the following sets", torque table). Parse key/value rows from the already row-reassembled text with a mapping table `label → field` (e.g. "Pin stroke" → `pinStrokeMm`, "Max. axial holding force*" → holding force variants, German decimal comma → number). Price lists: rows `articleNo | description | price`; validity from the header.
2. **LLM extraction (Gemini, structured output)** only for what the template parser can't do: catalogue set pages (component tables with irregular columns), flyers, product news (discontinuations, new products, discount changes), T&C numbers (delivery times, warranty).
3. **Validation**: units normalised; ranges sanity-checked (pin stroke 1–100 mm, etc.); each extracted value must be found verbatim (after normalisation) in the page text it cites – otherwise it is rejected. This kills hallucinated extractions.
4. Quality gate: counts per tenant printed after ingest (products, with price, with stroke…) and compared with expectations in a test fixture (e.g. alvery has 21 data sheets → ≥ 21 modules with pinStrokeMm).

### 1.3 Routing (new LangGraph node `route`, before `retrieve`)
Gemini classifies the question into: `structured_filter` | `structured_lookup` | `price_calc` | `set_contents` | `text` | `hybrid`, and for structured routes emits a **typed query object** (not SQL/Mongo text):
```
{ op: "filter", field: "pinStrokeMm", cmp: ">=", value: 30 }
{ op: "price", articleNo | name, qty }
{ op: "setsContaining", term: "torque wrench" }
{ op: "compare", names: [..], fields: [..] }
```
A fixed `StructuredQueryService` executes it with tenant-scoped Mongo queries; code does the arithmetic (list price × qty × (1 − discount for tier), using the *current* price list and the discount rules valid on the order date) and builds a cited result table. The LLM then only phrases the answer from the result rows (and may not add facts). If the structured query returns nothing or the router isn't confident → fall back to the Part A text path. Hybrid questions run both and the answer node gets both result types.

### 1.4 Expected effect on Part A categories
numeric_filter (A03, A04, N01) and aggregation (A12) become set queries; reasoning (A05) becomes code; conflict (A02, A06) becomes explicit data; versioning (A21: discontinued flag + 2025 price) becomes fields.

### 1.5 Tests
- Extraction golden tests: 8 data sheets → exact expected JSON.
- Query service unit tests with a seeded in-memory dataset (filter, boundary `>=` vs `>`, discount tiers 4/5/10/24/25 units, discontinued handling).
- Router test set (30 phrasings → expected route), run with the real model only in the eval, with a fake in unit tests.
- Isolation: every `products` query goes through `tenantFilter`; extend the isolation test to the structured service.

## 2. B2 – Incremental ingestion
Command: `ingest --tenant alvery updates/alvery/` (already accepts a directory).
1. Skip by sha256 (exists). New file → full per-file pipeline (extract → chunk → embed → store).
2. `MetadataDetector` reads "Revision 2026-09 – supersedes the data sheet of 15.11.2019" → `effectiveDate 2026-09`; `familyKey` (`datasheet:44.0672`) matches the existing sheet → `SupersessionService` marks the 2019 sheet and its chunks `superseded` and sets `supersededBy`. Nothing else is touched (other documents are skipped by hash; no re-embedding).
3. Add an explicit `supersedes` hint parsed from the text ("supersedes … of 15.11.2019") as a cross-check, logged when family key and text disagree.
4. Structured layer: re-extract **only** the new file, upsert its facts with higher priority/`validFrom`; old values are marked superseded but retained (history questions work).
5. Cache invalidation: tenant retriever cache + eval fingerprint (doc hashes/status are part of it) – so the answer cache is naturally invalidated for this tenant's questions.
6. Output: a report of `added / superseded / unchanged`.
7. Acceptance: `eval --phase after_update` → U01 (4,8 kN, rev 2026-09 supersedes 4,2 kN) and U02 (only AutoForm 67 has a pin position sensor; before the update the docs only say it is planned) pass; initial-phase answers affected by the update (A03 mentions AutoForm 67 4,2 kN) must be re-judged – the expected answers of *initial* questions are about the pre-update state, so the eval must be run in the right order (initial first, then ingest, then after_update) – documented in README.
8. Test: ingest base set → snapshot counts → ingest the update → assert exactly 1 new document, 1 status change, all other documents/chunks byte-identical (hash of chunk ids).

## 3. B3 – Design note (≤ 2 pages) – outline of the answers
Scale: 500 tenants × ≤ 2,000 docs, 40 SDRs × 30 questions/day (1,200 questions/day ≈ 0.014 qps average, bursts of a few qps), < 3 s per answer.

- **Architecture**: Postgres (+pgvector) or MongoDB Atlas for structured data + vectors, object storage for PDFs, a queue + worker pool for ingestion (parse → OCR → chunk → embed → extract), stateless API behind a gateway. Index per tenant via partition/namespace key; isolation enforced in the data layer (row-level security / mandatory tenant predicate in the repository layer as in Part A, tenant id derived from the auth token, never from the request body), plus a nightly canary test that tries cross-tenant retrieval.
- **3-second budget** (today's measured breakdown goes here after the first live eval): analyze ≈ 0.8–1.2 s + embed ≈ 0.2 s + retrieve < 0.1 s + answer ≈ 1.5–3 s + verify ~0. Levers: merge analyze into a small/fast model or rules; run embedding + lexical retrieval in parallel; stream the answer; answer cache keyed by (tenant, normalised question, index version); structured route answers without the big generation step; shorter context via reranking top-8.
- **Cost model**: assumptions to state (≈ 6 k input + 400 output tokens per answer, 1,200 q/day × 22 days = 26k q/month; embeddings only at ingestion: 500 × 2,000 docs × ~10 pages × ~600 tokens = 6 B tokens one-off → the dominant cost, mitigate by lazy/tenant-on-demand indexing) → compute with current Gemini Flash prices in the note.
- **Monitoring**: per-request trace (route, retrieved ids, citations valid?, latency per node, tokens), abstention rate, citation-validity rate, thumbs up/down from SDRs, nightly golden-question eval per tenant (this repo's `eval` harness) with alerts on drop, drift of the doc-to-chunk ratio at ingestion, OCR/no-text-layer counters.
- **What breaks first**: embedding/ingestion throughput and rate limits at onboarding; in-app vector scan (replace by ANN index); date/revision detection on unseen formats; LLM latency tail. **Deliberately not built in v1**: per-tenant fine-tuning, multi-language, rerank model, UI for document management, real-time sync with client DMS.

## 4. B4 – Extras
- `docker-compose.yml`: add `backend` and `frontend` services next to Mongo (one-command demo).
- Rule from the debrief example ("prices are never shown without a validity date"): implement as a **post-processing guard in `verify`** (regex for currency amounts in the answer; if any and no validity date among cited price chunks → append validity or retry) – cheap to demo live, and it's an example of the code/prompt separation.
- Answer cache (tenant + normalised question + index version) in Mongo with TTL.

## 4a. Extra already implemented – document upload dashboard
Part B item 4 ("anything else you find valuable") is partly covered early, because it also helps day-to-day use:

- **UI**: tab **Documents** in the React app. Pick an existing client or create a new one, drag & drop / select several PDFs, upload; a per-file result table shows `ingested | skipped | failed`, OCR pages and "no text layer" warnings. The indexed-document list (with `superseded`, `OCR`, `NO TEXT LAYER` badges) refreshes right after.
- **API**: `POST /api/documents` → 202 (multipart: `tenant` + up to 20 `files`, 25 MB each). Backend steps: validate tenant id with `assertTenant` → keep only real PDFs (mime type **and** `%PDF-` magic bytes) → sanitise the file name (`path.basename` + character whitelist, no path traversal) → store under `backend/data/uploads/<tenant>/` → `IngestionPipeline.ingestPaths` (same pipeline as the CLI: hash-skip, OCR, chunk, embed, supersession recompute, retriever cache invalidation).
- **Live progress (SSE + polling fallback)**: the upload returns `202 {jobId}` and ingestion runs in the background (`JobManager`, in-memory, per-job event log). `GET /api/jobs/:id/events` is a Server-Sent Events stream (`file_start`, `stage: extracting|ocr|embedding|saving`, `file_done`, `job_done`); it replays history first and honours `Last-Event-ID`, so reconnects don't lose events. `GET /api/jobs/:id` returns the same state as a snapshot; the React hook `useJobProgress` uses `EventSource` and automatically degrades to polling every 1.5 s if the stream errors. Single-process by design; at scale this becomes a queue (e.g. BullMQ/Redis) with the same event contract.
- **Incremental by construction**: `ingestPaths` only touches the uploaded files, so uploading a newer data-sheet revision already supersedes the older one and leaves everything else untouched. This is the engine for B2; what remains for B2 is the CLI wiring/report and the `after_update` acceptance test.
- **Isolation**: the tenant comes only from the form field and goes through the same tenant guard; a new client id simply creates a new tenant namespace.
- **Not covered (deliberately)**: no authentication – anyone who can reach the API can upload to any tenant. In production the tenant must come from the auth token, never from the request (see design note). Also no delete/re-index button yet.
- Manually checked: invalid client id → 400; non-PDF files filtered; corrupt PDF reported as `failed` without crashing the batch.

## 5. Order of work and checkpoints
1. B1 extraction for data sheets + price lists → golden tests → query service → router → eval delta vs. Part A.
2. Catalogue sets + product news extraction (LLM) with verbatim validation.
3. B2 incremental ingest + `after_update` eval.
4. Design note.
5. Compose services, validity-date guard.
Each step ends with `npm test` and `npm run eval` so regressions show immediately.
