import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useJobProgress } from '../hooks/useJobProgress.js';
import { UploadIcon, XIcon, FileIcon, CheckIcon, AlertIcon } from './icons.jsx';

const NEW = '__new__';
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;
const MAX_FILES = 20;
const MAX_MB = 25;

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function UploadPanel({ tenants, defaultTenant, onUploaded }) {
  const [choice, setChoice] = useState(defaultTenant || NEW);
  const [newId, setNewId] = useState('');
  const [queue, setQueue] = useState([]); // File[]
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [over, setOver] = useState(false);
  const input = useRef();

  useEffect(() => { if (defaultTenant) setChoice(defaultTenant); }, [defaultTenant]);

  const tenant = choice === NEW ? newId.trim().toLowerCase() : choice;
  const idError = choice === NEW && newId && !ID_RE.test(tenant);
  const canUpload = ID_RE.test(tenant) && queue.length > 0 && !busy;

  const job = useJobProgress(jobId, () => {
    setBusy(false);
    onUploaded(tenant);
  });
  const done = job?.files.filter((f) => ['ingested', 'skipped', 'failed'].includes(f.status)).length ?? 0;
  const pct = job?.files.length ? Math.round((done / job.files.length) * 100) : 0;

  function addFiles(list) {
    const problems = [];
    const next = [...queue];
    for (const f of list) {
      if (!f.name.toLowerCase().endsWith('.pdf')) problems.push(`${f.name}: only PDF files`);
      else if (f.size > MAX_MB * 1048576) problems.push(`${f.name}: larger than ${MAX_MB} MB`);
      else if (next.some((q) => q.name === f.name)) continue;
      else if (next.length >= MAX_FILES) problems.push(`Limit of ${MAX_FILES} files per upload`);
      else next.push(f);
    }
    setQueue(next);
    setNotice(problems.slice(0, 3).join(' · '));
    setJobId(null);
  }

  async function submit() {
    setBusy(true);
    setNotice('');
    try {
      const r = await api.upload(tenant, queue); // 202: ingestion continues in the background
      setJobId(r.jobId);
      setQueue([]);
    } catch (err) {
      setNotice(err.message);
      setBusy(false);
    }
  }

  const totalSize = useMemo(() => queue.reduce((n, f) => n + f.size, 0), [queue]);

  return (
    <section className="upload-card">
      <div className="upload-head">
        <div>
          <h2>Add documents</h2>
          <p className="muted">PDFs only · up to {MAX_FILES} files, {MAX_MB} MB each. Scans are read with OCR.</p>
        </div>
        <div className="target">
          <label htmlFor="target-client">Upload to</label>
          <select id="target-client" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
            {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={NEW}>+ New client…</option>
          </select>
          {choice === NEW && (
            <input className={idError ? 'invalid' : ''} value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="client-id" aria-label="New client id" autoFocus />
          )}
        </div>
      </div>
      {idError && <p className="error">Client id: lowercase letters, digits, - or _ (2–41 characters).</p>}

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
        onClick={() => input.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <span className="dz-icon"><UploadIcon size={26} /></span>
        <p className="dz-title">Drag & drop PDFs here</p>
        <p className="muted">or <span className="link">browse files</span></p>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
      </div>

      {notice && <p className="error">{notice}</p>}

      {queue.length > 0 && (
        <div className="queue">
          {queue.map((f) => (
            <div key={f.name} className="queue-row">
              <span className="file-ico"><FileIcon /></span>
              <span className="qname" title={f.name}>{f.name}</span>
              <span className="muted">{fmtSize(f.size)}</span>
              <button className="icon-btn" onClick={() => setQueue(queue.filter((q) => q !== f))} aria-label={`Remove ${f.name}`} disabled={busy}><XIcon /></button>
            </div>
          ))}
          <div className="queue-foot">
            <span className="muted">{queue.length} file{queue.length > 1 ? 's' : ''} · {fmtSize(totalSize)} → <strong>{tenant || '…'}</strong></span>
            <div>
              <button className="ghost" onClick={() => setQueue([])} disabled={busy}>Clear</button>
              <button className="primary" onClick={submit} disabled={!canUpload}>Upload {queue.length} file{queue.length > 1 ? 's' : ''}</button>
            </div>
          </div>
        </div>
      )}

      {job && (
        <div className="progress-card">
          <div className="progress-top">
            <strong>{job.status === 'running' ? 'Processing…' : job.status === 'done' ? 'Finished' : 'Failed'}</strong>
            <span className="muted">{done} / {job.files.length}</span>
          </div>
          <div className="bar"><div style={{ width: `${job.status === 'done' ? 100 : pct}%` }} /></div>
          {job.error && <p className="error">{job.error}</p>}
          {job.files.map((f) => {
            const r = f.result ?? {};
            const note = [r.error, r.ocrPages?.length && `OCR on page ${r.ocrPages}`, r.noTextPages?.length && `no text layer on page ${r.noTextPages}`, f.status === 'skipped' && 'unchanged, already indexed'].filter(Boolean).join(' · ');
            return (
              <div key={f.name} className="prow">
                <span className={`pstate ${f.status}`}>
                  {f.status === 'running' ? <span className="spinner" /> : f.status === 'ingested' ? <CheckIcon /> : f.status === 'failed' ? <AlertIcon /> : <i className="dot" />}
                </span>
                <div className="pmain">
                  <span className="qname">{f.name}</span>
                  <span className="muted">{f.status === 'running' ? `${f.stage ?? 'starting'}…` : f.status}{note ? ` · ${note}` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
