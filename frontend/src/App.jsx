import { useEffect, useState } from 'react';
import { api } from './services/api.js';
import { useChat } from './hooks/useChat.js';
import TopBar from './components/TopBar.jsx';
import ChatView from './components/ChatView.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import DocumentTable from './components/DocumentTable.jsx';

export default function App() {
  const [tenants, setTenants] = useState([]);
  const [tenant, setTenant] = useState('');
  const [view, setView] = useState('chat'); // chat | docs
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [docsVersion, setDocsVersion] = useState(0);
  const { messages, add, clear } = useChat(tenant);

  const loadTenants = (select) =>
    api.tenants().then((t) => { setTenants(t); setTenant((cur) => select ?? (cur || t[0] || '')); }).catch((e) => setError(e.message));
  useEffect(() => { loadTenants(); }, []);

  function switchTenant(t) { // each client has its own chat window
    setTenant(t);
    setError('');
    setView('chat');
  }

  async function onSend(question) {
    const t = tenant; // keep the answer in the chat it was asked in, even if the client is switched meanwhile
    setError('');
    add(t, { role: 'user', text: question });
    setLoading(true);
    try {
      const result = await api.ask(t, question);
      add(t, { role: 'assistant', result });
    } catch (e) {
      add(t, { role: 'assistant', error: true, text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function onUploaded(uploadedTenant) {
    await loadTenants(uploadedTenant);
    setDocsVersion((v) => v + 1);
  }

  return (
    <div className="app">
      <TopBar tenants={tenants} tenant={tenant} onTenantChange={switchTenant} view={view} onView={setView} />
      <main className="main">
        {view === 'chat' ? (
          <ChatView tenant={tenant} messages={messages} loading={loading} error={error} onSend={onSend} onClear={() => { clear(tenant); setError(''); }} />
        ) : (
          <div className="docs-page">
            <header className="page-title">
              <h1>Documents</h1>
              <p className="muted">Manage what the assistant knows about <strong>{tenant || 'a client'}</strong>.</p>
            </header>
            <UploadPanel tenants={tenants} defaultTenant={tenant} onUploaded={onUploaded} />
            <DocumentTable tenant={tenant} version={docsVersion} onChanged={() => setDocsVersion((v) => v + 1)} />
          </div>
        )}
      </main>
    </div>
  );
}
