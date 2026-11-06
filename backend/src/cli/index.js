#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { connectDb, closeDb, ensureIndexes } from '../db/connection.js';
import { IngestCommand } from './ingest.js';
import { askService } from '../services/askService.js';
import { EvalRunner } from '../eval/runner.js';
import { documentsRepo } from '../db/repositories.js';
import { IngestionPipeline } from '../ingestion/pipeline.js';
import { assertTenant } from '../db/tenantGuard.js';

/**
 * Command line front-end. The tenant can be part of the command:
 *   leadlane alvery ask which modules have a pin stroke of at least 30 mm
 *   leadlane ask alvery "What do 12 AutoForm Mini cost?"
 *   leadlane ask --tenant alvery "..."          (older form, still works)
 */
class Cli {
  /** Commands that may be written tenant-first: `<tenant> <command> ...`. */
  static TENANT_FIRST = ['ask', 'docs', 'ingest'];

  constructor() {
    this.program = new Command().name('leadlane').description('LeadLane product assistant');
    this.#register();
  }

  #register() {
    this.program
      .command('ask <words...>')
      .description('Ask a question. Usage: ask <tenant> <message...>   (or: <tenant> ask <message...>)')
      .option('--tenant <tenant>', 'give the tenant as an option instead of the first word')
      .option('--json', 'print raw JSON')
      .addHelpText(
        'after',
        '\nExamples:\n  leadlane alvery ask which modules have a pin stroke of at least 30 mm\n  leadlane ask alvery "What do 12 AutoForm Mini cost?"\n  leadlane ask --tenant alvery "Does Alvery offer magnetic clamping?"\n\nQuote the message if it contains ? * or other shell characters.',
      )
      .action((words, o) => this.#run(async () => {
        const tenant = o.tenant ?? words.shift();
        const question = words.join(' ').trim();
        if (!tenant || !question) throw new Error('Usage: ask <tenant> <message...>');
        const r = await askService.ask({ tenant, question });
        if (o.json) return console.log(JSON.stringify(r, null, 2));
        console.log(`\n${r.answer}\n`);
        if (r.conflicts.length) console.log(`Conflicts / notes:\n${r.conflicts.map((c) => ` - ${c}`).join('\n')}\n`);
        console.log(r.sources.length ? `Sources:\n${r.sources.map((s) => ` - ${s.file}, page ${s.page}`).join('\n')}` : 'Sources: none (not in the documents)');
        console.log(`\n[${r.status} | ${r.latencyMs} ms | $${r.usage.costUsd}]`);
      }));

    this.program
      .command('ingest [args...]')
      .description('Ingest PDFs. No args: every tenant under resource/data. Usage: ingest <tenant> <dir>   (or: <tenant> ingest <dir>)')
      .option('--tenant <tenant>', 'tenant id (alternative to the first argument)')
      .action((args, o) => this.#run(async () => {
        if (!args.length && !o.tenant) return new IngestCommand(new IngestionPipeline()).ingestAll();
        const tenant = o.tenant ?? args.shift();
        const dir = args[0];
        if (!dir) throw new Error('Usage: ingest <tenant> <dir>');
        await ensureIndexes();
        await new IngestCommand().ingestTenant(assertTenant(tenant), path.resolve(dir));
      }));

    this.program
      .command('eval')
      .description('Run the public evaluation questions')
      .option('--phase <phase>', 'initial | after_update', 'initial')
      .option('--fresh', 'ignore the cache')
      .option('--only <ids>', 'comma separated question ids')
      .action((o) => this.#run(() => new EvalRunner().run({ phase: o.phase, fresh: o.fresh, only: o.only?.split(',') })));

    this.program
      .command('docs [tenant]')
      .option('--tenant <tenant>')
      .description('List ingested documents of a tenant. Usage: docs <tenant>   (or: <tenant> docs)')
      .action((tenantArg, o) => this.#run(async () => {
        const tenant = o.tenant ?? tenantArg;
        if (!tenant) throw new Error('Usage: docs <tenant>');
        for (const d of await documentsRepo.list(tenant)) {
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

  /** `leadlane alvery ask ...` -> `leadlane ask alvery ...` when the first word is not a command. */
  #normalize(argv) {
    const [node, script, first, second, ...rest] = argv;
    const commands = this.program.commands.map((c) => c.name());
    const tenantFirst = first && !first.startsWith('-') && !commands.includes(first) && Cli.TENANT_FIRST.includes(second);
    return tenantFirst ? [node, script, second, first, ...rest] : argv;
  }

  parse(argv) {
    return this.program.parseAsync(this.#normalize(argv));
  }
}

await new Cli().parse(process.argv);
