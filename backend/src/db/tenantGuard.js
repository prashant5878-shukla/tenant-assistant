/**
 * Single choke point for tenant isolation at the data layer.
 * Every repository function calls assertTenant() and builds its filter via tenantFilter(),
 * so there is no code path that reads chunks/documents without a tenant predicate.
 */
const TENANT_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;

export function assertTenant(tenant) {
  if (typeof tenant !== 'string' || !TENANT_RE.test(tenant)) {
    throw new Error(`Invalid or missing tenant: ${JSON.stringify(tenant)}`);
  }
  return tenant;
}

export function tenantFilter(tenant, extra = {}) {
  // `tenant` is written last so a caller can never override it through `extra`.
  return { ...extra, tenant: assertTenant(tenant) };
}
