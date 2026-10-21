"""Ops portal API. Every route is ADMIN only: the guard sits on the router itself, so a route added here later
can't forget it (docs/specs/02-api.md, required test 16)."""
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.admin_schemas import AdminWithdrawalOut
from app.auth import AdminProfile, require_admin
from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import Material, Pickup, PickupStatus, Price, Profile, Role, Withdrawal, WithdrawalStatus
from app.pickup_schemas import AdminBoardOut, AdminPickupOut, AreaTotal, AssignIn, CancelIn, ResolveIn
from app.schemas import PriceOut, RejectBody, WithdrawalOut
from app.schemas import display_name
from app.services import paystack, pickups, stats, withdrawals
from app.services.pickup_state import transition
from app.services.paystack import PaystackError

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/prices", response_model=list[PriceOut])
async def price_history(session: SessionDep, material: Material | None = None) -> list[PriceOut]:
    """Every price version, newest first; optionally for one material. Rows are never edited (insert-only)."""
    query = select(Price).order_by(Price.material, Price.effective_from.desc())
    if material is not None:
        query = query.where(Price.material == material)
    return [PriceOut.from_price(p) for p in (await session.exec(query)).all()]


# ----- Withdrawals -----


@router.get("/withdrawals", response_model=list[AdminWithdrawalOut])
async def withdrawal_queue(session: SessionDep, status: WithdrawalStatus | None = None) -> list[AdminWithdrawalOut]:
    """Review queue, oldest first (first in, first paid), with each customer's name."""
    query = select(Withdrawal).order_by(Withdrawal.created_at).limit(500)
    if status is not None:
        query = query.where(Withdrawal.status == status)
    rows = (await session.exec(query)).all()
    people = await pickups.names(session, {w.user_id for w in rows})
    return [
        AdminWithdrawalOut(**WithdrawalOut.from_withdrawal(w).model_dump(),
                           user_name=display_name(people[w.user_id]) or people[w.user_id].full_name)
        for w in rows
    ]


@router.post("/withdrawals/{withdrawal_id}/approve", response_model=WithdrawalOut)
async def approve_withdrawal(withdrawal_id: UUID, admin: AdminProfile, session: SessionDep) -> WithdrawalOut:
    """PENDING -> PROCESSING (committed first, so it can't be sent twice), then ask Paystack to send the money.
    The final PAID / FAILED comes by webhook. If Paystack refused, the payout is FAILED and the money goes back."""
    withdrawal = await withdrawals.approve(session, withdrawal_id, admin)
    await session.commit()
    if get_settings().paystack_fake_transfers:
        # Local testing only: no Paystack call; PAID at once, as if the transfer.success webhook had arrived.
        await withdrawals.record_transfer(session, withdrawal.id, f"TRF_fake_{withdrawal.id.hex[:12]}")
        await withdrawals.mark_paid(session, withdrawal.id)
        await session.commit()
        refreshed = await withdrawals.lock_withdrawal(session, withdrawal.id)
        await session.commit()
        return WithdrawalOut.from_withdrawal(refreshed)
    try:
        result = await paystack.initiate_transfer(
            withdrawal.amount_kobo,
            withdrawal.paystack_recipient_code,
            reference=str(withdrawal.id),
            reason="PlastiCash payout",
        )
    except PaystackError as error:
        if error.not_sent:
            await withdrawals.fail(session, withdrawal.id, f"Paystack refused the transfer: {error.message}")
            await session.commit()
        # Otherwise it may have gone through: stay PROCESSING; the webhook decides.
        refreshed = await withdrawals.lock_withdrawal(session, withdrawal.id)
        await session.commit()
        return WithdrawalOut.from_withdrawal(refreshed)
    withdrawal = await withdrawals.record_transfer(session, withdrawal.id, result.get("transfer_code"))
    await session.commit()
    return WithdrawalOut.from_withdrawal(withdrawal)


@router.post("/withdrawals/{withdrawal_id}/reject", response_model=WithdrawalOut)
async def reject_withdrawal(
    withdrawal_id: UUID, body: RejectBody, admin: AdminProfile, session: SessionDep
) -> WithdrawalOut:
    withdrawal = await withdrawals.reject(session, withdrawal_id, admin, body.reason)
    await session.commit()
    return WithdrawalOut.from_withdrawal(withdrawal)


# ----- Pickups -----


