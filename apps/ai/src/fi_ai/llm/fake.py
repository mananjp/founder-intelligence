"""FakeLLM — scriptable completion backend for unit tests.

This module lives in ``fi_ai.llm`` so it is importable alongside the real
router without pulling in test-only dependencies into the test directory.

Usage
-----
    from fi_ai.llm.fake import FakeLLM
    from fi_ai.llm.router import set_completion_backend, reset_completion_backend

    fake = FakeLLM()
    fake.enqueue_json({"value": "hello"})
    set_completion_backend(fake)
    try:
        result = complete_structured("classify_source", messages, MySchema)
    finally:
        reset_completion_backend()

Supported scenarios
-------------------
enqueue_json(dict)           — valid structured JSON (success path)
enqueue_raw(str)             — arbitrary string, e.g. invalid JSON
enqueue_error(exc)           — raises a provider-level exception
enqueue_validation_fail(dict)— JSON that parses but fails Pydantic validation

After the queue is empty, calling the backend raises ``StopIteration``.
"""
from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Minimal response shape that matches what router.py reads
# ---------------------------------------------------------------------------

@dataclass
class _FakeUsage:
    prompt_tokens: int = 10
    completion_tokens: int = 20


@dataclass
class _FakeMessage:
    content: str = ""


@dataclass
class _FakeChoice:
    message: _FakeMessage = field(default_factory=_FakeMessage)


class _FakeResponse:
    """Mimics the fields the router reads from a real LiteLLM ModelResponse."""

    def __init__(
        self,
        content: str,
        cost: float = 0.001,
        input_tokens: int = 100,
        output_tokens: int = 50,
    ) -> None:
        self.choices = [_FakeChoice(message=_FakeMessage(content=content))]
        self.usage = _FakeUsage(prompt_tokens=input_tokens, completion_tokens=output_tokens)
        self._hidden_params: dict[str, Any] = {"response_cost": cost}


# ---------------------------------------------------------------------------
# FakeLLM
# ---------------------------------------------------------------------------

class FakeLLM:
    """Scriptable drop-in for the LiteLLM completion backend.

    Not thread-safe — designed for single-threaded unit tests.
    """

    def __init__(self) -> None:
        self._queue: deque[Any] = deque()
        self.call_count: int = 0
        self.calls: list[dict] = []  # [{model, messages, kwargs}, ...]

    # ------------------------------------------------------------------
    # Queue builders — each returns self for chaining
    # ------------------------------------------------------------------

    def enqueue_json(
        self,
        data: dict,
        *,
        cost: float = 0.001,
        input_tokens: int = 100,
        output_tokens: int = 50,
    ) -> FakeLLM:
        """Queue a successful, fully-valid JSON response."""
        self._queue.append(
            _FakeResponse(
                json.dumps(data),
                cost=cost,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        )
        return self

    def enqueue_raw(self, text: str, *, cost: float = 0.0) -> FakeLLM:
        """Queue a raw string — use for invalid JSON or markdown-wrapped responses."""
        self._queue.append(_FakeResponse(text, cost=cost))
        return self

    def enqueue_error(self, exc: Exception) -> FakeLLM:
        """Queue a provider-level exception (network error, rate limit, etc.)."""
        self._queue.append(exc)
        return self

    def enqueue_validation_fail(self, data: dict, *, cost: float = 0.0) -> FakeLLM:
        """Queue JSON that parses OK but will fail Pydantic validation.

        Pass a dict that is intentionally wrong for the target schema
        (e.g. missing required fields, wrong types).
        """
        self._queue.append(_FakeResponse(json.dumps(data), cost=cost))
        return self

    # ------------------------------------------------------------------
    # Backend callable — matches router._default_completion signature
    # ------------------------------------------------------------------

    def __call__(self, *, model: str, messages: list[dict], **kwargs: Any) -> Any:
        self.call_count += 1
        self.calls.append({"model": model, "messages": list(messages), "kwargs": kwargs})

        if not self._queue:
            raise StopIteration(
                "FakeLLM queue is empty — enqueue a response before calling."
            )

        item = self._queue.popleft()

        if isinstance(item, BaseException):
            raise item

        return item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Clear queue and counters between tests."""
        self._queue.clear()
        self.call_count = 0
        self.calls = []
