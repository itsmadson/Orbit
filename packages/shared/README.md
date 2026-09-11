# @orbit/shared

Cross-cutting contracts shared by `apps/api` and `apps/web`.

The API is the single source of truth for the domain model, so this package
deliberately holds only what both sides must agree on **outside** of the
generated OpenAPI schema:

- `entities.json` — the entity registry (types, labels, URLs, icons) that the
  company graph, global search and the inbox all key off. The backend copy lives
  in `apps/api/app/services/registry.py`; this file mirrors it for the frontend
  and for any future integration or SDK.
- `permissions.json` — the permission vocabulary used by RBAC, mirrored from
  `apps/api/app/core/rbac.py`.

Anything strongly typed (request/response bodies) should be generated from the
live OpenAPI document instead of hand-copied:

```bash
curl http://localhost:8000/api/v1/openapi.json > openapi.json
```
