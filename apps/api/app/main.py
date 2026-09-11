import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.core.config import settings
from app.core.db import engine

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
    yield


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
            content={"code": "rate_limited", "message": "Too many requests, slow down."},
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
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "error", "message": str(detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": "The submitted data is not valid",
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
