import { useState } from 'react';

export default function AskForm({ onAsk, disabled, loading }) {
  const [q, setQ] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length > 1) onAsk(q.trim());
  };
  return (
    <form onSubmit={submit} className="ask">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which modules have a pin stroke of at least 30 mm?" maxLength={1000} />
      <button disabled={disabled || q.trim().length < 2}>{loading ? 'Searching…' : 'Ask'}</button>
    </form>
  );
}
