import { SparkIcon, ChatIcon, FileIcon } from './icons.jsx';

export default function TopBar({ tenants, tenant, onTenantChange, view, onView }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><SparkIcon /></span>
        <span className="brand-text">LeadLane<small>Product assistant</small></span>
      </div>

      <nav className="tabs" aria-label="View">
        <button className={view === 'chat' ? 'on' : ''} onClick={() => onView('chat')}><ChatIcon /> Chat</button>
        <button className={view === 'docs' ? 'on' : ''} onClick={() => onView('docs')}><FileIcon /> Documents</button>
      </nav>

      <label className="client-pick">
        <span>Client</span>
        <select value={tenant} onChange={(e) => onTenantChange(e.target.value)} disabled={!tenants.length}>
          {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
    </header>
  );
}
