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
    <div>
      <h2>Indexed documents ({docs.length})</h2>
      {editable && <p className="muted">To update a document: delete it, then upload the new file. (Uploading a changed file with the same name also replaces it.)</p>}
      {error && <p className="error">{error}</p>}
      <ul className="docs">
        {docs.map((d) => (
          <li key={d.fileName} className={d.status}>
            <span>{d.fileName}</span>
            <small>
              {d.docType} · {d.pageCount}p {d.effectiveDate ? `· ${d.effectiveDate}` : ''}
              {d.status === 'superseded' && ' · SUPERSEDED'}
              {d.ocrPages?.length > 0 && ' · OCR'}
              {d.pagesWithoutText?.length > 0 && ' · NO TEXT LAYER'}
            </small>
            {editable && (
              <span className="actions">
                {confirming === d.fileName ? (
                  <>
                    <button className="danger" disabled={busy === d.fileName} onClick={() => remove(d.fileName)}>{busy === d.fileName ? 'Deleting…' : 'Confirm delete'}</button>
                    <button onClick={() => setConfirming(null)}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirming(d.fileName)}>Delete</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
