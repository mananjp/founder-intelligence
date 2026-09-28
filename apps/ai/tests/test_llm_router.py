import pytest
from pydantic import BaseModel

from fi_ai.llm.router import _expand, complete_structured, model_for


class Result(BaseModel):
    value: str


def test_expand_model_environment_variables(monkeypatch):
    monkeypatch.setenv("MODEL_NAME", "provider/model")

    assert _expand("${MODEL_NAME}/${MISSING_MODEL}") == "provider/model/"


def test_model_for_uses_task_tier(monkeypatch):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")

    assert model_for("classify_source") == "provider/fast"


def test_unknown_task_raises_key_error():
    with pytest.raises(KeyError):
        model_for("unknown_task")


def test_structured_completion_is_explicitly_unimplemented():
    with pytest.raises(NotImplementedError):
        complete_structured("classify_source", [], Result)
