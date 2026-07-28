# Testing

Unit tests use Jest and Nest testing utilities. E2E tests use Supertest. Integration tests will use real MongoDB and isolated Redis behavior as persistence modules arrive; test doubles are permitted only at external boundaries.

Live provider tests are isolated behind `npm run test:external` and explicit environment flags. Normal CI never sends real email or WhatsApp messages and never consumes paid AI/search services.
