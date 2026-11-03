import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function DocumentList({ tenant, version = 0 }) {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    if (!tenant) return;
    api.documents(tenant).then(setDocs).catch(() => setDocs([]));
  }, [tenant, version]);
  return (
    <div>
      <h2>Indexed documents ({docs.length})</h2>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
