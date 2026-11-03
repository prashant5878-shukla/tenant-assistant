# LeadLane Product Assistant

Answers questions about a client's PDF documents with sources, says "not in the documents" when they don't cover it, and never mixes tenants.
Details: [`docs/architecture-part-a.md`](docs/architecture-part-a.md) (implemented) · [`docs/architecture-part-b.md`](docs/architecture-part-b.md) (planned).

## Setup (5 commands)
```bash
docker compose up -d                                   # MongoDB on localhost:27018
cd backend && npm install && cp .env.example .env      # then put GOOGLE_API_KEY into .env
npm run ingest:all                                     # ingest both tenants (OCR for the scan)
npm run ask -- --tenant alvery "Which modules have a pin stroke of at least 30 mm?"
npm run eval                                           # 27 initial questions, table + accuracy
```
Other: `npm test` (no API key needed; needs MongoDB) · `npm start` (API :4000) · `cd frontend && npm install && npm run dev` (UI :5173).

## Extra: upload dashboard
In the UI open the **Documents** tab to add PDFs to an existing or new client without the CLI (calls `POST /api/documents`, same ingestion pipeline; progress per file streams live over SSE with polling fallback). No auth yet – see `docs/architecture-part-b.md` §4a.

## Status
Part A is implemented. **Eval results, failure analysis and the AI-usage section are not filled in yet** – they require a Gemini key and a live run (see "Open items" in the Part A doc). Tests (unit + tenant isolation against real MongoDB) pass: 18/18.
