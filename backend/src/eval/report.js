import Table from 'cli-table3';

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '-');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export class EvalReporter {
  print(rows) {
    const t = new Table({ head: ['id', 'category', 'tenant', 'result', 'src recall', 'latency', 'cost $', 'note'], colWidths: [6, 15, 11, 8, 11, 9, 10, 60], wordWrap: true });
    for (const r of rows) {
      t.push([r.id, r.category, r.tenant, r.correct ? 'PASS' : 'FAIL', `${Math.round(r.sourceRecall * 100)}%`, r.cached ? 'cached' : `${r.latencyMs}ms`, r.costUsd.toFixed(4), r.correct ? '' : r.reason]);
    }
    console.log(t.toString());

    const ok = rows.filter((r) => r.correct).length;
    console.log(`\nOverall accuracy: ${ok}/${rows.length} (${pct(ok, rows.length)})`);

    const cats = new Table({ head: ['category', 'correct', 'total', 'accuracy'] });
    for (const c of [...new Set(rows.map((r) => r.category))].sort()) {
      const g = rows.filter((r) => r.category === c);
      cats.push([c, g.filter((r) => r.correct).length, g.length, pct(g.filter((r) => r.correct).length, g.length)]);
    }
    console.log(cats.toString());

    const live = rows.filter((r) => !r.cached);
    console.log(`Avg latency/question: ${Math.round(avg(rows.map((r) => r.latencyMs)))} ms | avg cost/question: $${avg(rows.map((r) => r.costUsd)).toFixed(4)} (${live.length} live, ${rows.length - live.length} from cache; cached rows report their original numbers)`);
  }
}
