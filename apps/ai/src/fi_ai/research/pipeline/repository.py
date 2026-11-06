
"""Synchronous PostgreSQL repository for Scope and Plan pipeline stages."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from fi_ai.config import settings


class ResearchRepositoryError(RuntimeError):
    """Raised when research pipeline persistence fails."""


def _database_dsn() -> str:
    """Convert SQLAlchemy-style PostgreSQL URLs into psycopg-compatible DSNs."""
    url = settings.database_url

    for prefix in (
        "postgresql+psycopg://",
        "postgresql+psycopg2://",
        "postgres://",
    ):
        if url.startswith(prefix):
            return "postgresql://" + url.removeprefix(prefix)

    return url


def _connect() -> psycopg.Connection:
    """Open a synchronous database connection."""
    return psycopg.connect(_database_dsn(), row_factory=dict_row)


def _depth_budget(depth: str) -> float:
    """Return the configured default budget for a research depth."""
    budgets = {
        "quick": settings.run_budget_usd_quick,
        "standard": settings.run_budget_usd_standard,
        "deep": settings.run_budget_usd_deep,
    }

    try:
        return float(budgets[depth])
    except KeyError as exc:
        raise ResearchRepositoryError(
            f"Unsupported research depth: {depth!r}"
        ) from exc


def stable_question_id(brief_id: str, question: str) -> str:
    """Generate a deterministic question ID for a brief and question."""
    normalized = " ".join(question.casefold().split())
    digest = hashlib.sha256(f"{brief_id}:{normalized}".encode()).hexdigest()
    return f"rq_{digest[:16]}"


def stable_task_key(
    question_id: str,
    task_type: str,
    source_class: str,
    query: str,
) -> str:
    """Generate a deterministic natural key for a research task."""
    normalized_query = " ".join(query.casefold().split())
    raw = f"{question_id}:{task_type}:{source_class}:{normalized_query}"
    return hashlib.sha256(raw.encode()).hexdigest()


class ResearchRepository:
    """Database access for the Scope and Plan stages."""

    def load_run_bundle(self, run_id: str) -> dict[str, Any]:
        """Load a research run and its associated research brief."""
        try:
            run_uuid = UUID(run_id)
        except ValueError as exc:
            raise ResearchRepositoryError(
                f"Invalid research run ID: {run_id!r}"
            ) from exc

        query = """
            SELECT
                rr.id AS run_id,
                rr.brief_id,
                rr.depth,
                rr.geography AS run_geography,
                rr.budget_usd,
                rr.spent_usd,
                rb.problem,
                rb.customer,
                rb.geography AS brief_geography,
                rb.category,
                rb.alternatives,
                rb.business_model,
                rb.differentiation,
                rb.known_evidence,
                rb.unknowns,
                rb.research_questions
            FROM research_runs AS rr
            JOIN research_briefs AS rb
                ON rb.id = rr.brief_id
            WHERE rr.id = %s
        """

        try:
            with _connect() as conn, conn.cursor() as cursor:
                cursor.execute(query, (run_uuid,))
                row = cursor.fetchone()

                if row is None:
                    raise ResearchRepositoryError(
                        f"Research run or linked brief not found: {run_id}"
                    )

                row = dict(row)
                row["budget_usd"] = float(
                    row["budget_usd"]
                    if row["budget_usd"] is not None
                    else _depth_budget(row["depth"])
                )
                row["spent_usd"] = float(row["spent_usd"] or 0)

                if row["budget_usd"] <= 0:
                    raise ResearchRepositoryError(
                        "Research run budget must be greater than zero"
                    )

                if row["spent_usd"] < 0:
                    raise ResearchRepositoryError(
                        "Research run spent_usd cannot be negative"
                    )

                if row["spent_usd"] > row["budget_usd"]:
                    raise ResearchRepositoryError(
                        "Research run has already exceeded its budget"
                    )

                row["available_budget_usd"] = (
                    row["budget_usd"] - row["spent_usd"]
                )
                row["geography"] = (
                    row["run_geography"] or row["brief_geography"] or []
                )
                row["known_evidence"] = row["known_evidence"] or []
                row["unknowns"] = row["unknowns"] or []
                row["research_questions"] = row["research_questions"] or []

                return row

        except psycopg.Error as exc:
            raise ResearchRepositoryError(
                f"Could not load research run {run_id}: {exc}"
            ) from exc

    def save_scope_questions(
        self,
        brief_id: str,
        questions: list[dict[str, Any]],
    ) -> None:
        """Persist Scope questions transactionally."""
        try:
            brief_uuid = UUID(brief_id)
        except ValueError as exc:
            raise ResearchRepositoryError(
                f"Invalid research brief ID: {brief_id!r}"
            ) from exc

        query = """
            UPDATE research_briefs
            SET research_questions = %s::jsonb
            WHERE id = %s
        """

        try:
            with _connect() as conn, conn.cursor() as cursor:
                cursor.execute(query, (json.dumps(questions), brief_uuid))

                if cursor.rowcount != 1:
                    raise ResearchRepositoryError(
                        f"Research brief not found: {brief_id}"
                    )

        except psycopg.Error as exc:
            raise ResearchRepositoryError(
                f"Could not save Scope questions for brief {brief_id}: {exc}"
            ) from exc

    def has_plan_tasks(self, run_id: str) -> bool:
        """Check whether a run already has persisted Plan tasks."""
        try:
            run_uuid = UUID(run_id)
        except ValueError as exc:
            raise ResearchRepositoryError(
                f"Invalid research run ID: {run_id!r}"
            ) from exc

        query = """
            SELECT EXISTS (
                SELECT 1
                FROM research_tasks
                WHERE run_id = %s
            ) AS has_tasks
        """

        try:
            with _connect() as conn, conn.cursor() as cursor:
                cursor.execute(query, (run_uuid,))
                row = cursor.fetchone()
                return bool(row["has_tasks"])

        except psycopg.Error as exc:
            raise ResearchRepositoryError(
                f"Could not check Plan tasks for run {run_id}: {exc}"
            ) from exc

    def save_plan_tasks(
        self,
        run_id: str,
        tasks: list[dict[str, Any]],
    ) -> int:
        """Insert tasks without overwriting existing task execution state."""
        try:
            run_uuid = UUID(run_id)
        except ValueError as exc:
            raise ResearchRepositoryError(
                f"Invalid research run ID: {run_id!r}"
            ) from exc

        query = """
            INSERT INTO research_tasks (
                run_id,
                question_id,
                research_question,
                task_key,
                task_type,
                query,
                source_class,
                priority,
                required_source_classes,
                budget_usd,
                metadata
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
            )
            ON CONFLICT (run_id, task_key)
            DO NOTHING
        """

        inserted = 0

        try:
            with _connect() as conn, conn.cursor() as cursor:
                for task in tasks:
                    cursor.execute(
                        query,
                        (
                            run_uuid,
                            task["question_id"],
                            task["research_question"],
                            task["task_key"],
                            task["task_type"],
                            task["query"],
                            task["source_class"],
                            task["priority"],
                            task["required_source_classes"],
                            task["budget_usd"],
                            json.dumps(task.get("metadata", {})),
                        ),
                    )
                    inserted += cursor.rowcount

            return inserted

        except psycopg.Error as exc:
            raise ResearchRepositoryError(
                f"Could not save Plan tasks for run {run_id}: {exc}"
            ) from exc
