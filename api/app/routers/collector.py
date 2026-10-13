"""Collector: own assigned pickups only (a pickup assigned to someone else looks like it doesn't exist), plus hub
walk-ins. SMS with the weight and code goes out after the commit, so a failed request never sends one."""
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import CollectorProfile, require_collector
from app.db import get_session
from app.errors import ApiError
from app.models import Pickup, PickupStatus, Profile
from app.pickup_schemas import CollectorPickupOut, LocationIn, OtpIn, ScanIn, UserSearchOut, WalkInIn, WeighIn, WeighOut
from app.schemas import display_name
from app.services import pickups, termii
from app.services.pickup_state import transition
from app.ratelimit import HOUR, MINUTE, rate_limit

router = APIRouter(prefix="/collector", tags=["collector"], dependencies=[Depends(require_collector)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
S = PickupStatus


async def _view(session: AsyncSession, pickup: Pickup) -> CollectorPickupOut:
    await session.refresh(pickup)
    return CollectorPickupOut.build(
        pickup, await pickups.items_of(session, pickup.id), await pickups.first_name(session, pickup.user_id) or ""
    )


async def _send_code(session: AsyncSession, pickup: Pickup, collector: Profile, code: str) -> bool:
    customer = await session.get(Profile, pickup.user_id)
    return await termii.send_sms(customer.phone, pickups.weighed_sms(pickup, display_name(collector), code))


@router.get("/pickups", response_model=list[CollectorPickupOut])
async def my_day(
    me: CollectorProfile, session: SessionDep, day: Annotated[date | None, Query(alias="date")] = None
) -> list[CollectorPickupOut]:
    """Pickups assigned to me for a day (default today), oldest request first."""
    day = day or pickups.lagos_today()
    rows = (
        await session.exec(
            select(Pickup).where(Pickup.collector_id == me.id, Pickup.scheduled_date == day).order_by(Pickup.created_at)
        )
    ).all()
    items = await pickups.items_by_pickup(session, [p.id for p in rows])
    people = await pickups.names(session, {p.user_id for p in rows})
    return [CollectorPickupOut.build(p, items[p.id], display_name(people[p.user_id])) for p in rows]


@router.get("/pickups/{pickup_id}", response_model=CollectorPickupOut)
async def job(pickup_id: UUID, me: CollectorProfile, session: SessionDep) -> CollectorPickupOut:
    pickup = await pickups.collectors_pickup(session, pickup_id, me)
    await session.commit()
    return await _view(session, pickup)


@router.post("/pickups/{pickup_id}/start", response_model=CollectorPickupOut)
async def start(pickup_id: UUID, me: CollectorProfile, session: SessionDep) -> CollectorPickupOut:
    await pickups.collectors_pickup(session, pickup_id, me)
    pickup = await transition(session, pickup_id, S.EN_ROUTE, me)
    await session.commit()
    return await _view(session, pickup)


@router.post("/pickups/{pickup_id}/location", status_code=204)
async def location(pickup_id: UUID, body: LocationIn, me: CollectorProfile, session: SessionDep) -> None:
    await pickups.update_location(session, pickup_id, me, body.lat, body.lng)
    await session.commit()


@router.post("/pickups/{pickup_id}/scan", response_model=CollectorPickupOut)
async def scan(pickup_id: UUID, body: ScanIn, me: CollectorProfile, session: SessionDep) -> CollectorPickupOut:
    pickup = await pickups.scan(session, pickup_id, me, body.qr_token)
    await session.commit()
    return await _view(session, pickup)


@router.post("/pickups/{pickup_id}/weigh", response_model=WeighOut)
async def weigh(pickup_id: UUID, body: WeighIn, me: CollectorProfile, session: SessionDep) -> WeighOut:
    pickup, code = await pickups.weigh(session, pickup_id, me, body.photo_url, body.items)
    await session.commit()
    sent = await _send_code(session, pickup, me, code)
    return WeighOut(pickup=await _view(session, pickup), sms_sent=sent)


@router.post(
    "/pickups/{pickup_id}/otp", response_model=CollectorPickupOut,
    dependencies=[Depends(rate_limit("otp", 20, 10 * MINUTE))],
)
async def confirm_with_code(pickup_id: UUID, body: OtpIn, me: CollectorProfile, session: SessionDep) -> CollectorPickupOut:
    pickup = await pickups.confirm_with_code(session, pickup_id, me, body.code)
    await session.commit()
    return await _view(session, pickup)


@router.post(
    "/pickups/{pickup_id}/resend-otp", response_model=WeighOut,
    dependencies=[Depends(rate_limit("resend-otp", 10, HOUR))],
)
async def resend_code(pickup_id: UUID, me: CollectorProfile, session: SessionDep) -> WeighOut:
    pickup, code = await pickups.resend_code(session, pickup_id, me)
    await session.commit()
    sent = await _send_code(session, pickup, me, code)
    return WeighOut(pickup=await _view(session, pickup), sms_sent=sent)


@router.get("/users/search", response_model=UserSearchOut, dependencies=[Depends(rate_limit("phone-search", 60, HOUR))])
async def search_user(phone: str, me: CollectorProfile, session: SessionDep) -> UserSearchOut:
    """Hub walk-in: find the customer by phone. Name and id only."""
    user = await pickups.find_user_by_phone(session, phone)
    if user is None:
        raise ApiError(404, "NOT_FOUND", "No PlastiCash account with this number. Ask them to sign up first.")
    return UserSearchOut(id=user.id, name=display_name(user))


@router.post("/walk-ins", status_code=201, response_model=WeighOut)
async def walk_in(body: WalkInIn, me: CollectorProfile, session: SessionDep) -> WeighOut:
    pickup, code = await pickups.walk_in(session, me, body.user_id, body.photo_url, body.items)
    await session.commit()
    sent = await _send_code(session, pickup, me, code)
    return WeighOut(pickup=await _view(session, pickup), sms_sent=sent)
