import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from fi_ai.config import Settings
from fi_ai.main import app


def test_health_endpoint():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


TEST_TOKEN = "test-internal-token"


def test_start_run_requires_internal_token():
    with patch("fi_ai.main.settings") as settings:
        settings.internal_service_token = TEST_TOKEN
        response = TestClient(app).post("/internal/research/runs/run-1/start")

    assert response.status_code == 401
    assert response.json()["detail"] == "bad internal token"


def test_start_run_rejects_wrong_internal_token():
    with patch("fi_ai.main.settings") as settings:
        settings.internal_service_token = TEST_TOKEN
        response = TestClient(app).post(
            "/internal/research/runs/run-1/start",
            headers={"x-internal-token": "not-the-token"},
        )

    assert response.status_code == 401


def test_start_run_enqueues_with_valid_internal_token():
    with (
        patch("fi_ai.main.settings") as settings,
        patch("fi_ai.main.run_research.delay") as enqueue,
    ):
        settings.internal_service_token = TEST_TOKEN
        response = TestClient(app).post(
            "/internal/research/runs/run-1/start",
            headers={"x-internal-token": TEST_TOKEN},
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


# ---------------------------------------------------------------------------
# Bug Condition Exploration Tests (Task 1)
# These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
# DO NOT modify these tests to make them pass on unfixed code.
# ---------------------------------------------------------------------------

# --- T-01 / T-02: Provider Keys Missing from Settings (isBugCondition_ProviderKeys) ---

def test_t01_settings_provider_keys_read_from_env():
    """T-01: Settings() with all 4 provider keys in env — fields return env values.

    Bug: Settings has no fields for provider keys; accessing them raises AttributeError.
    Expected (fixed): All four attributes return the env values without AttributeError.
    """
    env_patch = {
        "OPENAI_API_KEY": "sk-x",
        "ANTHROPIC_API_KEY": "ak-x",
        "TAVILY_API_KEY": "tv-x",
        "EXA_API_KEY": "ex-x",
    }
    with patch.dict("os.environ", env_patch, clear=False):
        s = Settings()
    assert s.openai_api_key == "sk-x"
    assert s.anthropic_api_key == "ak-x"
    assert s.tavily_api_key == "tv-x"
    assert s.exa_api_key == "ex-x"


def test_t02_settings_provider_keys_none_when_not_in_env():
    """T-02: Settings() with no provider keys in env — all four fields are None.

    Bug: Settings has no such fields, so they don't exist at all.
    Expected (fixed): All four fields exist and return None.
    """
    keys_to_clear = {
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "TAVILY_API_KEY": "",
        "EXA_API_KEY": "",
    }
    # Use a fresh Settings() with env vars absent
    import os
    saved = {}
    for k in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TAVILY_API_KEY", "EXA_API_KEY"]:
        saved[k] = os.environ.pop(k, None)
    try:
        s = Settings()
        assert s.openai_api_key is None
        assert s.anthropic_api_key is None
        assert s.tavily_api_key is None
        assert s.exa_api_key is None
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


# --- T-03 / T-04: No Fail-Fast for Default Token (isBugCondition_FailFast) ---

def test_t03_settings_raises_on_default_token_in_production():
    """T-03: Settings(app_env='production', internal_service_token='change-me') must raise ValueError.

    Bug: Settings starts normally with the default token even in production.
    Expected (fixed): ValueError raised at instantiation.
    """
    with pytest.raises(ValueError):
        with patch.dict(
            "os.environ",
            {"APP_ENV": "production", "INTERNAL_SERVICE_TOKEN": "change-me"},
            clear=False,
        ):
            Settings()


def test_t04_settings_raises_on_default_token_in_staging():
    """T-04: Settings(app_env='staging', internal_service_token='change-me') must raise ValueError.

    Bug: Settings starts normally with the default token even in staging.
    Expected (fixed): ValueError raised at instantiation.
    """
    with pytest.raises(ValueError):
        with patch.dict(
            "os.environ",
            {"APP_ENV": "staging", "INTERNAL_SERVICE_TOKEN": "change-me"},
            clear=False,
        ):
            Settings()


# --- T-07 / T-08: No request_id Middleware (isBugCondition_RequestId) ---

def test_t07_request_id_header_echoed_in_response():
    """T-07: GET /health with x-request-id header — response must echo it back.

    Bug: No middleware exists; response has no x-request-id header.
    Expected (fixed): Response contains x-request-id: abc-123.
    """
    response = TestClient(app).get("/health", headers={"x-request-id": "abc-123"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "abc-123"


def test_t08_request_id_generated_when_absent():
    """T-08: GET /health without x-request-id header — a UUID must be generated and returned.

    Bug: No middleware exists; no UUID is generated or returned.
    Expected (fixed): Response contains a valid UUID in x-request-id.
    """
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    rid = response.headers.get("x-request-id")
    assert rid is not None, "x-request-id header must be present in response"
    # Must be a valid UUID v4
    parsed = uuid.UUID(rid)
    assert parsed.version == 4


def test_t09_request_id_cleared_after_request():
    """T-09: After a request completes, structlog contextvars must contain no request_id.

    The middleware clears context in a finally block to prevent context leaking
    between requests (IC-3). After the response is returned, get_contextvars()
    must not contain a request_id key.
    """
    import structlog.contextvars as ctxvars

    # Ensure a clean slate before the request
    ctxvars.clear_contextvars()

    # Make a request that will bind request_id during processing
    response = TestClient(app).get("/health", headers={"x-request-id": "t09-test-id"})
    assert response.status_code == 200
    # The middleware must have cleared context in its finally block
    ctx = ctxvars.get_contextvars()
    assert "request_id" not in ctx, (
        f"request_id must be cleared from structlog contextvars after request completes, "
        f"but found: {ctx}"
    )


# --- T-10 / T-11 / T-12 / T-13: No /health/ready Endpoint (isBugCondition_HealthReady) ---

def test_t10_health_ready_both_reachable():
    """T-10: GET /health/ready with Redis and DB both reachable (mocked) — HTTP 200, all checks true.

    Bug: /health/ready returns 404 because the endpoint does not exist.
    Expected (fixed): HTTP 200, {"status": "ready", "checks": {"redis": true, "db": true}}.
    """
    with (
        patch("fi_ai.main._redis") as mock_redis,
        patch("fi_ai.main.engine") as mock_engine,
    ):
        mock_redis.ping = AsyncMock(return_value=True)
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_engine.connect.return_value = mock_conn

        response = TestClient(app).get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["redis"] is True
    assert body["checks"]["db"] is True


def test_t11_health_ready_redis_down_db_up():
    """T-11: Redis mocked as raising, DB reachable — HTTP 503, redis false, db true.

    Bug: /health/ready returns 404 because the endpoint does not exist.
    Expected (fixed): HTTP 503, {"status": "degraded", "checks": {"redis": false, "db": true}}.
    """
    with (
        patch("fi_ai.main._redis") as mock_redis,
        patch("fi_ai.main.engine") as mock_engine,
    ):
        mock_redis.ping = AsyncMock(side_effect=Exception("Redis unreachable"))
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_engine.connect.return_value = mock_conn

        response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["redis"] is False
    assert body["checks"]["db"] is True


def test_t12_health_ready_redis_up_db_down():
    """T-12: DB mocked as raising, Redis reachable — HTTP 503, redis true, db false.

    Bug: /health/ready returns 404 because the endpoint does not exist.
    Expected (fixed): HTTP 503, {"checks": {"redis": true, "db": false}}.
    """
    with (
        patch("fi_ai.main._redis") as mock_redis,
        patch("fi_ai.main.engine") as mock_engine,
    ):
        mock_redis.ping = AsyncMock(return_value=True)
        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(side_effect=Exception("DB unreachable"))
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_engine.connect.return_value = mock_conn

        response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["redis"] is True
    assert body["checks"]["db"] is False


def test_t13_health_ready_both_down():
    """T-13: Both Redis and DB mocked as raising — HTTP 503, both checks false.

    Bug: /health/ready returns 404 because the endpoint does not exist.
    Expected (fixed): HTTP 503, {"checks": {"redis": false, "db": false}}.
    """
    with (
        patch("fi_ai.main._redis") as mock_redis,
        patch("fi_ai.main.engine") as mock_engine,
    ):
        mock_redis.ping = AsyncMock(side_effect=Exception("Redis unreachable"))
        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(side_effect=Exception("DB unreachable"))
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_engine.connect.return_value = mock_conn

        response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["redis"] is False
    assert body["checks"]["db"] is False


# ---------------------------------------------------------------------------
# Preservation Tests (Task 2)
# These tests MUST PASS on both unfixed and fixed code — they capture baseline
# behavior that must not regress after the fix is applied.
# ---------------------------------------------------------------------------

# --- T-05 / T-06: Fail-Fast guard — non-buggy inputs (preservation of startup) ---

@pytest.mark.parametrize(
    "env_patch",
    [
        # T-05: development env with default token — always allowed
        {"APP_ENV": "development", "INTERNAL_SERVICE_TOKEN": "change-me"},
        # T-06: production env with a real secret — allowed
        {"APP_ENV": "production", "INTERNAL_SERVICE_TOKEN": "real-secret"},
    ],
    ids=["t05_dev_default_token", "t06_prod_real_secret"],
)
def test_t05_t06_settings_no_error_for_non_buggy_inputs(env_patch):
    """T-05 / T-06: Settings() must NOT raise ValueError for non-buggy (app_env, token) pairs.

    Preservation: these inputs are not bug conditions — startup must succeed before and after the fix.
    """
    with patch.dict("os.environ", env_patch, clear=False):
        # Must not raise — instantiation succeeds
        s = Settings()
    assert s is not None


# --- T-14: GET /health regression ---

def test_t14_health_returns_200_ok():
    """T-14: GET /health → HTTP 200, {"status": "ok"}.

    Preservation (req. 3.2): the liveness endpoint must continue to work unchanged.
    """
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- T-15 / T-16 / T-17: POST /internal/research/runs/{run_id}/start regression ---

TEST_TOKEN_PRESERVATION = "preservation-test-token"


def test_t15_start_run_valid_token_returns_202():
    """T-15: POST /internal/research/runs/r1/start with valid token → HTTP 202, queued response.

    Preservation (req. 3.3): enqueue behavior must be unchanged after the fix.
    """
    with (
        patch("fi_ai.main.settings") as mock_settings,
        patch("fi_ai.main.run_research.delay") as mock_delay,
    ):
        mock_settings.internal_service_token = TEST_TOKEN_PRESERVATION
        response = TestClient(app).post(
            "/internal/research/runs/r1/start",
            headers={"x-internal-token": TEST_TOKEN_PRESERVATION},
        )

    assert response.status_code == 202
    assert response.json() == {"run_id": "r1", "queued": True}
    mock_delay.assert_called_once_with("r1")


def test_t16_start_run_no_token_returns_401():
    """T-16: POST /internal/research/runs/r1/start with no token → HTTP 401.

    Preservation (req. 3.4): auth rejection for missing token must be unchanged.
    """
    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TEST_TOKEN_PRESERVATION
        response = TestClient(app).post("/internal/research/runs/r1/start")

    assert response.status_code == 401


def test_t17_start_run_wrong_token_returns_401():
    """T-17: POST /internal/research/runs/r1/start with wrong token → HTTP 401.

    Preservation (req. 3.4): auth rejection for invalid token must be unchanged.
    """
    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TEST_TOKEN_PRESERVATION
        response = TestClient(app).post(
            "/internal/research/runs/r1/start",
            headers={"x-internal-token": "definitely-wrong"},
        )

    assert response.status_code == 401
