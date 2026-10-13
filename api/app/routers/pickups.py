"""User pickups. A user only ever sees and acts on their own pickups; anyone else's look like they don't exist (404)."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import CurrentProfile, UserProfile
from app.db import get_session
from app.errors import ApiError
from app.models import Pickup, PickupStatus, Profile
from app.pickup_schemas import CancelIn, DisputeIn, PickupCreate, UploadSignatureIn, UserPickupOut
from app.schemas import display_name
from app.services import cloudinary, pickups, push
from app.services.pickup_state import transition
from app.ratelimit import DAY, HOUR, rate_limit

router = APIRouter(tags=["pickups"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
S = PickupStatus


async def _own(session: AsyncSession, pickup_id: UUID, me: Profile) -> Pickup:
    pickup = await session.get(Pickup, pickup_id)
    if pickup is None or pickup.user_id != me.id:
        raise ApiError(404, "NOT_FOUND", "Pickup not found.")
    return pickup


async def _view(session: AsyncSession, pickup: Pickup) -> UserPickupOut:
    await session.refresh(pickup)
    return UserPickupOut.build(
        pickup, await pickups.items_of(session, pickup.id), await pickups.first_name(session, pickup.collector_id)
    )


@router.post("/uploads/signature", dependencies=[Depends(rate_limit("upload", 30, HOUR))])
async def upload_signature(body: UploadSignatureIn, me: CurrentProfile) -> dict:
    """Signed params for a direct browser upload to Cloudinary (request, weigh or dispute photo)."""
    return cloudinary.signature(body.purpose)


@router.post(
    "/pickups", status_code=201, response_model=UserPickupOut,
    dependencies=[Depends(rate_limit("request-pickup", 10, DAY))],
)
async def request_pickup(
    body: PickupCreate, me: UserProfile, session: SessionDep, background: BackgroundTasks
) -> UserPickupOut:
    pickup = await pickups.create_request(session, me, body)
    await session.commit()
    # Tell the admins' phones after the response is sent, so the customer never waits for it (or fails because of it).
    background.add_task(push.notify_new_request, session, pickup.id)
    return await _view(session, pickup)


@router.get("/pickups", response_model=list[UserPickupOut])
async def my_pickups(
    me: UserProfile,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[UserPickupOut]:
    rows = (
        await session.exec(
            select(Pickup).where(Pickup.user_id == me.id).order_by(Pickup.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    items = await pickups.items_by_pickup(session, [p.id for p in rows])
    people = await pickups.names(session, {p.collector_id for p in rows})
    return [
        UserPickupOut.build(p, items[p.id], display_name(people[p.collector_id]) if p.collector_id in people else None)
        for p in rows
    ]


@router.get("/pickups/{pickup_id}", response_model=UserPickupOut)
async def pickup_detail(pickup_id: UUID, me: UserProfile, session: SessionDep) -> UserPickupOut:
    return await _view(session, await _own(session, pickup_id, me))


@router.post("/pickups/{pickup_id}/cancel", response_model=UserPickupOut)
async def cancel_pickup(pickup_id: UUID, body: CancelIn, me: UserProfile, session: SessionDep) -> UserPickupOut:
    await _own(session, pickup_id, me)
    pickup = await transition(session, pickup_id, S.CANCELLED, me, reason=body.reason)
    await session.commit()
    return await _view(session, pickup)


@router.post(
    "/pickups/{pickup_id}/confirm", response_model=UserPickupOut,
    dependencies=[Depends(rate_limit("confirm", 30, HOUR))],
)
async def confirm_pickup(pickup_id: UUID, me: UserProfile, session: SessionDep) -> UserPickupOut:
    """The user accepts the weight: COMPLETED and the points land in the wallet (once)."""
    await _own(session, pickup_id, me)
    pickup = await transition(session, pickup_id, S.COMPLETED, me)
    await session.commit()
    return await _view(session, pickup)


@router.post(
    "/pickups/{pickup_id}/dispute", response_model=UserPickupOut,
    dependencies=[Depends(rate_limit("dispute", 10, HOUR))],
)
async def dispute_pickup(pickup_id: UUID, body: DisputeIn, me: UserProfile, session: SessionDep) -> UserPickupOut:
    await _own(session, pickup_id, me)
    pickup = await transition(
        session, pickup_id, S.DISPUTED, me, reason=body.reason.strip(),
        dispute_photo_url=cloudinary.check_photo_url(body.photo_url), dispute_claimed_kg=body.claimed_kg,
    )
    await session.commit()
    return await _view(session, pickup)
