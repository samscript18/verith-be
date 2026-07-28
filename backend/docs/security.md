# Security

Phase 1 enforces exact-origin CORS, Helmet, bounded JSON and URL-encoded bodies, strict DTO validation, sanitized request IDs, redacted structured logs, non-root containers, and safe error envelopes.

`TRUST_PROXY` is disabled by default and must be enabled only behind a trusted deployment proxy. Swagger can be disabled in production. MongoDB and Redis credentials must be supplied through the deployment secret store.

Authentication, SSRF protection, webhook signatures, upload verification, and provider-specific controls are implemented in their designated phases and are not claimed complete.
