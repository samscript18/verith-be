# Security

Phase 1 enforces exact-origin CORS, Helmet, bounded JSON and URL-encoded bodies, strict DTO validation, sanitized request IDs, redacted structured logs, non-root containers, and safe error envelopes.

`TRUST_PROXY` is disabled by default and must be enabled only behind a trusted deployment proxy. Swagger can be disabled in production. MongoDB and Redis credentials must be supplied through the deployment secret store.

Production Helmet enables HSTS, CSP, frame restrictions, referrer policy, and
content-type protections. Verith also sends a restrictive Permissions Policy.
CORS uses the validated exact-origin allowlist and never combines wildcard
origins with credentials.

Redis-backed throttling applies globally, with tighter endpoint policies for
authentication, uploads, account exports, public reports, and administrative
reprocessing. Proxy trust must match the actual load-balancer topology so
IP-derived throttling keys cannot be forged.

Production API, worker, and scheduler roles are isolated with `PROCESS_ROLE`.
Provider credentials are available only to roles that require them through the
deployment secret policy.

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
IDs, and returns explanations only after an attempt has been recorded.

# Gamification integrity and privacy

Challenge answer keys follow the same protected projection and recorded-attempt
rules as quizzes. Reward transactions have a unique per-user idempotency
reference and are append-only in normal application flows. Cached totals are
rebuilt from the ledger.

Leaderboards query only active, non-deleted users and exclude users who disabled
leaderboard participation. Transaction history is owner-authenticated.
