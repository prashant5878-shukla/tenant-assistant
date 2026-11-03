import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useJobProgress } from '../hooks/useJobProgress.js';

const NEW = '__new__';
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;

export default function UploadPanel({ tenants, defaultTenant, onUploaded }) {
  const [choice, setChoice] = useState(defaultTenant || NEW);
  const [newId, setNewId] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const input = useRef();

  const job = useJobProgress(jobId, () => {
    setBusy(false);
    onUploaded(tenant);
  });

  useEffect(() => { if (defaultTenant) setChoice(defaultTenant); }, [defaultTenant]);

  const tenant = choice === NEW ? newId.trim().toLowerCase() : choice;
  const valid = ID_RE.test(tenant) && files.length > 0;

  function pick(list) {
    setFiles([...list].filter((f) => f.name.toLowerCase().endsWith('.pdf')));
    setJobId(null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setJobId(null);
    try {
      const r = await api.upload(tenant, files); // 202: ingestion continues in the background
      setJobId(r.jobId);
      setFiles([]);
      if (input.current) input.current.value = '';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="upload">
      <h2>Add documents</h2>
      <label>Client
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
          <option value={NEW}>+ New client…</option>
        </select>
      </label>
      {choice === NEW && (
        <label>New client id
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="e.g. acme" />
          {newId && !ID_RE.test(newId.trim().toLowerCase()) && <small className="error">Lowercase letters, digits, - or _ (2-41 chars)</small>}
        </label>
      )}
      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
        <p>Drag PDFs here or</p>
        <input ref={input} type="file" accept="application/pdf" multiple onChange={(e) => pick(e.target.files)} />
        {files.length > 0 && <ul>{files.map((f) => <li key={f.name}>{f.name} <span className="muted">({Math.round(f.size / 1024)} KB)</span></li>)}</ul>}
      </div>
      <p className="muted">Files are added to <strong>{tenant || '…'}</strong> only. A newer revision of an existing document supersedes the older one; unchanged files are skipped. Scans are OCR&apos;d (takes a moment).</p>
      <button disabled={!valid || busy}>{busy ? 'Ingesting…' : `Upload ${files.length || ''} file(s)`}</button>
      {error && <p className="error">{error}</p>}
      {job && (
        <div>
          <p className="muted">Job {job.status === 'running' ? 'running…' : job.status}{job.error ? `: ${job.error}` : ''}</p>
          <table className="results">
            <thead><tr><th>File</th><th>Status</th><th>Pages</th><th>Notes</th></tr></thead>
            <tbody>
              {job.files.map((f) => {
                const r = f.result ?? {};
                return (
                  <tr key={f.name} className={f.status}>
                    <td>{f.name}</td>
                    <td>{f.status === 'running' ? `${f.stage ?? 'starting'}…` : f.status}</td>
                    <td>{r.pages ?? ''}</td>
                    <td>{[r.error, r.ocrPages?.length && `OCR p${r.ocrPages}`, r.noTextPages?.length && `no text layer p${r.noTextPages}`].filter(Boolean).join('; ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
