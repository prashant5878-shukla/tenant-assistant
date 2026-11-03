import { useEffect, useRef } from 'react';
import { UserMessage, AssistantMessage, ThinkingMessage, ErrorMessage } from './Message.jsx';
import Composer from './Composer.jsx';
import { SparkIcon, TrashIcon } from './icons.jsx';

const SUGGESTIONS = {
  alvery: [
    'Which modules have a pin stroke of at least 30 mm?',
    'What do 12 AutoForm Mini cost?',
    'How long is the warranty on a FormBed e?',
    'Does Alvery offer magnetic clamping?',
  ],
  nordhaven: ['Which pump can deliver 300 m³/h?', 'What is the maintenance interval of the NP-200?'],
};

export default function ChatView({ tenant, messages, loading, error, onSend, onClear }) {
  const end = useRef();

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, loading]);

  return (
    <div className="chat">
      <div className="chat-head">
        <span>Chat <span className="muted">· {tenant}</span></span>
        <button className="ghost small" onClick={onClear} disabled={loading || (messages.length === 0 && !error)}>
          <TrashIcon /> Clear chat
        </button>
      </div>
      <div className="thread">
        {messages.length === 0 && !loading ? (
          <div className="empty">
            <span className="avatar big"><SparkIcon /></span>
            <h1>What do you want to know about {tenant || 'your client'}?</h1>
            <div className="suggest">
              {(SUGGESTIONS[tenant] ?? []).map((s) => <button key={s} onClick={() => onSend(s)} disabled={!tenant}>{s}</button>)}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (m.role === 'user' ? <UserMessage key={i} text={m.text} /> : m.error ? <ErrorMessage key={i} text={m.text} /> : <AssistantMessage key={i} result={m.result} />))}
            {loading && <ThinkingMessage />}
            {error && <ErrorMessage text={error} />}
          </>
        )}
        <div ref={end} />
      </div>
      <Composer tenant={tenant} disabled={!tenant || loading} loading={loading} onSend={onSend} />
    </div>
  );
}
