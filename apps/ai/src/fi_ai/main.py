from fastapi import FastAPI, Header, HTTPException

from fi_ai.config import settings
from fi_ai.worker import run_research

app = FastAPI(title="FI AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


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
