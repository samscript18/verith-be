# Deployment

Build the multi-stage Docker image with `docker build .`. The runtime uses Node.js 24 Alpine, contains production dependencies only, and runs as the unprivileged `verith` user.

Required Phase 1 services are MongoDB and Redis. Configure `MONGODB_URI`, `REDIS_URL`, allowed origins, proxy behavior, and logging through the environment. The readiness endpoint must pass before routing traffic.

Later phases separate API, workers, and scheduled jobs. Production MongoDB and Redis must use private networking, authentication, backups, and managed persistence appropriate to the selected platform.
