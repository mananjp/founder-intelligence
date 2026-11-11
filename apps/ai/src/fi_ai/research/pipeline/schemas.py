
"""Validated structured outputs for the Scope and Plan research stages."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from fi_ai.evidence.schemas import SourceType


class ResearchQuestion(BaseModel):
    """A prioritized research question produced by the Scope stage."""

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(pattern=r"^rq_[a-f0-9]{16}$")
    question: str = Field(min_length=10, max_length=1000)
    priority: int = Field(ge=1, le=5)
    required_source_classes: list[SourceType] = Field(min_length=1)
    evidence_target: str = Field(min_length=5, max_length=1000)

    @model_validator(mode="after")
    def validate_source_classes(self) -> ResearchQuestion:
        if len(self.required_source_classes) != len(set(self.required_source_classes)):
            raise ValueError("required_source_classes must not contain duplicates")
        return self


class ScopeResult(BaseModel):
    """Complete structured output from the Scope stage."""

    model_config = ConfigDict(extra="forbid")

    questions: list[ResearchQuestion] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_unique_questions(self) -> ScopeResult:
        ids = [item.question_id for item in self.questions]
        normalized = [item.question.strip().casefold() for item in self.questions]

        if len(ids) != len(set(ids)):
            raise ValueError("Scope output contains duplicate question IDs")

        if len(normalized) != len(set(normalized)):
            raise ValueError("Scope output contains duplicate research questions")

        return self


class PlannedTask(BaseModel):
    """One executable research task produced by the Plan stage."""

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(pattern=r"^rq_[a-f0-9]{16}$")
    task_type: Literal["search", "fetch", "extract"]
    query: str = Field(min_length=3, max_length=2000)
    source_class: SourceType
    priority: int = Field(ge=1, le=5)
    required_source_classes: list[SourceType] = Field(min_length=1)
    budget_usd: float = Field(gt=0, le=12)

    @field_validator("budget_usd", mode="before")
    @classmethod
    def validate_budget_precision(cls, value: object) -> float:
        """Require task budgets to fit the database's two-decimal precision."""
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError) as exc:
            raise ValueError("budget_usd must be a valid decimal amount") from exc

        if not amount.is_finite():
            raise ValueError("budget_usd must be finite")

        if amount <= 0 or amount > 12:
            raise ValueError("Each task budget must be greater than $0 and at most $12")

        if amount != amount.quantize(Decimal("0.01")):
            raise ValueError("budget_usd must have at most two decimal places")

        return float(amount)

    @model_validator(mode="after")
    def validate_task(self) -> PlannedTask:
        if len(self.required_source_classes) != len(set(self.required_source_classes)):
            raise ValueError("required_source_classes must not contain duplicates")

        if self.source_class not in self.required_source_classes:
            raise ValueError("source_class must be included in required_source_classes")

        return self


class PlanResult(BaseModel):
    """Complete structured output from the Plan stage."""

    model_config = ConfigDict(extra="forbid")

    tasks: list[PlannedTask] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_unique_tasks(self) -> PlanResult:
        keys = [
            (
                item.question_id,
                item.task_type,
                item.source_class.value,
                item.query.strip().casefold(),
            )
            for item in self.tasks
        ]

        if len(keys) != len(set(keys)):
            raise ValueError("Plan output contains duplicate tasks")

        return self

    def validate_question_references(self, question_ids: set[str]) -> None:
        """Ensure every planned task refers to a question in the current scope."""
        unknown_ids = {task.question_id for task in self.tasks} - question_ids

        if unknown_ids:
            raise ValueError(
                f"Plan contains unknown question IDs: {sorted(unknown_ids)}"
            )

    def validate_total_budget(self, available_budget_usd: float) -> None:
        """Reject plans whose combined task budgets exceed the run budget."""
        available = Decimal(str(available_budget_usd))

        if not available.is_finite() or available <= 0:
            raise ValueError("Available run budget must be greater than zero")

        total = sum(
            (Decimal(str(task.budget_usd)) for task in self.tasks),
            start=Decimal(0),
        )

        if total > available:
            raise ValueError(
                f"Planned task budgets (${total:.2f}) exceed "
                f"the available run budget (${available:.2f})"
            )
