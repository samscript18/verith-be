# Verith Backend

Verith is an evidence-first investigation and media-literacy platform. The backend includes authentication, owner-bound uploads, multimodal investigations, explainable reports, guided learning, missions, competency growth, gamification, privacy tooling, and administrative operations.

## Architecture

Business domains live in `src/api`, request-lifecycle infrastructure in `src/core`, and reusable application components in `src/shared`. `ApiModule` composes domains; `AppModule` composes global infrastructure and the API.

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-status.md](docs/implementation-status.md).
Authentication behavior is documented in [docs/authentication-flow.md](docs/authentication-flow.md).
Upload behavior is documented in [docs/uploads-and-cloudinary.md](docs/uploads-and-cloudinary.md).
Verification lifecycle behavior is documented in [docs/verification-pipeline.md](docs/verification-pipeline.md).
AI provider routing is documented in [docs/provider-routing.md](docs/provider-routing.md).
Text/URL processing and SSRF controls are documented in [docs/verification-pipeline.md](docs/verification-pipeline.md) and [docs/security.md](docs/security.md).
Domain-event boundaries, outbox delivery, retries, and failure semantics are
documented in
[docs/event-driven-architecture.md](docs/event-driven-architecture.md).

## Requirements

- Node.js 24 LTS and npm
- MongoDB 8
- Redis 8
- Docker and Docker Compose (optional)

## Local setup

```bash
cp .env.example .env
docker compose up -d mongodb redis
npm install
npm run start:dev
```

The API listens on `http://localhost:4000/api/v1`. Interactive Swagger is
available at `http://localhost:4000/api/docs`, with machine-readable contracts
at `/api/docs-json` and `/api/docs-yaml`. See [docs/openapi.md](docs/openapi.md)
for authentication, response-envelope, export, and validation conventions.

## Commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run openapi:check
npm run openapi:types
```

Normal test runs never call external AI or messaging providers. Live provider verification must remain explicit because it consumes real quotas.

## Health

- `GET /api/v1/health/live` checks process liveness.
- `GET /api/v1/health/ready` checks essential dependencies with a short cache.

## Providers

No-cost provider URLs and models remain code defaults. Vertex and Bedrock model
IDs, regions, concurrency ceilings, and review-period budgets remain explicit
deployment configuration because availability, quota, and pricing vary by
account and region.
Search uses Tavily when `TAVILY_API_KEY` is configured and falls back to
Wikipedia when Tavily is unavailable or returns no results. Cloudinary remains
optional at application startup, but upload requests return
`CLOUDINARY_NOT_CONFIGURED` unless all three Cloudinary credentials are
present.

Gemini, Groq, OpenRouter, and Tavily accept up to three comma-separated keys
through `GEMINI_API_KEYS`, `GROQ_API_KEYS`, `OPENROUTER_API_KEYS`, and
`TAVILY_API_KEYS`. A credential-specific authentication, billing, or rate-limit
failure cools down or disables only the affected key and immediately tries the
next healthy key from the same provider. Keys must be legitimately issued and
must not be used to evade provider terms or billing limits.

Vertex uses Google Application Default Credentials (or secret-managed inline
service-account JSON on hosts without workload identity). Bedrock uses the AWS
SDK credential chain and should run with a least-privilege execution role. They
are sequential paid reliability layers inside the existing capability router,
not replacements for the existing providers. See
[docs/provider-routing.md](docs/provider-routing.md) for the routing matrix,
budget modes, concurrency limits, rollout steps, and manual cloud controls.

## Hybrid Daily Practice generation

The scheduler checks the date-specific challenge slug before performing any
provider work. When the challenge is missing, it builds a deterministic Media
and Information Literacy blueprint and requests all ten questions in one
structured call through the existing Gemini/Groq/OpenRouter capability router.
Generated content is validated for structure, answer integrity, educational
quality, safety, diversity, and recent duplication before publication.

At most two configured providers are attempted. If AI is disabled, unavailable,
rate-limited, malformed, or rejected by validation, Verith publishes the
provider-independent deterministic challenge-bank result instead. Rewards,
attempts, scoring, IDs, dates, and publication policy remain server-controlled.
See [docs/challenges-and-gamification.md](docs/challenges-and-gamification.md).

## Docker

```bash
cp .env.example .env.local
docker compose up --build
```

The production image runs as a non-root user. Its default command is
`npm run start:prod`, so the same index bootstrap and idempotent seeds run before
the API accepts traffic. The local worker and scheduler wait for the API health
check, which means the bootstrap completes before either background process can
consume work. MongoDB and Redis are not exposed by any production deployment
manifest; the compose port mappings are for local development only.

## Deployment

This repository contains the backend only. The frontend is deployed from its
separate `mannycodes-j/Verith` repository. The backend supports separate API,
worker, and scheduler processes or a single free-tier `PROCESS_ROLE=all`
service. See [docs/deployment.md](docs/deployment.md).

The Render start command runs `npm run start:prod`; npm automatically invokes
its `prestart:prod` lifecycle once before starting the API. This validates and
creates every missing compiled non-gamification schema index without dropping
existing indexes, creates the catalog/gamification indexes, verifies or creates
the bootstrap super-admin, seeds the fixed badge catalog, and then seeds
learning content. Index-option conflicts fail startup rather than silently
serving without a uniqueness or TTL guarantee. Every seed is idempotent. Badge
seeding loads the compiled application catalog as its source of truth and
requires an active super-admin to own newly created badge records.

To inspect the compiled non-gamification index manifest without connecting to
MongoDB:

```bash
npm run build
npm run db:indexes:check
```

To seed only the fixed badges after building the backend:

```bash
npm run build
npm run seed:badges
```

## Troubleshooting

- Startup configuration errors: compare `.env` with `.env.example`.
- Readiness is down: confirm MongoDB and Redis are reachable from the backend container.
- CORS rejection: add the exact frontend origin to `ALLOWED_ORIGINS`.
- Swagger missing: ensure `SWAGGER_ENABLED=true`.