async def _admin_views(session: AsyncSession, rows: list[Pickup]) -> list[AdminPickupOut]:
    """Many pickups with three queries in total, not three per pickup."""
    items = await pickups.items_by_pickup(session, [p.id for p in rows])
    people = await pickups.names(session, {p.user_id for p in rows} | {p.collector_id for p in rows})
    return [
        AdminPickupOut.build(p, items[p.id], display_name(people[p.user_id]) or people[p.user_id].full_name,
                             people[p.collector_id].full_name if p.collector_id in people else None)
        for p in rows
    ]


async def _admin_view(session: AsyncSession, pickup: Pickup) -> AdminPickupOut:
    await session.refresh(pickup)
    user = await session.get(Profile, pickup.user_id)
    collector = await session.get(Profile, pickup.collector_id) if pickup.collector_id else None
    return AdminPickupOut.build(
        pickup, await pickups.items_of(session, pickup.id), display_name(user) or user.full_name,
        collector.full_name if collector else None,
    )


@router.get("/pickups", response_model=AdminBoardOut)
async def pickup_board(
    session: SessionDep,
    status: PickupStatus | None = None,
    area: str | None = None,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> AdminBoardOut:
    """The board, plus waiting requests per area with their estimated kg, for planning pooled area days."""
    query = select(Pickup).order_by(Pickup.created_at.desc()).limit(200)
    if status is not None:
        query = query.where(Pickup.status == status)
    if area:
        query = query.where(Pickup.area == area)
    if day:
        query = query.where((Pickup.scheduled_date == day) | (Pickup.preferred_date == day))
    rows = (await session.exec(query)).all()
    views = await _admin_views(session, list(rows))
    accuracy = {u: stats.ratio(est, act) for u, _, est, act in await stats.accuracy(session, {p.user_id for p in rows})}
    for view in views:
        view.user_estimate_accuracy = accuracy.get(view.user_id)
    totals = await session.exec(
        select(Pickup.area, func.count(), func.count().filter(Pickup.pooled), func.coalesce(func.sum(Pickup.estimated_kg), 0))
        .where(Pickup.status == PickupStatus.REQUESTED)
        .group_by(Pickup.area)
        .order_by(func.coalesce(func.sum(Pickup.estimated_kg), 0).desc())
    )
    return AdminBoardOut(
        pickups=views,
        area_totals=[AreaTotal(area=a or "Unknown", requests=n, pooled=pooled, estimated_kg=Decimal(kg))
                     for a, n, pooled, kg in totals.all()],
    )


@router.post("/pickups/{pickup_id}/assign", response_model=AdminPickupOut)
async def assign_pickup(pickup_id: UUID, body: AssignIn, admin: AdminProfile, session: SessionDep) -> AdminPickupOut:
    collector = await session.get(Profile, body.collector_id)
    if collector is None or collector.role != Role.COLLECTOR or not collector.is_active:
        raise ApiError(422, "VALIDATION_ERROR", "Choose an active collector.")
    pickup = await transition(session, pickup_id, PickupStatus.ASSIGNED, admin, collector_id=collector.id,
                              scheduled_date=body.scheduled_date)
    await session.commit()
    return await _admin_view(session, pickup)


@router.post("/pickups/{pickup_id}/cancel", response_model=AdminPickupOut)
async def cancel_pickup(pickup_id: UUID, body: CancelIn, admin: AdminProfile, session: SessionDep) -> AdminPickupOut:
    pickup = await transition(session, pickup_id, PickupStatus.CANCELLED, admin, reason=body.reason)
    await session.commit()
    return await _admin_view(session, pickup)


@router.get("/disputes", response_model=list[AdminPickupOut])
async def disputes(session: SessionDep) -> list[AdminPickupOut]:
    """Open disputes, oldest first: both photos, the collector's weights and the customer's claim."""
    rows = await session.exec(
        select(Pickup).where(Pickup.status == PickupStatus.DISPUTED).order_by(Pickup.disputed_at)
    )
    return await _admin_views(session, list(rows.all()))


@router.post("/pickups/{pickup_id}/resolve", response_model=AdminPickupOut)
async def resolve_dispute(pickup_id: UUID, body: ResolveIn, admin: AdminProfile, session: SessionDep) -> AdminPickupOut:
    pickup = await pickups.resolve(session, pickup_id, admin, body.items, body.note.strip())
    await session.commit()
    return await _admin_view(session, pickup)
