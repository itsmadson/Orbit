<div align="center">

# ORBIT

**The operating system for your company.**

Projects · Tasks · Ideas · R&D · Knowledge · Approvals · Finance · CRM · People — connected in one operational graph.

</div>

---

ORBIT is a self-hosted company operating system. It is not a bundle of unrelated
apps behind one login: an idea becomes research, research becomes a project, a
project contains tasks, a meeting produces decisions and action items, an
expense belongs to a project and a budget, and every one of those links is a
real, queryable edge in the **company graph**.

```
Idea ──creates──▶ R&D ──creates──▶ Project ──contains──▶ Task ──assigned_to──▶ Person
                                      │
                        ┌─────────────┼──────────────┬───────────────┐
                   funded_by      documents       contains        generates
                        ▼             ▼               ▼               ▼
                   Transaction    Document        Meeting         Invoice
                                                     │
                                                  creates
                                                     ▼
                                                  Decision
```

---

## 1. Requirements

Only two things on the host:

| Requirement | Version |
| --- | --- |
| Docker Engine | 24+ |
| Docker Compose | v2 |

You do **not** need Node.js, Python, PostgreSQL, npm or pnpm installed — everything
builds and runs inside containers.

Roughly 4 GB of free disk and 2 GB of RAM are enough for the demo workload.

---

## 2. Installation

```bash
git clone <your-fork> orbit && cd orbit
cp .env.example .env
docker compose up -d --build
```

First boot takes a few minutes (it builds both images, runs migrations and seeds
a complete demo company). After that:

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/api/v1/docs |
| API docs (ReDoc) | http://localhost:8000/api/v1/redoc |
| OpenAPI schema | http://localhost:8000/api/v1/openapi.json |
| Postgres | `localhost:5433` (user/password/db from `.env`) |

Check everything is up:

```bash
docker compose ps      # all three services should be "healthy"
make health            # or hit both health endpoints directly
```

> **Ports already in use?** Set `WEB_PORT`, `API_PORT` and
> `POSTGRES_PORT_EXTERNAL` in `.env`, and add the new web origin to
> `CORS_ORIGINS`.

---

## 3. Environment variables

