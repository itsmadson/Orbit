import asyncio
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.core.config import settings
from app.core.db import engine
from app.core.i18n import localize, request_locale

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orbit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    for attempt in range(30):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            break
        except Exception as exc:  # database still booting
            logger.info("Waiting for database (%s/30): %s", attempt + 1, exc)
            time.sleep(2)

    # Uptime monitoring runs in-process. A dedicated scheduler would be the
    # answer at scale; for a self-hosted workspace this keeps the deployment to
    # the same three containers.
    monitor_task = None
    if settings.MONITORING_ENABLED:
        from app.core.db import SessionLocal
        from app.services.support import monitor_loop

        monitor_task = asyncio.create_task(
            monitor_loop(SessionLocal, settings.MONITOR_POLL_SECONDS)
        )
        logger.info("uptime monitoring started")

    sync_task = None
    if settings.INTEGRATION_SYNC_ENABLED:
        from app.core.db import SessionLocal as SyncSession
        from app.services.integrations.sync import integration_loop

        sync_task = asyncio.create_task(integration_loop(SyncSession))

    yield

    if sync_task:
        sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await sync_task
    if monitor_task:
        monitor_task.cancel()
        with suppress(asyncio.CancelledError):
            await monitor_task


app = FastAPI(
    title="ORBIT API",
    description=(
        "The operating system for your company. One connected API for projects, tasks, "
        "innovation, knowledge, operations, business and people."
    ),
    version="1.0.0",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url=f"{settings.API_V1_PREFIX}/docs",
    redoc_url=f"{settings.API_V1_PREFIX}/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_buckets: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    """In-process rate limiting plus baseline security headers.

    The limiter is deliberately simple; swap the bucket store for Redis when
    running more than one API replica.
    """
    client = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "unknown"
    )
    now = time.time()
    bucket = _buckets[client]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= settings.RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=429,
            content={"code": "rate_limited", "message": localize(
                request_locale(request), "Too many requests, slow down.")},
        )
    bucket.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    locale = request_locale(request)
    if isinstance(detail, dict):
        if isinstance(detail.get("message"), str):
            detail = {**detail, "message": localize(locale, detail["message"])}
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "error", "message": localize(locale, str(detail))},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": localize(request_locale(request), "The submitted data is not valid"),
            "fields": [
                {"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]}
                for err in exc.errors()
            ],
        },
    )


@app.get("/health", tags=["meta"])
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    return {"status": "ok" if database == "ok" else "degraded", "database": database}


@app.get("/", tags=["meta"])
def root():
    return {
        "name": "ORBIT API",
        "tagline": "The operating system for your company.",
        "docs": f"{settings.API_V1_PREFIX}/docs",
    }


app.include_router(api_router, prefix=settings.API_V1_PREFIX)
