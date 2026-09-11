# Docker assets

| File | Purpose |
| --- | --- |
| `api.Dockerfile` | Multi-stage build for the FastAPI service. Stage 1 resolves wheels, stage 2 is a slim runtime that drops to a non-root user and ships a health check. |
| `web.Dockerfile` | Multi-stage build for Next.js. Stage 1 installs dependencies, stage 2 builds, stage 3 runs the `standalone` output as a non-root user. |
| `api-entrypoint.sh` | Waits for PostgreSQL, applies Alembic migrations, seeds the demo company when `SEED_ON_STARTUP=true`, then execs the given command. |

Both images are built from the repository root so the build context can see
`apps/` — that is why `docker-compose.yml` sets `context: .` with an explicit
`dockerfile:` path.
