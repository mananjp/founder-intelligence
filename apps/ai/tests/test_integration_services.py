"""Integration smoke tests for the PostgreSQL and Redis services used in CI."""

import os

import psycopg
import pytest
from redis import Redis


@pytest.mark.integration
def test_postgres_is_ready_and_migrations_are_applied() -> None:
    """Confirm pgvector is available and the core migration created the users table."""
    database_url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://fi:fi@localhost:5432/fi",
    )

    with psycopg.connect(database_url) as connection:
        vector_extension = connection.execute(
            "SELECT extname FROM pg_extension WHERE extname = 'vector'"
        ).fetchone()
        users_table = connection.execute(
            "SELECT to_regclass('public.users')"
        ).fetchone()

    assert vector_extension == ("vector",)
    assert users_table == ("users",)


@pytest.mark.integration
def test_redis_accepts_ping() -> None:
    """Confirm the Redis service is reachable and responding to commands."""
    redis_url = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/0")
    client = Redis.from_url(redis_url)
    try:
        assert client.ping() is True
    finally:
        client.close()
