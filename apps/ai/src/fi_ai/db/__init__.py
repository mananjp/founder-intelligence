"""SQLAlchemy Core table definitions mirroring db/migrations (do NOT autogenerate migrations here)."""
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from fi_ai.config import settings

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
)
