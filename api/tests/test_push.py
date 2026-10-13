"""Admin notifications for new pickup requests: browser push (Web Push) and the portal's live alerts."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from pywebpush import WebPushException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings
from app.models import Pickup, PickupChannel, PushSubscription, Role
from app.services import push
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

SUB = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc123-device-token",
    "keys": {"p256dh": "BOrDummyPublicKeyForTests0123456789abcdefghij", "auth": "dummyAuthSecret1"},
    "expirationTime": None,
}


@pytest.fixture
def push_on(monkeypatch) -> list[tuple[dict, dict]]:
    """Push configured, and every send captured instead of going to a real push service."""
    settings = Settings(vapid_public_key="BPublicKeyForTests", vapid_private_key="private-key-for-tests")
    from app.routers import push as push_router

    monkeypatch.setattr(push, "get_settings", lambda: settings)
    monkeypatch.setattr(push_router, "get_settings", lambda: settings)
    sent: list[tuple[dict, dict]] = []

    async def fake_send(subscription_info, data=None, **kwargs):
        import json

        if "gone" in subscription_info["endpoint"]:
            raise WebPushException("gone", response=type("R", (), {"status": 410})())
        sent.append((subscription_info, json.loads(data)))
        return None

    monkeypatch.setattr(push, "webpush_async", fake_send)
    return sent


async def test_public_key_is_null_until_configured(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(push, "get_settings", lambda: Settings(vapid_public_key="", vapid_private_key=""))
    assert (await client.get("/api/v1/push/public-key")).json() == {"public_key": None}


async def test_only_admins_can_subscribe(client: AsyncClient, session: AsyncSession, push_on) -> None:
    user = await make_user(session, "Chinaza")
    assert (await client.post("/api/v1/push/subscriptions", json=SUB, headers=bearer(user.id))).status_code == 403
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    assert (await client.post("/api/v1/push/subscriptions", json=SUB, headers=bearer(admin.id))).status_code == 204
    # Same browser again (e.g. keys rotated): one row, updated.
    again = {**SUB, "keys": {**SUB["keys"], "auth": "newAuthSecret22"}}
    assert (await client.post("/api/v1/push/subscriptions", json=again, headers=bearer(admin.id))).status_code == 204
    rows = (await session.exec(select(PushSubscription))).all()
    assert [(r.profile_id, r.auth) for r in rows] == [(admin.id, "newAuthSecret22")]
    bad = await client.post("/api/v1/push/subscriptions", json={**SUB, "endpoint": "http://evil.example/x" * 2},
                            headers=bearer(admin.id))
    assert bad.status_code == 422
    gone = await client.request("DELETE", "/api/v1/push/subscriptions", json={"endpoint": SUB["endpoint"]},
                                headers=bearer(admin.id))
    assert gone.status_code == 204 and (await session.exec(select(PushSubscription))).all() == []


async def test_new_request_pushes_to_active_admins_only(session: AsyncSession, push_on) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    retired = await make_user(session, "Old", role=Role.ADMIN, is_active=False)
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    for who, endpoint in ((admin, "https://push.example/admin-phone"), (admin, "https://push.example/gone-laptop"),
                          (retired, "https://push.example/retired"), (collector, "https://push.example/collector")):
        session.add(PushSubscription(profile_id=who.id, endpoint=endpoint, p256dh="k" * 30, auth="a" * 16))
    customer = await make_user(session, "Chinaza Okafor")
    pickup = Pickup(user_id=customer.id, channel=PickupChannel.DOOR, area="Independence Layout",
                    estimated_kg=Decimal("20.00"), pooled=True, preferred_date=date(2026, 10, 14))
    session.add(pickup)
    await session.flush()

    assert await push.notify_new_request(session, pickup.id) == 1
    (info, message), = push_on
    assert info["endpoint"] == "https://push.example/admin-phone"
    assert message["title"] == "New pickup request: Chinaza (pool)"
    assert message["body"] == "Independence Layout · est. 20.00 kg · 14 Oct"
    assert message["url"] == "/ops-portal/pickups?status=REQUESTED"
    assert "Okafor" not in str(message) and customer.phone not in str(message)
    # The push service said the laptop's subscription is gone: it was deleted.
    endpoints = {s.endpoint for s in (await session.exec(select(PushSubscription))).all()}
    assert "https://push.example/gone-laptop" not in endpoints and len(endpoints) == 3


async def test_push_off_sends_nothing_and_never_raises(session: AsyncSession, monkeypatch) -> None:
    monkeypatch.setattr(push, "get_settings", lambda: Settings(vapid_public_key="", vapid_private_key=""))
    customer = await make_user(session, "Chinaza")
    pickup = Pickup(user_id=customer.id, channel=PickupChannel.DOOR)
    session.add(pickup)
    await session.flush()
    assert await push.notify_new_request(session, pickup.id) == 0


async def test_new_requests_feed_for_the_portal(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    customer = await make_user(session, "Ngozi Eze")
    first = (await client.get("/api/v1/admin/pickups/new", headers=bearer(admin.id))).json()
    assert first["items"] == []
    cursor = first["cursor"]

    later = datetime.fromisoformat(cursor) + timedelta(seconds=1) if cursor else datetime.now(timezone.utc)
    session.add(Pickup(user_id=customer.id, channel=PickupChannel.DOOR, area="Trans-Ekulu",
                       estimated_kg=Decimal("60"), created_at=later))
    session.add(Pickup(user_id=customer.id, channel=PickupChannel.HUB, created_at=later))  # walk-ins don't alert
    await session.flush()

    feed = (await client.get("/api/v1/admin/pickups/new", params={"after": cursor}, headers=bearer(admin.id))).json()
    assert [(i["user_name"], i["area"], i["estimated_kg"]) for i in feed["items"]] == [("Ngozi", "Trans-Ekulu", "60.00")]
    again = (await client.get("/api/v1/admin/pickups/new", params={"after": feed["cursor"]}, headers=bearer(admin.id))).json()
    assert again["items"] == []
    user = await make_user(session, "Chinaza")
    assert (await client.get("/api/v1/admin/pickups/new", headers=bearer(user.id))).status_code == 403
