# LeadLane Product Assistant

Answers questions about a client's PDF documents with sources, says "not in the documents" when they don't cover it, and never mixes tenants.

Docs: [`docs/architecture.md`](docs/architecture.md) (database models, high-level design, every component) · [`docs/suggestion.md`](docs/suggestion.md) (roadmap and suggestions).

## Setup (5 commands)
```bash
docker compose up -d                                   # MongoDB on localhost:27018
cd backend && npm install && cp .env.example .env      # then put GOOGLE_API_KEY into .env
npm run ingest:all                                     # ingest both tenants (OCR for the scan)
npm run leadlane -- alvery ask which modules have a pin stroke of at least 30 mm
npm run eval                                           # 27 initial questions, table + accuracy
```
Other: `npm test` (no API key needed; needs MongoDB) · `npm start` (API :4000) · `cd frontend && npm install && npm run dev` (UI :5173).

## Upload dashboard
In the UI open the **Documents** tab to add PDFs to an existing or new client without the CLI (calls `POST /api/documents`, same ingestion pipeline; progress per file streams live over SSE with polling fallback). Documents can also be deleted there. There is no authentication yet.

## Status
Working end to end: ingestion (incl. OCR of the scanned notice), tenant-scoped search, cited answers, "not in the documents" handling, CLI, API, UI, evaluation harness. Tests (unit + tenant isolation against real MongoDB) pass.

Not recorded yet: results of the full 27-question evaluation, the failure analysis, and a note on how AI tools were used. These need a live `npm run eval` run.
