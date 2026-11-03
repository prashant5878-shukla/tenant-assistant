import { CheckIcon, AlertIcon } from './icons.jsx';

export default function AnswerCard({ result }) {
  const notCovered = result.status === 'NOT_IN_DOCUMENTS';
  return (
    <article className={`card ${notCovered ? 'abstain' : ''}`}>
      <div className="q">{result.question}</div>
      {notCovered
        ? <span className="badge warn"><AlertIcon /> Not in the documents</span>
        : <span className="badge ok"><CheckIcon /> Answered from documents</span>}
      <p className="answer">{result.answer}</p>
      {result.conflicts?.length > 0 && (
        <div className="callout">
          <strong>Heads-up: check before quoting</strong>
          <ul>{result.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {result.sources?.length > 0 && (
        <div className="sources">
          <span>Sources</span>
          <div className="source-list">
            {result.sources.map((s) => <div key={`${s.file}#${s.page}`} className="source" title={s.file}><b>p. {s.page}</b><span>{s.file}</span></div>)}
          </div>
        </div>
      )}
      <div className="meta">
        <span>{(result.latencyMs / 1000).toFixed(1)} s</span>
        <span>${result.usage?.costUsd}</span>
      </div>
    </article>
  );
}

export function AnswerSkeleton() {
  return (
    <article className="card skeleton" aria-busy="true" aria-label="Searching documents">
      <div className="line" style={{ width: '40%' }} />
      <div className="line" style={{ width: '92%' }} />
      <div className="line" style={{ width: '78%' }} />
    </article>
  );
}