Everything lives in `.env` (copied from `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENV` | `development` | Environment name. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `orbit` | Database credentials. |
| `POSTGRES_PORT_EXTERNAL` | `5433` | Host port for psql access. |
| `WEB_PORT` / `API_PORT` | `3000` / `8000` | Host ports. |
| `SECRET_KEY` | `change-me-in-production` | **Change this.** Signs JWTs: `openssl rand -hex 32`. |
| `ACCESS_TOKEN_TTL_MINUTES` | `30` | Access token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | `14` | Refresh token lifetime. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins. |
| `RATE_LIMIT_PER_MINUTE` | `600` | Per-IP request budget on the API. |
| `SEED_ON_STARTUP` | `true` | Seed the demo company on an empty database. |
| `DEMO_PASSWORD` | `orbit1234` | Password given to every seeded user. |
| `AI_PROVIDER` | `deterministic` | `deterministic`, `openai` or `ollama`. |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | empty | AI provider connection. |
| `STORAGE_BACKEND` | `local` | `local` (volume) or `s3` (MinIO/AWS). |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | empty | S3-compatible storage. |
| `NEXT_PUBLIC_APP_NAME` | `ORBIT` | Product name in the UI. |

Secrets never reach the browser: the frontend talks to the API through a
server-side proxy and tokens live in httpOnly cookies.

---

## 4. Starting the application

```bash
docker compose up -d          # start
docker compose ps             # status
docker compose logs -f        # follow logs
docker compose logs -f orbit-api
docker compose down           # stop (data is preserved)
docker compose down -v        # stop and delete all data
```

A `Makefile` wraps the common operations:

```bash
make up        # build + start
make logs      # follow logs
make ps        # status
make reset     # wipe data and start fresh
make health    # check API + web health endpoints
make help      # list everything
```

---

## 5. Database migrations

Migrations are **Alembic** and run automatically on every API start
(`docker/api-entrypoint.sh` → `alembic upgrade head`), so a fresh deployment
needs no manual step.

```bash
make migrate                            # apply manually
make migration m="add widget table"     # autogenerate a new revision
docker compose exec orbit-api alembic history
docker compose exec orbit-api alembic downgrade -1
```

The baseline revision (`0001_initial`) creates the full schema from the
SQLAlchemy metadata and adds the GIN full-text indexes used by global search.
Every change after that is an ordinary hand-written or autogenerated revision.

---

## 6. Demo credentials

The first boot seeds **Orbit Demo Company** — 14 people, 5 projects, ~35 tasks,
10 ideas, 3 R&D projects with 9 experiments, 12 documents, 6 decisions, 8
meetings, 4 workflows with live requests, 7 months of finance, 7 customers,
17 assets, OKRs, leave, attendance and a populated inbox.

Password for **every** account: `orbit1234`

| Email | Role | What they can see |
| --- | --- | --- |
| `admin@orbit.dev` | Company admin | Everything |
| `manager@orbit.dev` | Manager (VP Engineering) | Projects, approvals, read-only finance/HR |
| `pm@orbit.dev` | Project manager | Projects, tasks, roadmap, documents |
| `dev@orbit.dev` | Employee | Own tasks, projects, wiki — **no** finance or HR |
| `researcher@orbit.dev` | R&D | Research, experiments, ideas |
| `finance@orbit.dev` | Finance | Finance, procurement, assets, approvals |
| `hr@orbit.dev` | HR | People, leave, attendance, onboarding |
| `sales@orbit.dev` | Manager (Sales) | CRM, pipeline, contracts |

Signing in as `dev@orbit.dev` and opening `/finance` is the quickest way to see
that authorization is enforced by the API, not just hidden in the UI.

To start with an **empty** workspace instead, set `SEED_ON_STARTUP=false` before
the first `docker compose up`, then create your company via the API.

---

## 7. Development mode

The default compose file runs production builds. For iterative work, run the
service you are changing on the host and keep the rest in Docker.

**API (hot reload):**

```bash
docker compose up -d orbit-db
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export POSTGRES_HOST=localhost POSTGRES_PORT=5433
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload --port 8000
```

**Web (hot reload):**

```bash
cd apps/web
npm install
ORBIT_API_URL=http://localhost:8000 npm run dev     # http://localhost:3000
npm run typecheck                                    # tsc --noEmit
```

Useful container commands:

```bash
make shell-api                                   # bash in the API container
make shell-db                                    # psql in the database
docker compose exec orbit-api python -m app.seed # re-run the seed
./scripts/smoke-test.sh                          # end-to-end check
```

---

## 8. Production deployment

1. **Set real secrets.** `SECRET_KEY=$(openssl rand -hex 32)`, a strong
   `POSTGRES_PASSWORD`, and `ENV=production`.
2. **Lock CORS** to your real origin: `CORS_ORIGINS=https://orbit.example.com`.
3. **Terminate TLS** in front of the stack (nginx, Caddy or a cloud load
   balancer) proxying `/` → `orbit-web:3000` and, if you expose it, `/api` →
   `orbit-api:8000`. Set `ORBIT_HTTPS=true` on `orbit-web` so session cookies are
   marked `Secure`.
4. **Disable demo data**: `SEED_ON_STARTUP=false`.
5. **Use durable object storage** for attachments: `STORAGE_BACKEND=s3` plus the
   `S3_*` variables (MinIO works out of the box).
6. **Back up the database** on a schedule (see below) and keep the
   `orbit-db-data` volume on persistent storage.
7. **Scale the API** with `docker compose up -d --scale orbit-api=3` behind your
   proxy. The in-process rate limiter is per replica — move it to Redis if you
   need a global budget.

```bash
docker compose up -d --build   # deploy a new version (migrations run on start)
```

---

## 9. Backup and restore

```bash
make backup                                  # → backups/orbit-<timestamp>.sql.gz
make restore f=backups/orbit-20260910.sql.gz # restore a dump
```

Equivalent raw commands:

```bash
docker compose exec -T orbit-db pg_dump -U orbit orbit | gzip > orbit.sql.gz
gunzip -c orbit.sql.gz | docker compose exec -T orbit-db psql -U orbit -d orbit
```

Uploaded files live in the `orbit-files` volume (or your S3 bucket when
`STORAGE_BACKEND=s3`) and must be backed up alongside the database.

---

## 10. Architecture

```
orbit/
├── apps/
│   ├── api/                  FastAPI — owns the domain
│   │   ├── app/
│   │   │   ├── api/v1/       routers (auth, projects, tasks, finance, …)
│   │   │   ├── core/         config, db, security, RBAC, deps, errors
│   │   │   ├── models/       SQLAlchemy 2 models by domain
│   │   │   ├── schemas/      Pydantic v2 request/response contracts
│   │   │   ├── services/     audit, notifications, workflow, graph,
│   │   │   │                 search, storage, insights, ai, registry
│   │   │   └── seed.py       demo company
│   │   └── alembic/          migrations
│   └── web/                  Next.js 15 — frontend + BFF
│       ├── app/              App Router pages and route handlers
│       ├── components/       UI primitives, layout, shared building blocks
│       ├── features/         one folder per domain module
│       ├── lib/              api client, hooks, i18n, types, utils
│       └── messages/         en.json / fa.json
├── packages/shared/          contracts shared by both sides
├── docker/                   Dockerfiles + entrypoint
├── scripts/                  smoke test
├── docker-compose.yml
└── Makefile
```

### Stack

**Backend** — FastAPI, Python 3.12, SQLAlchemy 2, Pydantic v2, Alembic,
PostgreSQL 16 (+ pgvector, ready for embeddings), JWT auth with rotating refresh
sessions.

**Frontend** — Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4,
Radix primitives in the shadcn idiom, TanStack Query, Zustand, React Hook Form +
Zod, Recharts, dnd-kit, TipTap, Lucide.

### Design decisions worth knowing

**A modular monolith, not microservices.** One API process, clean domain
boundaries (`models/`, `services/`, `api/v1/` split by domain). Postgres is the
single source of truth.

**The company graph is generic.** `relations` stores typed edges
(`from_type/from_id → rel_type → to_type/to_id`) between any registered
entities. `app/services/registry.py` is the one place that knows what an entity
is — adding a module means adding a row there, and search, the graph explorer,
comments, attachments and inbox links all work for it immediately.

**Workflows are data, not code.** A `workflow_definitions` row holds `states`,
`transitions` and `form_schema` as JSONB. The engine in
`app/services/workflow.py` interprets them, so a new approval chain is a POST,
not a deployment. Four workflows ship seeded (purchase request, expense claim,
document review, access request).

**Authorization lives on the backend.** Roles grant permissions
(`domain.read/write/manage`), scoped grants in `permission_grants` layer on top,
and every router declares what it needs via `require("finance.write")`. The
frontend mirrors the same rules purely to hide buttons.

**The BFF keeps tokens out of the browser.** `app/api/orbit/[...path]` proxies to
FastAPI, attaching the access token from an httpOnly cookie and transparently
refreshing it once on 401.

**AI is layered and honest.** `AI provider → AI service → Orbit AI → company
context`. Retrieval runs as the asking user, so the model only ever sees records
that user could open. With no provider configured, Orbit AI answers from the
retrieved records and says plainly that no language model is connected — the
dashboard's "AI insights" are deterministic rules over live data, never invented.

**The secretariat is Persian-first.** The letter register (دبیرخانه) mints a
registered number from a formula the company owns — `{kind}/{year}/{seq:04}`
yields `ص/۱۴۰۴/۰۰۱۲` — with the counter resetting on the Jalali calendar and a
row lock so two clerks cannot take the same number. A letter is written by
typing its text; the letterhead and template supply the header, salutation and
closing. It exports as a PDF for the file (WeasyPrint with Pango doing the
Persian shaping and bidi) or as a DOCX for anyone who needs to keep editing it.

**i18n and RTL are structural.** Locale is a cookie read on the server, which
sets `lang`/`dir` on `<html>`; the layout uses logical properties (`ps-*`,
`me-*`, `start-*`) throughout, so Persian is a genuine mirror of the interface
rather than a separate set of pages.

### API surface

`/api/v1/` — `auth`, `users`, `departments`, `projects`, `tasks`, `sprints`,
`ideas`, `brainstorm`, `rd`, `experiments`, `spaces`, `documents`, `decisions`,
`meetings`, `letters`, `letterheads`, `letter-templates`, `letter-numbering`,
`workflows`, `requests`, `approvals`, `finance`, `crm`, `hr`, `assets`,
`purchase-orders`, `goals`, `dashboard`, `analytics`, `ai`, `search`,
`notifications`, `comments`, `attachments`, `graph`, `audit`, `integrations`.

Consistent errors:

```json
{ "code": "forbidden", "message": "Missing permission: finance.write" }
```

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ + K` or `/` | Command palette (search + navigate + create) |
| `C` | Quick create |
| `G` then `P` / `T` / `I` / `D` / `R` / `F` / `C` / `M` / `A` / `E` / `G` | Go to Projects / Tasks / Inbox / Ideas / R&D / Finance / CRM / Meetings / Approvals / Employees / Goals |

---

## Verifying a fresh install

```bash
docker compose down -v
docker compose up -d --build
docker compose ps            # three healthy services
./scripts/smoke-test.sh      # auth, reads, writes and an RBAC denial
```

Then sign in at http://localhost:3000 as `admin@orbit.dev` / `orbit1234` and
walk the flow: create a project → add a task → assign it → drag it across the
board → submit a purchase request → approve it as the admin → watch the
notification arrive in the inbox.

## License

Released under the MIT License — see `LICENSE`.
