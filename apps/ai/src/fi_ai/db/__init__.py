"""SQLAlchemy Core table definitions mirroring db/migrations (do NOT autogenerate migrations here)."""

from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from fi_ai.config import settings
from fi_ai.db.repositories import PostgresRepository
from fi_ai.db.tables import metadata


def _normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


engine: AsyncEngine = create_async_engine(
    _normalize_db_url(settings.database_url),
    pool_pre_ping=True,
)


def repository(connection: AsyncConnection | None = None) -> PostgresRepository:
    """Repository bound to the application engine (or to a caller-owned transaction)."""
    return PostgresRepository(engine, connection)


__all__ = ["PostgresRepository", "engine", "metadata", "repository"]
