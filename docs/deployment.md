# Production Deployment

## Repository boundary

The applications are maintained and deployed from independent repositories:

| Application | Repository | Typical host |
| ----------- | ---------- | ------------ |
| Backend | `samscript18/verith-be` | Render or a container platform |
| Frontend | `mannycodes-j/Verith` | Vercel or its standalone container |

Run the commands in this document from the backend repository's `backend/`
directory. Vercel should import the frontend repository directly, rather than
using a Root Directory inside this repository.

Build reproducibly with `npm ci`, `npm run build`, and `docker build .`. The
multi-stage image contains production dependencies only and runs as the
unprivileged `verith` user. It also contains the database bootstrap and seed
scripts. The image's default `npm run start:prod` command invokes
`prestart:prod` before starting the API; do not replace that default with
`node dist/main` unless a controlled release job has already completed the
bootstrap successfully.

Build the image from the backend directory:

```bash
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t verith-backend .
```

The image includes compiled runtime code, production dependencies, and the five
idempotent index/seed scripts used by `prestart:prod`. It runs as an unprivileged
user, responds to `SIGTERM`, and excludes local environment files. Health checks
belong to the API deployment only: workers and schedulers do not serve HTTP.
The Compose API service declares the liveness check, and hosted API services
should configure `/api/v1/health/live` in their platform settings.

Deploy the same image as three independently scalable processes:

| Process   | Role                                                      | Command                                      |
| --------- | --------------------------------------------------------- | -------------------------------------------- |
| API       | HTTP/SSE only                                             | `PROCESS_ROLE=api node dist/main`            |
| Worker    | BullMQ verification, notification, and privacy jobs       | `PROCESS_ROLE=worker node dist/worker`       |
| Scheduler | domain-event relay, retention, and orphan cleanup         | `PROCESS_ROLE=scheduler node dist/scheduler` |

Do not use `PROCESS_ROLE=all` in production. It exists for local development
and integration testing. Scale API and worker replicas independently; run at
least one scheduler replica. MongoDB leases prevent duplicate outbox delivery
claims, and the Redis lock prevents duplicate retention sweeps.

## Single-service / free-tier deployment

If one service must run the API, workers, and scheduler together, use
`PROCESS_ROLE=all` as a temporary cost-conscious deployment topology. Also set
`THROTTLER_STORAGE=memory`. This prevents the global HTTP rate limiter from
writing to Redis for every normal request; Redis remains dedicated to BullMQ.
Do not horizontally scale this topology. When more than one API instance serves
traffic, split the roles as above and set `THROTTLER_STORAGE=redis` on the API
service so rate limiting remains shared.

BullMQ workers long-poll an empty queue for five minutes and check stalled jobs
every ten minutes. New jobs still wake a waiting worker immediately. This keeps
idle Redis command usage low while accepting a slower recovery window for a
truly stalled job.

### Render free-tier settings

For a native Node service with `backend` as its Root Directory:

```text
Build Command:      npm ci && npm run build
Start Command:      npm run start:prod
Health Check Path:  /api/v1/health/live
PROCESS_ROLE:       all
THROTTLER_STORAGE:  memory
```

Do not enter `npm run prestart:prod` separately. npm invokes it automatically
before `start:prod`. `BOOTSTRAP_SUPER_ADMIN_PASSWORD` is required only when the
configured Super Admin does not exist and should be removed after successful
bootstrap. Do not horizontally scale this single-service topology.

MongoDB and Redis are mandatory, authenticated, private-network dependencies.
Use a managed MongoDB replica set for transactions and point-in-time recovery.
Use durable Redis with an eviction policy compatible with BullMQ. Store all
secrets in the platform secret manager. Rotate JWT, hashing, encryption,
Cloudinary, mail, and model-provider credentials through a rehearsed
dual-key/cutover process.

For the UNESCO review-period reliability layer, keep Vertex and Bedrock off
until model access has been verified in staging. Vertex should use workload
identity/Application Default Credentials where the host supports it; otherwise
store `GOOGLE_CLOUD_CREDENTIALS_JSON` as one backend-only secret. Bedrock should
use an execution IAM role where possible, or backend-only AWS SDK credentials.
Never add either credential to the separate frontend repository.

Concurrency gates are per worker process. Before increasing worker replicas,
multiply each configured provider limit by the proposed replica count and
confirm the result fits Google/AWS quota and the review budget. Configure Google
Cloud Billing and AWS Budget notifications independently; neither alert system
is treated as an immediate API kill switch. The application-side model-pricing
and budget configuration is documented in
[provider-routing.md](provider-routing.md).

Before routing traffic:

1. run `npm run db:indexes:application && npm run db:indexes:catalog` from a
   controlled release job; these commands are additive and fail on incompatible
   uniqueness or TTL definitions;
2. deploy workers, then the API, then scheduler;
3. require `/api/v1/health/ready` to pass;
4. verify queues have consumers and no unexpected failed-job increase;
5. verify `domain_event_outbox` has no unexpected `DEAD_LETTER` growth;
6. smoke-test authentication and a non-provider health route;
7. retain the prior image digest for rollback.

## Browser authentication across separate hosts

When the Next.js frontend and API use different providers, configure the
frontend's `BACKEND_API_URL` with the public API origin. The frontend forwards
`/api/v1/*` through its own origin so `verith_refresh` and `verith_csrf` remain
first-party cookies instead of third-party cookies.

For a Vercel frontend and Render API, use:

```text
# Vercel
BACKEND_API_URL=https://your-api.onrender.com

# Render
FRONTEND_URL=https://your-frontend.vercel.app
ALLOWED_ORIGINS=https://your-frontend.vercel.app
COOKIE_DOMAIN=
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
TRUST_PROXY=true
```

Do not set `COOKIE_DOMAIN` to either the Vercel or Render hostname. A cookie
domain cannot be shared across unrelated parent domains. Redeploy the frontend
after changing `BACKEND_API_URL`, because rewrites are resolved by Next.js at
build/start time.

Shutdown uses Nest lifecycle hooks. HTTP stops accepting requests, BullMQ
workers close through their lifecycle integration, and MongoDB/Redis/logging
providers receive application-shutdown callbacks. Platform termination grace
should be at least 30 seconds.

Local `docker compose up --build` mirrors the three-process topology and reads
`.env.local` by default. Its worker and scheduler wait for the API to become
healthy, ensuring the API's prestart bootstrap finishes first. Set
`ENV_FILE=/path/to/environment` to select a deployment-managed environment
file.
