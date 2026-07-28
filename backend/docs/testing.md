# Testing

Unit tests use Jest and Nest testing utilities. E2E tests use Supertest. Integration tests use real MongoDB, Redis, and BullMQ. Test doubles are permitted only at external boundaries, including AI generation and remotely hosted article responses.

Live provider tests are isolated behind `npm run test:external` and explicit environment flags. Normal CI never sends real email or WhatsApp messages and never consumes paid AI/search services. Phase 7 integration coverage uses deterministic AI, search, and page-retrieval boundaries to prove evidence persistence and duplicate lineage without consuming search credits. Provider contract tests verify Tavily request flags and failure mapping; unsafe URLs remain covered without a network call.

Phase 8 extends the deterministic integration boundary through evidence
relationship validation, claim evaluation, persisted confidence factors,
overall verdict/risk calculation, and publisher discovery. Assertions verify
that a duplicate page does not become a second independent confidence source.
