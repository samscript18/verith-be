# Testing

Unit tests use Jest and Nest testing utilities. E2E tests use Supertest. Integration tests use real MongoDB, Redis, and BullMQ. Test doubles are permitted only at external boundaries, including AI generation and remotely hosted article responses.

Live provider tests are isolated behind `npm run test:external` and explicit environment flags. Normal CI never sends real email or WhatsApp messages and never consumes paid AI/search services. Phase 7 integration coverage uses deterministic AI, search, and page-retrieval boundaries to prove evidence persistence and duplicate lineage without consuming search credits. Provider contract tests verify Tavily request flags and failure mapping; unsafe URLs remain covered without a network call.

Phase 8 extends the deterministic integration boundary through evidence
relationship validation, claim evaluation, persisted confidence factors,
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
