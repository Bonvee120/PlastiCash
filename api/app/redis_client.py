"""Redis for rate limiting and small caches (production: Render Key Value).

Redis is optional and fails open: with no REDIS_URL, or when Redis is down or slow, `get_redis()` returns None or
the call raises RedisError, the callers log it and carry on (no limit, no cache). Money rules never depend on Redis;
they live in Postgres (CLAUDE.md)."""
import json
import logging
import time
from functools import lru_cache
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings

log = logging.getLogger(__name__)

_last_warning = 0.0


@lru_cache
def _client(url: str) -> Redis:
    # Short timeouts: a slow Redis must not slow the API down.
    return Redis.from_url(url, decode_responses=True, socket_timeout=0.5, socket_connect_timeout=0.5,
                          health_check_interval=30)


# After a failure Redis is skipped for a while, so an outage doesn't add a connect timeout to every request.
_PAUSE_SECONDS = 30
_paused_until = 0.0


def get_redis() -> Redis | None:
    url = get_settings().redis_url
    if not url or time.monotonic() < _paused_until:
        return None
    return _client(url)


def warn(error: Exception) -> None:
    """Redis failed: skip it for 30 s, and log at most once a minute so an outage doesn't flood the logs."""
    global _last_warning, _paused_until
    _paused_until = time.monotonic() + _PAUSE_SECONDS
    if time.monotonic() - _last_warning > 60:
        _last_warning = time.monotonic()
        log.warning("Redis unavailable, continuing without it for %ss: %s", _PAUSE_SECONDS, type(error).__name__)


# ----- Cache -----


async def cache_get(key: str) -> Any | None:
    redis = get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(f"cache:{key}")
    except RedisError as error:
        warn(error)
        return None
    return json.loads(raw) if raw is not None else None


async def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    redis = get_redis()
    if redis is None:
        return
    try:
        await redis.set(f"cache:{key}", json.dumps(value, default=str), ex=ttl_seconds)
    except RedisError as error:
        warn(error)


async def cache_delete(*keys: str) -> None:
    redis = get_redis()
    if redis is None or not keys:
        return
    try:
        await redis.delete(*(f"cache:{key}" for key in keys))
    except RedisError as error:
        warn(error)
