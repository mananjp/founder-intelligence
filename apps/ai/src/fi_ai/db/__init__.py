"""SQLAlchemy Core table definitions mirroring db/migrations (do NOT autogenerate migrations here)."""
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from fi_ai.config import settings

def _normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


engine: AsyncEngine = create_async_engine(
    _normalize_db_url(settings.database_url),
    pool_pre_ping=True,
)
