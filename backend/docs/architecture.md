# Architecture

Verith uses a modular NestJS architecture inspired by AjoFlow's reusable organization, not its domain logic.

- `src/api`: domain and infrastructure-facing modules. Phase 1 includes database, health, and Redis integration.
- `src/core`: HTTP lifecycle concerns including request IDs, exception filtering, and response serialization.
- `src/shared`: typed configuration, Joi schemas, shared enums, and reusable components.
- `ApiModule`: explicit composition root for domain modules.
- `AppModule`: configuration, logging, throttling, events, core infrastructure, and API composition.

Controllers translate HTTP requests and remain thin. Services own use cases. Substantial persistence will use repositories. Cross-domain dependencies must be imported explicitly.

The API process is synchronous only for short HTTP work. Verification, AI, media, notification, and export workloads will run through BullMQ workers in later phases.
