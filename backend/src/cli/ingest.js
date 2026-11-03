import path from 'node:path';
import fs from 'node:fs/promises';
import Table from 'cli-table3';
import { config } from '../config/index.js';
import { connectDb, ensureIndexes } from '../db/connection.js';
import { IngestionPipeline } from '../ingestion/pipeline.js';

export class IngestCommand {
  constructor(pipeline = new IngestionPipeline()) {
    this.pipeline = pipeline;
  }

  async ingestTenant(tenant, dir) {
    const summary = await this.pipeline.ingestDirectory({ tenant, dir });
    const table = new Table({ head: ['file', 'status', 'pages', 'chunks', 'notes'] });
    for (const r of summary.results) {
      const notes = [r.error, r.noTextPages?.length && `NO TEXT LAYER p${r.noTextPages}`, r.ocrPages?.length && `OCR p${r.ocrPages}`].filter(Boolean).join('; ');
      table.push([r.file, r.status, r.pages ?? '', r.chunks ?? '', notes]);
    }
    console.log(`\nTenant: ${tenant}\n${table}`);
    return summary;
  }

  /** Every tenant folder under <resource>/data. */
  async ingestAll() {
    await connectDb();
    await ensureIndexes();
    const dataDir = path.join(config.RESOURCE_DIR, 'data');
    const tenants = (await fs.readdir(dataDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    const out = [];
    for (const tenant of tenants) out.push(await this.ingestTenant(tenant, path.join(dataDir, tenant)));
    return out;
  }
}
