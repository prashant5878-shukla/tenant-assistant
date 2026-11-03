import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function DocumentList({ tenant, version = 0, editable = false, onChanged }) {
  const [docs, setDocs] = useState([]);
  const [confirming, setConfirming] = useState(null); // fileName awaiting the second click
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.documents(tenant).then(setDocs).catch(() => setDocs([]));
  useEffect(() => {
    if (tenant) load();
    setConfirming(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, version]);

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
    <div className="panel">
      <h2>Indexed documents <span className="count">{docs.length}</span></h2>
      {editable && <p className="muted hint">To update a document: delete it, then upload the new file. (Uploading a changed file with the same name also replaces it.)</p>}
      {error && <p className="error">{error}</p>}
      <ul className="docs">
        {docs.map((d) => (
          <li key={d.fileName} className={d.status}>
            <div className="name">{d.fileName}</div>
            <div className="tags">
              <span className="tag type">{d.docType}</span>
              <span className="tag">{d.pageCount} p</span>
              {d.effectiveDate && <span className="tag">{d.effectiveDate}</span>}
              {d.status === 'superseded' && <span className="tag warn">superseded</span>}
              {d.ocrPages?.length > 0 && <span className="tag ok">OCR</span>}
              {d.pagesWithoutText?.length > 0 && <span className="tag warn">no text layer</span>}
            </div>
            {editable && (
              <div className="actions">
                {confirming === d.fileName ? (
                  <>
                    <button className="danger" disabled={busy === d.fileName} onClick={() => remove(d.fileName)}>{busy === d.fileName ? 'Deleting…' : 'Confirm delete'}</button>
                    <button onClick={() => setConfirming(null)}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirming(d.fileName)}>Delete</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!docs.length && <p className="muted">No documents yet for this client.</p>}
    </div>
  );
}
