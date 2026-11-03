import { useState } from 'react';
import { SendIcon } from './icons.jsx';

const SUGGESTIONS = {
  alvery: [
    'Which modules have a pin stroke of at least 30 mm?',
    'What do 12 AutoForm Mini cost?',
    'How long is the warranty on a FormBed e?',
    'Does Alvery offer magnetic clamping?',
  ],
  nordhaven: ['Which pump can deliver 300 m³/h?', 'What is the maintenance interval of the NP-200?'],
};

export default function AskForm({ tenant, onAsk, disabled, loading }) {
  const [q, setQ] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length > 1) onAsk(q.trim());
  };
  return (
    <>
      <form onSubmit={submit} className="composer">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${tenant || 'a client'}'s products…`} maxLength={1000} aria-label="Question" />
        <button className="send" disabled={disabled || q.trim().length < 2}>
          {loading ? <><span className="spinner" />Searching</> : <>Ask <SendIcon /></>}
        </button>
      </form>
      <div className="chips">
        {(SUGGESTIONS[tenant] ?? []).map((s) => (
          <button key={s} type="button" className="chip" disabled={disabled} onClick={() => { setQ(s); onAsk(s); }}>{s}</button>
        ))}
      </div>
    </>
  );
}
