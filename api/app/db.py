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
    settings = get_settings()
    # Supabase's session pooler allows 15 clients for the whole project. SQLAlchemy's default (5 + 10 overflow)
    # would let one API process take all 15 during a burst (a page load plus Next's prefetches), and every request
    # after that fails. Capped below the limit, extra requests wait up to pool_timeout for a free connection.
    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=30,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one async session per request.
    expire_on_commit=False so rows stay readable after commit without another round trip."""
    async with AsyncSession(get_engine(), expire_on_commit=False) as session:
        yield session
