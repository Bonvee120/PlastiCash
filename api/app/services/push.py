"""Browser push (Web Push with VAPID) to admins when a customer requests a pickup.

Each admin browser or phone that turned notifications on has a row in `push_subscriptions`. Messages are encrypted
for that browser (aes128gcm) and sent through its push service (Google, Mozilla, Apple). A subscription the push
service says is gone (404/410) is deleted. Push is off while VAPID_PRIVATE_KEY is empty; nothing else depends on it."""
import asyncio
import json
import logging
from uuid import UUID

import aiohttp
from pywebpush import WebPushException, webpush_async
from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.models import Pickup, Profile, PushSubscription, Role

log = logging.getLogger(__name__)

WINDOWS = {"MORNING": "9 am to 12 pm", "AFTERNOON": "12 pm to 4 pm"}


def enabled() -> bool:
    settings = get_settings()
    return bool(settings.vapid_private_key and settings.vapid_public_key)


def new_request_message(pickup: Pickup, customer: Profile) -> dict:
    """What the admin sees. First name and area only (no phone or street) since it passes through push services."""
    from app.schemas import display_name

    name = display_name(customer) or "A customer"
    when = pickup.preferred_date.strftime("%d %b") if pickup.preferred_date else ""
    window = WINDOWS.get(pickup.preferred_window.value if pickup.preferred_window else "", "")
    parts = [pickup.area or "", f"est. {pickup.estimated_kg} kg" if pickup.estimated_kg is not None else "",
             f"{when}, {window}".strip(", ")]
    return {
        "title": f"New pickup request: {name}" + (" (pool)" if pickup.pooled else ""),
        "body": " · ".join(p for p in parts if p),
        "url": "/ops-portal/pickups?status=REQUESTED",
        "tag": f"pickup-{pickup.id}",
    }


async def _send_all(session: AsyncSession, subscriptions: list[PushSubscription], message: dict) -> int:
    """Send to each subscription at once; delete the ones the push service says are gone. Returns how many arrived."""
    settings = get_settings()
    data = json.dumps(message)
    gone: list[UUID] = []

    async def one(http: aiohttp.ClientSession, sub: PushSubscription) -> bool:
        try:
            await webpush_async(
                {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=data,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=24 * 3600,
                timeout=10,
                aiohttp_session=http,
            )
            return True
        except WebPushException as error:
            status = getattr(error.response, "status", None) or getattr(error.response, "status_code", None)
            if status in (404, 410):
                gone.append(sub.id)
            else:
                log.warning("push failed with status %s", status)
            return False
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
            log.warning("push failed: %s", type(error).__name__)
            return False

    async with aiohttp.ClientSession() as http:
        results = await asyncio.gather(*(one(http, sub) for sub in subscriptions))
    if gone:
        await session.exec(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
        await session.commit()
    return sum(results)


async def admin_subscriptions(session: AsyncSession) -> list[PushSubscription]:
    rows = await session.exec(
        select(PushSubscription)
        .join(Profile, Profile.id == PushSubscription.profile_id)
        .where(Profile.role == Role.ADMIN, Profile.is_active)
    )
    return list(rows.all())


async def notify_new_request(session: AsyncSession, pickup_id: UUID) -> int:
    """Push "new pickup request" to every active admin's devices. Never raises: a request must not fail over push."""
    if not enabled():
        return 0
    try:
        pickup = await session.get(Pickup, pickup_id)
        customer = await session.get(Profile, pickup.user_id) if pickup else None
        subscriptions = await admin_subscriptions(session)
        if not pickup or not customer or not subscriptions:
            return 0
        return await _send_all(session, subscriptions, new_request_message(pickup, customer))
    except Exception:  # noqa: BLE001 - logged; the pickup itself is already saved
        log.exception("push for new pickup %s failed", pickup_id)
        return 0


async def send_test(session: AsyncSession, profile_id: UUID) -> int:
    rows = await session.exec(select(PushSubscription).where(PushSubscription.profile_id == profile_id))
    message = {"title": "PlastiCash notifications are on", "body": "You'll get a message like this for every new pickup request.",
               "url": "/ops-portal/pickups?status=REQUESTED", "tag": "test"}
    return await _send_all(session, list(rows.all()), message)
