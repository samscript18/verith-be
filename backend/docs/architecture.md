# Architecture

Verith uses a modular NestJS architecture inspired by AjoFlow's reusable organization, not its domain logic.

- `src/api`: domain and infrastructure-facing modules, currently including database, health, Redis, authentication, users, uploads, AI, and verifications.
- `src/core`: HTTP lifecycle concerns including request IDs, exception filtering, and response serialization.
- `src/core/events`: typed domain-event contracts, durable outbox persistence,
  leased delivery, retries, and dead-letter state.
- `src/shared`: typed configuration, Joi schemas, shared enums, and reusable components.
- `ApiModule`: explicit composition root for domain modules.
- `AppModule`: configuration, logging, throttling, events, core infrastructure, and API composition.

Controllers translate HTTP requests and remain thin. Services own use cases.
Substantial persistence uses repositories or domain-owned models. Immediate
use-case dependencies are imported explicitly; asynchronous cross-domain side
effects use typed events.

The API process is synchronous only for short HTTP work. BullMQ workers run verification orchestration, notification email delivery, and signed WhatsApp inbound processing. Evidence and media stages remain within the idempotent verification job; export workloads are generated on authenticated demand.

Verification completion/failure and authentication security alerts use the
durable domain-event outbox. The scheduler relays these facts at least once to
idempotent notification and WhatsApp consumers. See
[event-driven-architecture.md](event-driven-architecture.md).

Large or independently queried records are separated from the verification document. Normalized extracted content, claims, evidence, stage events, idempotency records, prompt versions, AI executions, and search executions use dedicated indexed collections. Evidence carries canonical/content lineage so duplicate or syndicated pages are not silently treated as independent sources.

Claim evaluations and the verification-level analysis are separate versioned
documents. Publisher profiles are domain-keyed shared records; discovery starts
at `UNKNOWN`, while later manual overrides require the protected admin and
audit workflow.
