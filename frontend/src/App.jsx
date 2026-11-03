import { useEffect, useState } from 'react';
import { api } from './services/api.js';
import TenantSelect from './components/TenantSelect.jsx';
import AskForm from './components/AskForm.jsx';
import AnswerCard from './components/AnswerCard.jsx';
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
    <div className="layout">
      <header>
        <h1>LeadLane Product Assistant</h1>
        <TenantSelect tenants={tenants} value={tenant} onChange={onTenantChange} />
      </header>
      <nav className="tabs">
        <button className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>Ask</button>
        <button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>Documents</button>
      </nav>
      {tab === 'docs' ? (
        <main>
          <section><UploadPanel tenants={tenants} defaultTenant={tenant} onUploaded={onUploaded} /></section>
          <aside><DocumentList tenant={tenant} version={docsVersion} /></aside>
        </main>
      ) : (
      <main>
        <section className="chat">
          <AskForm disabled={!tenant || loading} loading={loading} onAsk={onAsk} />
          {error && <p className="error">{error}</p>}
          {history.map((r, i) => <AnswerCard key={history.length - i} result={r} />)}
          {!history.length && !loading && <p className="muted">Ask a question about {tenant || 'a client'}&apos;s product documents.</p>}
        </section>
        <aside><DocumentList tenant={tenant} version={docsVersion} /></aside>
      </main>
      )}
    </div>
  );
}
