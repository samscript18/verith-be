# Production Deployment

Build reproducibly with `npm ci`, `npm run build`, and `docker build .`. The
multi-stage image contains production dependencies only and runs as the
unprivileged `verith` user.

Deploy the same image as three independently scalable processes:

| Process   | Role                                                      | Command                                      |
| --------- | --------------------------------------------------------- | -------------------------------------------- |
| API       | HTTP/SSE only                                             | `PROCESS_ROLE=api node dist/main`            |
| Worker    | BullMQ verification, notification, WhatsApp, privacy jobs | `PROCESS_ROLE=worker node dist/worker`       |
| Scheduler | retention and orphan cleanup                              | `PROCESS_ROLE=scheduler node dist/scheduler` |

Do not use `PROCESS_ROLE=all` in production. It exists for local development
and integration testing. Scale API and worker replicas independently; run at
least one scheduler replica (the Redis lock prevents duplicate retention
sweeps).

MongoDB and Redis are mandatory, authenticated, private-network dependencies.
Use a managed MongoDB replica set for transactions and point-in-time recovery.
Use durable Redis with an eviction policy compatible with BullMQ. Store all
secrets in the platform secret manager. Rotate JWT, hashing, encryption,
Cloudinary, mail, WhatsApp, and model-provider credentials through a rehearsed
dual-key/cutover process.

Before routing traffic:

1. run database index creation/migrations from a controlled release job;
2. deploy workers, then the API, then scheduler;
3. require `/api/v1/health/ready` to pass;
4. verify queues have consumers and no unexpected failed-job increase;
5. smoke-test authentication and a non-provider health route;
6. retain the prior image digest for rollback.

Shutdown uses Nest lifecycle hooks. HTTP stops accepting requests, BullMQ
workers close through their lifecycle integration, and MongoDB/Redis/logging
providers receive application-shutdown callbacks. Platform termination grace
should be at least 30 seconds.

Local `docker compose up --build` mirrors the three-process topology and reads
`.env.local` by default. Set `ENV_FILE=/path/to/environment` to select a
deployment-managed environment file.
