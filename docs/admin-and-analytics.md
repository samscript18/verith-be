# Admin and Analytics

Administrative APIs are protected by access JWTs and role checks. `ADMIN` and
`SUPER_ADMIN` may inspect users and verification lifecycle metadata. Only
`SUPER_ADMIN` may change roles or read the audit trail.

## Operations

- `GET /api/v1/admin/users` searches safe user fields with cursor pagination.
- `GET /api/v1/admin/users/:id` returns account state and the active-session
  count; password and token material are never selected.
- `PATCH /api/v1/admin/users/:id/status` changes account state. Suspension,
  disabling, and deletion revoke active sessions.
- `PATCH /api/v1/admin/users/:id/role` is super-admin only, prevents self-role
  changes, and revokes sessions after a privilege change.
- `GET /api/v1/admin/verifications` exposes lifecycle metadata but excludes
  submitted input.
- `POST /api/v1/admin/verifications/:id/retry` accepts only failed or cancelled
  records and uses a deterministic BullMQ job ID.
- `GET /api/v1/admin/audit-logs` is super-admin only and cursor paginated.
- `GET /api/v1/admin/analytics/overview` computes 30-day user, verification,
  and provider-execution aggregates from MongoDB.

## Suspended and disabled accounts

`SUSPENDED` represents a temporary moderation hold while an account or incident
is reviewed. `DISABLED` represents an administrative deactivation intended to
remain in place until an administrator deliberately restores the account. The
current enforcement is intentionally identical for both states: active sessions
are revoked immediately, protected requests are rejected, and new login is
blocked. Neither state currently has an automatic expiry; an administrator can
return either one to `ACTIVE` with an audited status change.

Every sensitive mutation requires a human-readable reason of 10–1000
characters. Audit records contain only safe before/after state, are append-only
through the application API, and are indexed by actor, resource, and action.

Provider health remains available through the protected AI and search health
routes. Those routes return operational/configuration states and never expose
API keys. Service liveness and MongoDB/Redis readiness remain available through
the health module.

Analytics are computed from stored records. Empty collections produce zero
rates; unavailable dimensions are explicitly marked unavailable rather than
synthesized. Provider cost is currently unavailable because no normalized cost
record is stored.
