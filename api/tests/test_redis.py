"""Redis: rate limits (429 + Retry-After, per user or per IP, fail open) and caches (prices, totals, bank list)."""
import pytest
from httpx import AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlmodel.ext.asyncio.session import AsyncSession

from app import ratelimit, redis_client
from app.redis_client import get_redis as real_get_redis  # before the autouse fixture replaces it
from app.errors import ApiError
from app.models import Material, Role
from tests.factories import make_price, make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

ESTIMATE = {"items": [{"material": "PET", "sacks": "1"}]}


async def test_limit_counts_per_user_and_says_when_to_retry(redis) -> None:
    for _ in range(3):
        await ratelimit.hit("demo", "user-a", 3, 3600)
    with pytest.raises(ApiError) as error:
        await ratelimit.hit("demo", "user-a", 3, 3600)
    assert (error.value.status_code, error.value.code) == (429, "RATE_LIMITED")
    retry = int(error.value.headers["Retry-After"])
    assert 1 <= retry <= 3600 and "Try again in" in error.value.message
    await ratelimit.hit("demo", "user-b", 3, 3600)  # someone else is not affected
    key = next(k for k in await redis.keys("rl:demo:user-a:*"))
    assert 0 < await redis.ttl(key) <= 3605  # counters expire with their window


async def test_public_estimate_is_limited_per_ip(client: AsyncClient, session: AsyncSession, redis) -> None:
    await make_price(session, Material.PET, 185)
    for _ in range(120):
        assert (await client.post("/api/v1/estimate", json=ESTIMATE)).status_code == 200
    blocked = await client.post("/api/v1/estimate", json=ESTIMATE)
    assert blocked.status_code == 429 and blocked.json()["code"] == "RATE_LIMITED"
    assert int(blocked.headers["retry-after"]) >= 1


async def test_withdrawals_are_limited_per_user(client: AsyncClient, session: AsyncSession, redis) -> None:
    user = await make_user(session, "Chinaza")
    other = await make_user(session, "Emeka")
    codes = [(await client.post("/api/v1/withdrawals", json={"amount_kobo": 100_000}, headers=bearer(user.id))).status_code
             for _ in range(6)]
    assert codes[:5] != [429] * 5 and codes[5] == 429  # the 6th in an hour is refused before any money logic runs
    first = await client.post("/api/v1/withdrawals", json={"amount_kobo": 100_000}, headers=bearer(other.id))
    assert first.status_code != 429


async def test_limits_fail_open_when_redis_is_down(monkeypatch) -> None:
    class Down:
        def pipeline(self, transaction=True):
            raise RedisConnectionError("connection refused")

    monkeypatch.setattr(ratelimit, "get_redis", lambda: Down())
    for _ in range(10):
        await ratelimit.hit("demo", "user-a", 1, 3600)  # no exception: the API keeps working without Redis


async def test_current_prices_are_cached_until_an_admin_adds_one(client: AsyncClient, session: AsyncSession, redis) -> None:
    await make_price(session, Material.PET, 185)
    first = (await client.get("/api/v1/prices/current")).json()
    assert first[0]["price_kobo_per_kg"] == 18_500 and await redis.exists("cache:prices:current")
    # A price row written behind the API's back is not seen while the cache lives...
    await make_price(session, Material.PET, 190)
    assert (await client.get("/api/v1/prices/current")).json()[0]["price_kobo_per_kg"] == 18_500
    # ...but an admin adding a price through the API clears it at once.
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    body = {"material": "PET", "price_kobo_per_kg": 20_000, "kg_per_full_sack": "10", "items_per_kg": 40,
            "co2_kg_saved_per_kg": "1.146"}
    assert (await client.post("/api/v1/admin/prices", json=body, headers=bearer(admin.id))).status_code == 201
    assert (await client.get("/api/v1/prices/current")).json()[0]["price_kobo_per_kg"] == 20_000


async def test_impact_totals_are_cached(client: AsyncClient, redis) -> None:
    first = (await client.get("/api/v1/impact/total")).json()
    assert await redis.ttl("cache:impact:total") > 0
    assert (await client.get("/api/v1/impact/total")).json() == first


async def test_cache_fails_open(monkeypatch) -> None:
    class Down:
        async def get(self, key):
            raise RedisConnectionError("down")

        async def set(self, *args, **kwargs):
            raise RedisConnectionError("down")

    monkeypatch.setattr(redis_client, "get_redis", lambda: Down())
    assert await redis_client.cache_get("anything") is None
    await redis_client.cache_set("anything", {"a": 1}, 60)  # no exception


async def test_after_a_failure_redis_is_skipped_for_a_while(monkeypatch) -> None:
    from app.config import Settings

    monkeypatch.setattr(redis_client, "get_settings", lambda: Settings(redis_url="redis://127.0.0.1:1/0"))
    monkeypatch.setattr(redis_client, "_paused_until", 0.0)
    assert real_get_redis() is not None
    redis_client.warn(RedisConnectionError("down"))
    assert real_get_redis() is None  # paused: no connect timeout on the next requests
