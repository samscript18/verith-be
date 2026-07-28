# Security

Phase 1 enforces exact-origin CORS, Helmet, bounded JSON and URL-encoded bodies, strict DTO validation, sanitized request IDs, redacted structured logs, non-root containers, and safe error envelopes.

`TRUST_PROXY` is disabled by default and must be enabled only behind a trusted deployment proxy. Swagger can be disabled in production. MongoDB and Redis credentials must be supplied through the deployment secret store.

## SSRF protection

All application-controlled URL retrieval goes through `SafeFetchService`; controllers and pipeline handlers never call arbitrary URLs directly. The service validates protocols, standard ports, credentials, hostnames, DNS answers, IP ranges, redirect targets, response content types, size, and timeout. It pins each connection to a DNS answer that was already validated, preventing a second unvalidated lookup from bypassing the network policy.

Loopback, RFC1918, carrier-grade NAT, link-local, benchmark, multicast/reserved IPv4, IPv6 loopback, unique-local, link-local, localhost names, and cloud metadata addresses are rejected. Every redirect is resolved and validated again.

Webhook signature controls will be implemented with their owning integration phase and are not claimed complete.
# Learning content and answer security

Learning write and publication routes require `CONTENT_EDITOR`, `ADMIN`, or
`SUPER_ADMIN`. Public catalog reads select published content only. Lesson HTML
is sanitized before persistence with a narrow markup/HTTPS-link allowlist.

Quiz answer keys and explanations are never serialized by normal quiz-read
routes. Scoring loads the protected server document, validates submitted option
IDs, and returns explanations only after an attempt has been persisted.
