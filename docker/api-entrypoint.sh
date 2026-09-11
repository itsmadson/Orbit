#!/usr/bin/env bash
set -euo pipefail

echo "[orbit-api] waiting for postgres at ${POSTGRES_HOST:-orbit-db}:${POSTGRES_PORT:-5432}…"
python - <<'PY'
import time
import sys
from sqlalchemy import create_engine, text
from app.core.config import settings

for attempt in range(60):
    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        print("[orbit-api] database is ready")
        sys.exit(0)
    except Exception as exc:
        print(f"[orbit-api] database not ready ({attempt + 1}/60): {exc.__class__.__name__}")
        time.sleep(2)
print("[orbit-api] database never became ready", file=sys.stderr)
sys.exit(1)
PY

echo "[orbit-api] running migrations…"
alembic upgrade head

if [ "${SEED_ON_STARTUP:-true}" = "true" ]; then
  echo "[orbit-api] seeding demo data (no-op if already seeded)…"
  python -m app.seed
fi

echo "[orbit-api] starting: $*"
exec "$@"
