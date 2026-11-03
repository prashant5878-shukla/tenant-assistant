export default function TenantSelect({ tenants, value, onChange }) {
  return (
    <label className="tenant">
      Client
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}
