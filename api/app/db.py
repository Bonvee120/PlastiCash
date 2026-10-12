from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return create_async_engine(url, pool_pre_ping=True)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one async session per request.
    expire_on_commit=False so rows stay readable after commit without another round trip."""
    async with AsyncSession(get_engine(), expire_on_commit=False) as session:
        yield session
