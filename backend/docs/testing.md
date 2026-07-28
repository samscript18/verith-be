# Testing

Unit tests use Jest and Nest testing utilities. E2E tests use Supertest. Integration tests use real MongoDB, Redis, and BullMQ. Test doubles are permitted only at external boundaries, including AI generation and remotely hosted article responses.

Live provider tests are isolated behind `npm run test:external` and explicit environment flags. Normal CI never sends real email or WhatsApp messages and never consumes paid AI/search services. Phase 6 integration coverage proves the complete text lifecycle with a deterministic AI boundary adapter and separately validates that unsafe URLs fail before any network call.
