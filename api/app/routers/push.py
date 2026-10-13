"""Browser push sign-up for admins (new pickup request alerts). The browser asks the user, gets a subscription from
its push service, and sends it here; the API keeps it and pushes to it (app/services/push.py)."""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import AdminProfile, CurrentProfile
from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import PushSubscription
from app.services import push

router = APIRouter(prefix="/push", tags=["push"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="ignore")  # browsers add fields such as expirationTime


class Keys(_Strict):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class SubscriptionIn(_Strict):
    endpoint: str = Field(min_length=20, max_length=2000, pattern=r"^https://")
    keys: Keys


class EndpointIn(_Strict):
    endpoint: str = Field(min_length=20, max_length=2000)


@router.get("/public-key")
async def public_key() -> dict[str, str | None]:
    """The VAPID public key the browser needs to subscribe; null while push is off. Public by design."""
    return {"public_key": get_settings().vapid_public_key if push.enabled() else None}


@router.post("/subscriptions", status_code=204)
async def subscribe(body: SubscriptionIn, admin: AdminProfile, session: SessionDep) -> None:
    """Save this browser for the signed-in admin. The same browser signing in as another admin moves to them."""
    if not push.enabled():
        raise ApiError(503, "PUSH_NOT_CONFIGURED", "Notifications are not set up on the server yet.")
    existing = (await session.exec(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))).first()
    if existing is None:
        existing = PushSubscription(endpoint=body.endpoint, profile_id=admin.id, p256dh=body.keys.p256dh, auth=body.keys.auth)
    else:
        existing.profile_id, existing.p256dh, existing.auth = admin.id, body.keys.p256dh, body.keys.auth
    session.add(existing)
    await session.commit()


@router.delete("/subscriptions", status_code=204)
async def unsubscribe(body: EndpointIn, me: CurrentProfile, session: SessionDep) -> None:
    """Turn notifications off for this browser (only your own)."""
    await session.exec(
        delete(PushSubscription).where(PushSubscription.endpoint == body.endpoint, PushSubscription.profile_id == me.id)
    )
    await session.commit()


@router.post("/test")
async def test(admin: AdminProfile, session: SessionDep) -> dict[str, int]:
    """Send a test notification to the signed-in admin's devices."""
    if not push.enabled():
        raise ApiError(503, "PUSH_NOT_CONFIGURED", "Notifications are not set up on the server yet.")
    return {"sent": await push.send_test(session, admin.id)}
