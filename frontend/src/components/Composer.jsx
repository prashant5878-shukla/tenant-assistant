import { useEffect, useRef, useState } from 'react';
import { SendIcon } from './icons.jsx';

export default function Composer({ tenant, disabled, loading, onSend }) {
  const [text, setText] = useState('');
  const ref = useRef();

  useEffect(() => { // auto-grow up to ~6 lines
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const canSend = !disabled && text.trim().length > 1;
  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={1000}
          aria-label="Question"
          placeholder={`Message LeadLane about ${tenant || 'a client'}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send-round" onClick={submit} disabled={!canSend} aria-label="Send">
          {loading ? <span className="spinner" /> : <SendIcon />}
        </button>
      </div>
      <p className="footnote">Answers come only from {tenant || 'the client'}&apos;s documents. Each question is answered on its own. Check sources before quoting.</p>
    </div>
  );
}
