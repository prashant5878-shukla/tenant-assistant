export default function AnswerCard({ result }) {
  const notCovered = result.status === 'NOT_IN_DOCUMENTS';
  return (
    <article className={`card ${notCovered ? 'abstain' : ''}`}>
      <h3>{result.question}</h3>
      {notCovered && <span className="badge">Not in the documents</span>}
      <p className="answer">{result.answer}</p>
      {result.conflicts?.length > 0 && (
        <div className="conflicts">
          <strong>Heads-up</strong>
          <ul>{result.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {result.sources?.length > 0 && (
        <div className="sources">
          <strong>Sources</strong>
          <ul>{result.sources.map((s) => <li key={`${s.file}#${s.page}`}>{s.file} <span className="muted">p. {s.page}</span></li>)}</ul>
        </div>
      )}
      <footer className="muted">{result.latencyMs} ms · ${result.usage?.costUsd}</footer>
    </article>
  );
}
