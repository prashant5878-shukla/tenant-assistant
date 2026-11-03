async function request(path, options = {}) {
  const isForm = options.body instanceof FormData; // browser sets the multipart boundary itself
  const res = await fetch(path, { ...options, headers: isForm ? undefined : { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  tenants: () => request('/api/tenants').then((r) => r.tenants),
  documents: (tenant) => request(`/api/documents?tenant=${encodeURIComponent(tenant)}`).then((r) => r.documents),
  upload: (tenant, files) => {
    const fd = new FormData();
    fd.append('tenant', tenant); // must precede the files
    files.forEach((f) => fd.append('files', f));
    return request('/api/documents', { method: 'POST', body: fd });
  },
  ask: (tenant, question) => request('/api/ask', { method: 'POST', body: JSON.stringify({ tenant, question }) }),
};
