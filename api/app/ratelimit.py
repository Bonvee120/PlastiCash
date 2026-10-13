"""Rate limits as FastAPI dependencies, counted in Redis (fixed windows).

    @router.post("/me/bank/resolve", dependencies=[Depends(rate_limit("bank-resolve", 10, HOUR))])

Signed-in routes count per user: most API calls come from the Next.js server, so the caller's IP would be the same
for everyone. Only routes the browser calls directly (the public estimate) count per IP. Over the limit: 429
RATE_LIMITED with Retry-After. Without Redis the limits are off (fail open); see app/redis_client.py."""
import time

from fastapi import Depends, Request
from redis.exceptions import RedisError

from app.auth import AuthUser, get_auth_user
from app.config import get_settings
from app.errors import ApiError
from app.redis_client import get_redis, warn

MINUTE, HOUR, DAY = 60, 3600, 86400


def client_ip(request: Request) -> str:
    """The caller's IP. Behind Render's proxy (TRUST_PROXY=true) it is the first X-Forwarded-For address."""
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _wait_text(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} seconds"
    if seconds < 90 * 60:
        return f"{round(seconds / 60)} minutes"
    return f"{round(seconds / 3600)} hours"


async def hit(name: str, who: str, limit: int, window_seconds: int) -> None:
    """Count one call for `who` in the current window; 429 once over `limit`."""
    redis = get_redis()
    if redis is None:
        return
    now = int(time.time())
    window_start = now - now % window_seconds
    key = f"rl:{name}:{who}:{window_start}"
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, window_seconds + 5)
            count, _ = await pipe.execute()
    except RedisError as error:
        warn(error)
        return
    if count > limit:
        retry_after = window_start + window_seconds - now
        raise ApiError(
            429,
            "RATE_LIMITED",
            f"Too many attempts. Try again in {_wait_text(max(retry_after, 1))}.",
            {"retry_after_seconds": retry_after},
            headers={"Retry-After": str(max(retry_after, 1))},
        )


def rate_limit(name: str, limit: int, window_seconds: int):
    """Per signed-in user (the token's subject)."""

    async def dependency(user: AuthUser = Depends(get_auth_user)) -> None:
        await hit(name, str(user.id), limit, window_seconds)

    dependency.__name__ = f"rate_limit_{name.replace('-', '_')}"
    return dependency


def rate_limit_ip(name: str, limit: int, window_seconds: int):
    """Per IP, for public routes the browser calls directly."""

    async def dependency(request: Request) -> None:
        await hit(name, client_ip(request), limit, window_seconds)

    dependency.__name__ = f"rate_limit_ip_{name.replace('-', '_')}"
    return dependency
