import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useJobProgress } from '../hooks/useJobProgress.js';
import { UploadIcon } from './icons.jsx';

const NEW = '__new__';
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;

export default function UploadPanel({ tenants, defaultTenant, onUploaded }) {
  const [choice, setChoice] = useState(defaultTenant || NEW);
  const [newId, setNewId] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [over, setOver] = useState(false);
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
    <form onSubmit={submit} className="panel upload">
      <h2>Add documents</h2>
      <label className="field">Client
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
          <option value={NEW}>+ New client…</option>
        </select>
      </label>
      {choice === NEW && (
        <label className="field">New client id
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="e.g. acme" />
          {newId && !ID_RE.test(newId.trim().toLowerCase()) && <span className="error">Lowercase letters, digits, - or _ (2-41 chars)</span>}
        </label>
      )}
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
      >
        <UploadIcon />
        <p><strong>Drop PDFs here</strong> or <button type="button" className="browse" onClick={() => input.current?.click()}>browse</button></p>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => pick(e.target.files)} />
        {files.length > 0 && (
          <ul className="filelist">{files.map((f) => <li key={f.name}><span>{f.name}</span><span className="muted">{Math.round(f.size / 1024)} KB</span></li>)}</ul>
        )}
      </div>
      <p className="muted">Added to <strong>{tenant || '…'}</strong> only. A newer revision supersedes the older one; unchanged files are skipped; scans are OCR&apos;d.</p>
      <button className="primary" disabled={!valid || busy}>{busy ? <><span className="spinner" />Ingesting…</> : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button>
      {error && <p className="error">{error}</p>}
      {job && (
        <div className="job">
          <div className="job-head"><span>Ingestion</span><span>{job.status === 'running' ? 'running…' : job.status}</span></div>
          {job.error && <div className="job-row"><span className="error">{job.error}</span></div>}
          {job.files.map((f) => {
            const r = f.result ?? {};
            const note = [r.error, r.ocrPages?.length && `OCR on page ${r.ocrPages}`, r.noTextPages?.length && `no text layer on page ${r.noTextPages}`].filter(Boolean).join(' · ');
            return (
              <div key={f.name} className="job-row">
                <span className="fname">{f.name}</span>
                <span className={`state ${f.status}`}>{f.status === 'running' ? <><span className="spinner" />{f.stage ?? 'starting'}</> : f.status}</span>
                {note && <span className="note">{note}</span>}
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}
