# syntax=docker/dockerfile:1

# ---------- builder: resolve wheels once ----------
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /wheels
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt .
RUN pip wheel --wheel-dir=/wheels -r requirements.txt


# ---------- runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1001 orbit

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY apps/api/requirements.txt .
RUN pip install --no-index --find-links=/wheels -r requirements.txt && rm -rf /wheels

COPY apps/api/ /app/
COPY docker/api-entrypoint.sh /usr/local/bin/orbit-entrypoint
RUN chmod +x /usr/local/bin/orbit-entrypoint \
    && mkdir -p /data/files && chown -R orbit:orbit /app /data

USER orbit

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["orbit-entrypoint"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
