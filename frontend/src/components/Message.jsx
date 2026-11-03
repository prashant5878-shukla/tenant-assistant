import { useState } from 'react';
import { SparkIcon, CheckIcon, AlertIcon, CopyIcon } from './icons.jsx';

export function UserMessage({ text }) {
  return (
    <div className="msg user">
      <div className="bubble">{text}</div>
    </div>
  );
}

export function AssistantMessage({ result }) {
  const [copied, setCopied] = useState(false);
  const notCovered = result.status === 'NOT_IN_DOCUMENTS';

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="msg assistant">
      <span className="avatar"><SparkIcon /></span>
      <div className="body">
        {notCovered
          ? <span className="badge warn"><AlertIcon /> Not in the documents</span>
          : null}
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
        <div className="msg-actions">
          <button onClick={copy} aria-label="Copy answer">{copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}</button>
          <span>{(result.latencyMs / 1000).toFixed(1)} s · ${result.usage?.costUsd}</span>
        </div>
      </div>
    </div>
  );
}

export function ThinkingMessage() {
  return (
    <div className="msg assistant" aria-busy="true" aria-label="Searching documents">
      <span className="avatar"><SparkIcon /></span>
      <div className="body"><div className="typing"><i /><i /><i /></div></div>
    </div>
  );
}

export function ErrorMessage({ text }) {
  return (
    <div className="msg assistant">
      <span className="avatar"><AlertIcon /></span>
      <div className="body"><p className="error">{text}</p></div>
    </div>
  );
}
