import { Command } from 'commander';
import path from 'node:path';
import { connectDb, closeDb, ensureIndexes } from '../db/connection.js';
import { IngestCommand } from './ingest.js';
import { askService } from '../services/askService.js';
import { EvalRunner } from '../eval/runner.js';
import { documentsRepo } from '../db/repositories.js';
import { IngestionPipeline } from '../ingestion/pipeline.js';
import { assertTenant } from '../db/tenantGuard.js';

/** Command line front-end: `ask`, `ingest`, `eval`, `docs`. */
class Cli {
  constructor() {
    this.program = new Command().name('leadlane').description('LeadLane product assistant');
    this.#register();
  }

  #register() {
    this.program
      .command('ask <question>')
      .requiredOption('--tenant <tenant>', 'tenant id, e.g. alvery')
      .option('--json', 'print raw JSON')
      .action((question, o) => this.#run(async () => {
        const r = await askService.ask({ tenant: o.tenant, question });
        if (o.json) return console.log(JSON.stringify(r, null, 2));
        console.log(`\n${r.answer}\n`);
        if (r.conflicts.length) console.log(`Conflicts / notes:\n${r.conflicts.map((c) => ` - ${c}`).join('\n')}\n`);
        console.log(r.sources.length ? `Sources:\n${r.sources.map((s) => ` - ${s.file}, page ${s.page}`).join('\n')}` : 'Sources: none (not in the documents)');
        console.log(`\n[${r.status} | ${r.latencyMs} ms | $${r.usage.costUsd}]`);
      }));

    this.program
      .command('ingest [dir]')
      .description('Ingest PDFs. Without dir: every tenant folder under resource/data')
      .option('--tenant <tenant>', 'tenant id (required with dir)')
      .action((dir, o) => this.#run(async () => {
        if (!dir) return new IngestCommand(new IngestionPipeline()).ingestAll();
        if (!o.tenant) throw new Error('--tenant is required when a directory is given');
        await ensureIndexes();
        await new IngestCommand().ingestTenant(assertTenant(o.tenant), path.resolve(dir));
      }));

    this.program
      .command('eval')
      .description('Run the public evaluation questions')
      .option('--phase <phase>', 'initial | after_update', 'initial')
      .option('--fresh', 'ignore the cache')
      .option('--only <ids>', 'comma separated question ids')
      .action((o) => this.#run(() => new EvalRunner().run({ phase: o.phase, fresh: o.fresh, only: o.only?.split(',') })));

    this.program
      .command('docs')
      .requiredOption('--tenant <tenant>')
      .description('List ingested documents of a tenant')
      .action((o) => this.#run(async () => {
        for (const d of await documentsRepo.list(o.tenant)) {
          console.log(`${d.status.padEnd(10)} ${String(d.effectiveDate ?? '-').padEnd(11)} ${d.docType.padEnd(10)} p${d.pageCount} ${d.fileName}${d.pagesWithoutText?.length ? '  [NO TEXT LAYER]' : ''}${d.ocrPages?.length ? '  [OCR]' : ''}`);
        }
      }));
  }

  async #run(fn) {
    try {
      await connectDb();
      await fn();
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closeDb();
    }
  }

  parse(argv) {
    return this.program.parseAsync(argv);
  }
}

await new Cli().parse(process.argv);
