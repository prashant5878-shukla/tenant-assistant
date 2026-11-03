import { useEffect, useState } from 'react';
import { api } from './services/api.js';
import TenantSelect from './components/TenantSelect.jsx';
import AskForm from './components/AskForm.jsx';
import AnswerCard, { AnswerSkeleton } from './components/AnswerCard.jsx';
import { SparkIcon } from './components/icons.jsx';
import DocumentList from './components/DocumentList.jsx';
import UploadPanel from './components/UploadPanel.jsx';

export default function App() {
  const [tenants, setTenants] = useState([]);
  const [tenant, setTenant] = useState('');
  const [history, setHistory] = useState([]); // newest first
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ask');
  const [docsVersion, setDocsVersion] = useState(0); // bump to reload the document list after an upload

  const loadTenants = (select) =>
    api.tenants().then((t) => { setTenants(t); setTenant((cur) => select ?? (cur || t[0] || '')); }).catch((e) => setError(e.message));
  useEffect(() => { loadTenants(); }, []);

  async function onUploaded(uploadedTenant) {
    await loadTenants(uploadedTenant);
    setDocsVersion((v) => v + 1);
  }

  const onTenantChange = (t) => { setTenant(t); setHistory([]); }; // never mix answers of different clients on screen

  async function onAsk(question) {
    setLoading(true);
    setError('');
    try {
      const result = await api.ask(tenant, question);
      setHistory((h) => [result, ...h]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><SparkIcon /></span>
          <span>LeadLane<small>Product assistant</small></span>
        </div>
        <nav className="segmented" aria-label="View">
          <button className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>Ask</button>
          <button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>Documents</button>
        </nav>
        <TenantSelect tenants={tenants} value={tenant} onChange={onTenantChange} />
      </header>

      {tab === 'docs' ? (
        <div className="grid">
          <UploadPanel tenants={tenants} defaultTenant={tenant} onUploaded={onUploaded} />
          <DocumentList tenant={tenant} version={docsVersion} editable onChanged={() => setDocsVersion((v) => v + 1)} />
        </div>
      ) : (
        <div className="grid">
          <section>
            <div className="hero">
              <h2>Ask anything about {tenant || 'your client'}</h2>
              <p>Answers come only from the client&apos;s documents, with sources.</p>
            </div>
            <AskForm tenant={tenant} disabled={!tenant || loading} loading={loading} onAsk={onAsk} />
            {error && <p className="error">{error}</p>}
            <div className="answers">
              {loading && <AnswerSkeleton />}
              {history.map((r, i) => <AnswerCard key={history.length - i} result={r} />)}
            </div>
          </section>
          <DocumentList tenant={tenant} version={docsVersion} />
        </div>
      )}
    </div>
  );
}
