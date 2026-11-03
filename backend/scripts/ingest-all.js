// Data injection script: `npm run ingest:all` loads every tenant folder in resource/data into MongoDB.
import { IngestCommand } from '../src/cli/ingest.js';
import { closeDb } from '../src/db/connection.js';

try {
  await new IngestCommand().ingestAll();
} finally {
  await closeDb();
}
