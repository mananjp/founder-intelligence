from unittest.mock import patch

from fastapi.testclient import TestClient

from fi_ai.main import app


def test_health_endpoint():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_start_run_requires_internal_token():
    response = TestClient(app).post("/internal/research/runs/run-1/start")

    assert response.status_code == 401
    assert response.json()["detail"] == "bad internal token"


def test_start_run_enqueues_with_valid_internal_token():
    with patch("fi_ai.main.run_research.delay") as enqueue:
        response = TestClient(app).post(
            "/internal/research/runs/run-1/start",
            headers={"x-internal-token": "change-me"},
        )

    assert response.status_code == 202
    assert response.json() == {"run_id": "run-1", "queued": True}
    enqueue.assert_called_once_with("run-1")


def test_worker_runs_orchestrator():
    from fi_ai.research.orchestrator import Orchestrator
    from fi_ai.worker import run_research

    with patch.object(Orchestrator, "execute") as execute:
        run_research.run("run-1")

    execute.assert_called_once()
