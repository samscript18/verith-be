# Architecture

Verith uses a modular NestJS architecture inspired by AjoFlow's reusable organization, not its domain logic.

- `src/api`: domain and infrastructure-facing modules, currently including database, health, Redis, authentication, users, uploads, AI, and verifications.
- `src/core`: HTTP lifecycle concerns including request IDs, exception filtering, and response serialization.
- `src/shared`: typed configuration, Joi schemas, shared enums, and reusable components.
- `ApiModule`: explicit composition root for domain modules.
- `AppModule`: configuration, logging, throttling, events, core infrastructure, and API composition.

Controllers translate HTTP requests and remain thin. Services own use cases. Substantial persistence will use repositories. Cross-domain dependencies must be imported explicitly.

The API process is synchronous only for short HTTP work. BullMQ workers currently initialize verifications and process text/URL submissions through claim and query generation. Evidence, media, notification, and export workloads join the queue topology in their owning phases.

Large or independently queried records are separated from the verification document. Normalized extracted content, claims, evidence, stage events, idempotency records, prompt versions, AI executions, and search executions use dedicated indexed collections. Evidence carries canonical/content lineage so duplicate or syndicated pages are not silently treated as independent sources.
