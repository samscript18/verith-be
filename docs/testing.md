# Testing

Unit tests use Jest and Nest testing utilities. E2E tests use Supertest. Integration tests use real MongoDB, Redis, and BullMQ. Test doubles are permitted only at external boundaries, including AI generation and remotely hosted article responses.

Live provider tests are isolated behind `npm run test:external` and explicit environment flags. Normal CI never sends real email or WhatsApp messages and never consumes external AI/search quota. Phase 7 integration coverage uses deterministic AI, search, and page-retrieval boundaries to prove evidence persistence and duplicate lineage. Router coverage verifies primary-search-to-Wikipedia fallback; unsafe URLs remain covered without a network call.

Phase 8 extends the deterministic integration boundary through evidence
relationship validation, claim evaluation, recorded confidence factors,
overall verdict/risk calculation, and publisher discovery. Assertions verify
that a duplicate page does not become a second independent confidence source.

Phase 9 contract tests verify the Gemini inline-image request, Groq verbose
segment transcription request and quality proxy, missing transcription
configuration, and strict Cloudinary delivery-namespace validation. Normal
tests never upload media or call paid providers.

Phase 10 integration coverage completes a verification through report
validation, checks citation persistence, renders a PDF with a real `%PDF`
signature, parses the JSON export, verifies provider internals are absent from
public output, and proves a revoked slug no longer resolves.

Phase 11 integration coverage proves malicious lesson markup and URL schemes
are removed, publication dependencies are enforced, public quiz reads contain
no answer key or explanation, scoring occurs server-side, passing progress
persists, and the attempt limit is enforced.

Phase 12 integration coverage proves challenge answer protection and
server-side scoring, duplicate completion reward suppression, streak and badge
aggregation, append-only transaction uniqueness, and leaderboard privacy.

Phase 13 integration coverage proves preference suppression, mandatory security
alerts, idempotent dispatch, owner-only mutation, soft deletion, and cursor-list
behavior without sending external email.

Phase 14 unit coverage verifies raw-body HMAC signatures and constant-time
verification-token behavior. Integration coverage proves one-time hashed linking
codes, encrypted linkage resolution, consent status, code reuse rejection, and
removal of lookup data on unlink without calling Meta.

Phase 16 covers authenticated encrypted account exports, download-token
validation, cross-collection erasure, audit retention, and crypto round trips.
Run `npm run load-test` against a started API to apply the default 500-request,
25-concurrency liveness profile. Configure `LOAD_TEST_BASE_URL`,
`LOAD_TEST_REQUESTS`, `LOAD_TEST_CONCURRENCY`, and `LOAD_TEST_MAX_P95_MS` for
the target environment. Load tests are read-only and fail on any HTTP error or
p95 above the configured threshold.
