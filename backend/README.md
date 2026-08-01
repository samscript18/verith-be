# Verith Backend

Verith is an explainable misinformation-verification and media-literacy platform. The backend currently includes the production foundation, authentication and user management, and owner-bound signed Cloudinary uploads.

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

The API listens on `http://localhost:4000/api/v1`. Swagger is available at `http://localhost:4000/api/docs`.

## Commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

`npm run test:external` is reserved for explicitly enabled live provider contract tests. Normal test runs never call external AI or messaging providers.

## Health

- `GET /api/v1/health/live` checks process liveness.
- `GET /api/v1/health` and `/api/v1/health/ready` check MongoDB and Redis readiness.

## Providers

Only deployment-specific addresses and secrets remain in `.env.example`; limits,
retention, provider URLs, provider order, and no-cost model names are defaults
in code. AI keys must belong to free-tier projects without billing enabled.
Search uses Tavily when `TAVILY_API_KEY` is configured and falls back to
Wikipedia when Tavily is unavailable or returns no results. Cloudinary remains
optional at application startup, but upload requests return
`CLOUDINARY_NOT_CONFIGURED` unless all three Cloudinary credentials are
present.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The production image runs as a non-root user. MongoDB and Redis are not exposed by any production deployment manifest; the compose port mappings are for local development only.

## Deployment

Build and run the API as a distinct process. Later phases add separate worker and scheduler entry points. See [docs/deployment.md](docs/deployment.md).

## Troubleshooting

- Startup configuration errors: compare `.env` with `.env.example`.
- Readiness is down: confirm MongoDB and Redis are reachable from the backend container.
- CORS rejection: add the exact frontend origin to `ALLOWED_ORIGINS`.
- Swagger missing: ensure `SWAGGER_ENABLED=true`.
