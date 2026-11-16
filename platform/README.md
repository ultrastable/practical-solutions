Tenant-agnostic capabilities written here first, then upstreamed to `ultrastable/workers` (see `UPSTREAM-2` in `ps/seed.js`).
Rule: nothing in this directory imports from `ps/` or `worker/`, names a tenant, or holds tenant content. Tenants pass configuration in.
Storage is any object with async `get(key)` and `put(key, value)` (a KV namespace fits).
