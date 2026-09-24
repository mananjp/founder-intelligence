"""LLM router: task -> tier -> model, with retries, structured output validation and cost logging.

Rules:
  * Call sites pass a TASK NAME, never a model name.
  * Structured outputs are validated with Pydantic; on failure retry once with the validation error appended.
  * Every call is logged to `llm_calls` (task, model, tokens, cost, latency, run_id) and traced in Langfuse.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import TypeVar

import yaml
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)
_CFG = yaml.safe_load(Path(__file__).with_name("models.yaml").read_text())


def _expand(v: str) -> str:
    return re.sub(r"\$\{(\w+)\}", lambda m: os.getenv(m.group(1), ""), v)


def model_for(task: str) -> str:
    tier = _CFG["tasks"][task]
    return _expand(_CFG["tiers"][tier]["model"])


def complete_structured[T: BaseModel](
    task: str, messages: list[dict], schema: type[T], run_id: str | None = None
) -> T:
    """TODO(AI): implement with litellm.completion(response_format=schema) + validation/retry + cost accounting."""
    raise NotImplementedError
