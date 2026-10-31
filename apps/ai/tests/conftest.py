"""Shared test fixtures.

Integration tests require a disposable, real PostgreSQL 16 database with pgvector:

    set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/fi_test
    uv run pytest -m integration

The fixture refuses to touch a database whose name does not contain ``test``. It applies
the real ``db/migrations/*.sql`` files (never ``metadata.create_all()``) and truncates
rows between tests.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.engine import URL, make_url

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = REPO_ROOT / "db" / "migrations"


def pytest_configure(config: pytest.Config) -> None:
    # psycopg's async driver refuses Windows' default ProactorEventLoop.
    if sys.platform == "win32":
        import asyncio

        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def _async_url(url: URL) -> str:
    return url.set(drivername="postgresql+psycopg").render_as_string(hide_password=False)


def _sync_url(url: URL) -> str:
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


def _resolve_test_url() -> URL:
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL is not set; real PostgreSQL integration tests were not run")

    url = make_url(raw)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("TEST_DATABASE_URL must point at PostgreSQL")
    database = (url.database or "").lower()
    if "test" not in database:
        raise RuntimeError(
            "Refusing to reset a non-test database: TEST_DATABASE_URL database name must contain 'test'"
        )
    return url


def _iter_statements(sql: str) -> Iterator[str]:
    """Split SQL on semicolons, ignoring comments and quoted literals.

    The migrations contain semicolons inside ``--`` comments (for example
    "geography is first-class (Bible §38)"), so a naive ``str.split(';')`` corrupts
    statements. This small state machine keeps the tests independent of a ``psql``
    client binary while still executing the migration files verbatim.
    """
    buffer: list[str] = []
    index = 0
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False

    while index < len(sql):
        char = sql[index]
        following = sql[index + 1] if index + 1 < len(sql) else ""

        if in_line_comment:
            buffer.append(char)
            if char == "\n":
                in_line_comment = False
        elif in_block_comment:
            buffer.append(char)
            if char == "*" and following == "/":
                buffer.append(following)
                index += 1
                in_block_comment = False
        elif in_single:
            buffer.append(char)
            if char == "'":
                if following == "'":
                    buffer.append(following)
                    index += 1
                else:
                    in_single = False
        elif in_double:
            buffer.append(char)
            if char == '"':
                if following == '"':
                    buffer.append(following)
                    index += 1
                else:
                    in_double = False
        elif char == "-" and following == "-":
            buffer.extend((char, following))
            index += 1
            in_line_comment = True
        elif char == "/" and following == "*":
            buffer.extend((char, following))
            index += 1
            in_block_comment = True
        elif char == "'":
            buffer.append(char)
            in_single = True
        elif char == '"':
            buffer.append(char)
            in_double = True
        elif char == ";":
            statement = "".join(buffer).strip()
            if statement:
                yield statement
            buffer = []
        else:
            buffer.append(char)
        index += 1

    statement = "".join(buffer).strip()
    if statement:
        yield statement


@pytest.fixture(scope="session")
def test_database_url() -> URL:
    return _resolve_test_url()


@pytest.fixture(scope="session")
def migrated_database(test_database_url: URL) -> URL:
    import psycopg

    statements: list[str] = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        statements.extend(_iter_statements(path.read_text(encoding="utf-8")))

    with psycopg.connect(_sync_url(test_database_url), autocommit=True) as connection:
        connection.execute("drop schema if exists public cascade")
        connection.execute("create schema public")
        for statement in statements:
            try:
                connection.execute(statement)
            except psycopg.errors.FeatureNotSupported:
                # pgserver bundles pgvector but not the optional pgcrypto contrib files.
                # PostgreSQL >= 13 ships gen_random_uuid() in core, which is what the
                # migration actually relies on, so verify it and continue.
                if "pgcrypto" not in statement.lower():
                    raise
                connection.execute("select gen_random_uuid()")

    return test_database_url


@pytest.fixture(scope="session")
def db_engine(migrated_database: URL):
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(_async_url(migrated_database), poolclass=NullPool)
    yield engine
    engine.sync_engine.dispose()


@pytest.fixture(autouse=True)
def clean_database(request: pytest.FixtureRequest) -> Iterator[None]:
    """Truncate all data before each integration test (no-op for unit tests)."""
    if request.node.get_closest_marker("integration") is None:
        yield
        return

    migrated_database: URL = request.getfixturevalue("migrated_database")
    import psycopg

    tables = (
        "claim_contradictions, claim_evidence, insights, evidence, claims, "
        "recommendations, decisions, experiments, assumptions, opportunity_scores, "
        "llm_calls, research_runs, sources, research_briefs, ideas, workspaces, users"
    )
    with psycopg.connect(_sync_url(migrated_database), autocommit=True) as connection:
        connection.execute(f"truncate table {tables} restart identity cascade")
    yield


@dataclass(frozen=True, slots=True)
class Seed:
    user_id: UUID
    workspace_id: UUID
    idea_id: UUID
    brief_id: UUID
    run_id: UUID


async def seed_research_graph(engine, *, version: int = 1) -> Seed:
    """Insert the 001/002 rows every repository operation depends on."""
    from fi_ai.db.tables import ideas, research_briefs, research_runs, users, workspaces

    user_id, workspace_id, idea_id, brief_id, run_id = (uuid4() for _ in range(5))
    async with engine.begin() as connection:
        await connection.execute(users.insert().values(id=user_id, email=f"fi-test-{user_id}@example.com"))
        await connection.execute(
            workspaces.insert().values(id=workspace_id, name="Test workspace", owner_id=user_id)
        )
        await connection.execute(
            ideas.insert().values(
                id=idea_id,
                workspace_id=workspace_id,
                created_by=user_id,
                title="Test idea",
                raw_description="A test idea",
            )
        )
        await connection.execute(
            research_briefs.insert().values(id=brief_id, idea_id=idea_id, version=version)
        )
        await connection.execute(
            research_runs.insert().values(
                id=run_id,
                workspace_id=workspace_id,
                idea_id=idea_id,
                brief_id=brief_id,
                depth="quick",
                geography=["AE"],
                created_by=user_id,
            )
        )
    return Seed(
        user_id=user_id,
        workspace_id=workspace_id,
        idea_id=idea_id,
        brief_id=brief_id,
        run_id=run_id,
    )


@pytest.fixture
async def seed(db_engine) -> Seed:
    return await seed_research_graph(db_engine)


async def latest_brief_version(engine, idea_id: UUID) -> int | None:
    from fi_ai.db.tables import research_briefs

    async with engine.begin() as connection:
        value = (
            await connection.execute(
                select(research_briefs.c.version)
                .where(research_briefs.c.idea_id == idea_id)
                .order_by(research_briefs.c.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    return value
