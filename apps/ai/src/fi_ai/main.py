import uuid

import redis.asyncio as aioredis
import structlog.contextvars
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.requests import Request
from starlette.responses import Response

from fi_ai.config import settings
from fi_ai.db import engine
from fi_ai.observability import configure_structlog
from fi_ai.metrics import CONTENT_TYPE_LATEST, generate_metrics
from fi_ai.worker import run_research

configure_structlog()

app = FastAPI(title="FI AI Service", version="0.1.0")

# Module-level Redis client — reuse existing infrastructure (IC-4)
_redis = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next) -> Response:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    try:
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
    finally:
        # Always clear context — even if call_next raises, preventing context leak
        structlog.contextvars.clear_contextvars()


@app.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    """Expose Prometheus metrics for the AI service."""
    return Response(content=generate_metrics(), headers={"Content-Type": CONTENT_TYPE_LATEST})


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready() -> JSONResponse:
    checks: dict[str, bool] = {}

    # Redis probe — reuse module-level singleton
    try:
        await _redis.ping()
        checks["redis"] = True
    except Exception:  # noqa: BLE001
        checks["redis"] = False

    # DB probe — reuse shared SQLAlchemy engine from fi_ai.db
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = True
    except Exception:  # noqa: BLE001
        checks["db"] = False

    ok = all(checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ready" if ok else "degraded", "checks": checks},
    )


def _guard(token: str | None) -> None:
    if token != settings.internal_service_token:
        raise HTTPException(status_code=401, detail="bad internal token")


@app.post("/internal/research/runs/{run_id}/start", status_code=202)
def start_run(run_id: str, x_internal_token: str | None = Header(default=None)) -> dict:
    """Called by the Node API. Enqueues the long-running pipeline on Celery."""
    _guard(x_internal_token)
    run_research.delay(run_id)
    return {"run_id": run_id, "queued": True}


# TODO(AI/Research): POST /internal/interview/turn   (adaptive interview: brief + next question)
# TODO(AI/Reasoning): POST /internal/copilot/ask      (RAG over project evidence)
# TODO(AI/Research): POST /internal/radar/check       (called by scheduler)
