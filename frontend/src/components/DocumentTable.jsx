import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { SearchIcon, TrashIcon } from './icons.jsx';

const FILTERS = [
  ['all', 'All'],
  ['current', 'Current'],
  ['superseded', 'Superseded'],
  ['attention', 'Needs attention'],
];

export default function DocumentTable({ tenant, version = 0, onChanged }) {
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.documents(tenant).then((d) => { setDocs(d); setLoaded(true); }).catch(() => { setDocs([]); setLoaded(true); });
  useEffect(() => {
    setLoaded(false);
    if (tenant) load();
    setConfirming(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, version]);

  const attention = (d) => d.pagesWithoutText?.length > 0;
  const shown = useMemo(() => docs.filter((d) => {
    if (q && !d.fileName.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'current') return d.status === 'current';
    if (filter === 'superseded') return d.status === 'superseded';
    if (filter === 'attention') return attention(d);
    return true;
  }), [docs, q, filter]);

  async function remove(fileName) {
    setBusy(fileName); setError('');
    try {
      await api.deleteDocument(tenant, fileName);
      setConfirming(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <div>
          <h2>Indexed documents <span className="count">{docs.length}</span></h2>
          <p className="muted">To update a document, delete it and upload the new file (a changed file with the same name replaces it).</p>
        </div>
        <label className="search">
          <SearchIcon />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents" />
        </label>
      </div>

      <div className="filters" role="tablist">
        {FILTERS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="dtable" role="table">
        <div className="drow dhead" role="row">
          <span>Name</span><span>Type</span><span>Pages</span><span>Date</span><span>Status</span><span />
        </div>
        {shown.map((d) => (
          <div key={d.fileName} className={`drow ${d.status}`} role="row">
            <span className="dname" title={d.fileName}>{d.fileName}</span>
            <span><span className="tag type">{d.docType}</span></span>
            <span className="muted">{d.pageCount}</span>
            <span className="muted">{d.effectiveDate ?? '–'}</span>
            <span className="tags">
              {d.status === 'superseded' ? <span className="tag warn">superseded</span> : <span className="tag ok">current</span>}
              {d.ocrPages?.length > 0 && <span className="tag">OCR</span>}
              {attention(d) && <span className="tag warn">no text layer</span>}
            </span>
            <span className="dact">
              {confirming === d.fileName ? (
                <>
                  <button className="danger-btn" disabled={busy === d.fileName} onClick={() => remove(d.fileName)}>{busy === d.fileName ? 'Deleting…' : 'Delete'}</button>
                  <button className="ghost small" onClick={() => setConfirming(null)}>Cancel</button>
                </>
              ) : (
                <button className="icon-btn danger-hover" onClick={() => setConfirming(d.fileName)} aria-label={`Delete ${d.fileName}`}><TrashIcon /></button>
              )}
            </span>
          </div>
        ))}
        {loaded && shown.length === 0 && <p className="empty-row muted">{docs.length ? 'No documents match your filter.' : `No documents for ${tenant || 'this client'} yet. Drop some PDFs above.`}</p>}
      </div>
    </section>
  );
}
