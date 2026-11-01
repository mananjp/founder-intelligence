from unittest.mock import patch

from fastapi.testclient import TestClient
from prometheus_client import generate_latest

from fi_ai.main import app
from fi_ai.metrics import record_llm_usage
from fi_ai.research.orchestrator import Orchestrator, _registry
from fi_ai.research.state import RunState


def test_metrics_endpoint_returns_prometheus_exposition() -> None:
    response = TestClient(app).get("/metrics")

    assert response.status_code == 200
    content_type = response.headers["content-type"]
    assert content_type.startswith("text/plain;")
    assert "version=" in content_type
    assert "# TYPE fi_ai_stage_duration_seconds histogram" in response.text
    assert "fi_ai_runs_total" in response.text
    assert "fi_ai_llm_tokens_total" in response.text
    assert "fi_ai_llm_cost_usd_total" in response.text
    assert "fi_ai_budget_exceeded_total" in response.text


def test_llm_usage_is_counted_by_task_and_model() -> None:
    task = "metrics_test_task"
    model = "metrics-test-model"

    record_llm_usage(
        task=task,
        model=model,
        prompt_tokens=17,
        completion_tokens=5,
        cost_usd=0.125,
    )
    exposition = generate_latest().decode("utf-8")

    assert f'fi_ai_llm_tokens_total{{model="{model}",task="{task}",token_type="prompt"}} 17.0' in exposition
    assert f'fi_ai_llm_tokens_total{{model="{model}",task="{task}",token_type="completion"}} 5.0' in exposition
    assert f'fi_ai_llm_cost_usd_total{{model="{model}",task="{task}"}} 0.125' in exposition


def test_orchestrator_records_stage_duration_and_final_state() -> None:
    orchestrator = Orchestrator("metrics-test-run")
    events = []
    orchestrator.ctx.publish = events.append
    stages = {state: lambda _ctx: None for state in _registry()}

    with patch("fi_ai.research.orchestrator._registry", return_value=stages):
        result = orchestrator.execute()

    exposition = generate_latest().decode("utf-8")
    assert result == RunState.COMPLETED
    assert f'fi_ai_stage_duration_seconds_count{{stage="{RunState.SCOPING.value}"}}' in exposition
    assert 'fi_ai_runs_total{state="completed"}' in exposition


def _budget_exceeded_value() -> float:
    for line in generate_latest().decode("utf-8").splitlines():
        if line.startswith("fi_ai_budget_exceeded_total "):
            return float(line.rsplit(" ", maxsplit=1)[1])
    raise AssertionError("budget-exceeded metric was not exported")


def test_budget_exhaustion_increments_counter_once() -> None:
    before = _budget_exceeded_value()
    orchestrator = Orchestrator("metrics-budget-test-run")
    orchestrator.ctx.spent_usd = orchestrator.ctx.budget_usd

    result = orchestrator.execute()

    assert result == RunState.PARTIAL
    assert _budget_exceeded_value() == before + 1
