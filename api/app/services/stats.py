"""Numbers for the ops dashboard (PRD A8): this month's kg and points, queues, estimate accuracy, disputes per
collector. Nigeria is UTC+1 all year, so "this month" starts at 00:00 Lagos time on the 1st."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import LedgerEntry, LedgerType, Pickup, PickupStatus, Profile, Role, Withdrawal, WithdrawalStatus

LAGOS = timezone(timedelta(hours=1))
# A user whose actual kg is under 60% of their estimates gets a "low estimate accuracy" flag on new requests.
LOW_ACCURACY = Decimal("0.60")


def month_start(now: datetime | None = None) -> datetime:
    local = (now or datetime.now(timezone.utc)).astimezone(LAGOS)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def kg_this_month(session: AsyncSession, since: datetime) -> Decimal:
    total = (
        await session.exec(
            select(func.coalesce(func.sum(Pickup.total_net_kg), 0)).where(
                Pickup.status == PickupStatus.COMPLETED, Pickup.confirmed_at >= since
            )
        )
    ).one()
    return Decimal(total)


async def points_paid(session: AsyncSession, since: datetime) -> int:
    total = (
        await session.exec(
            select(func.coalesce(func.sum(LedgerEntry.amount_kobo), 0)).where(
                LedgerEntry.type == LedgerType.PICKUP_CREDIT, LedgerEntry.created_at >= since
            )
        )
    ).one()
    return int(total)


async def pending_withdrawals(session: AsyncSession) -> tuple[int, int]:
    count, amount = (
        await session.exec(
            select(func.count(), func.coalesce(func.sum(Withdrawal.amount_kobo), 0)).where(
                Withdrawal.status == WithdrawalStatus.PENDING
            )
        )
    ).one()
    return int(count), int(amount)


async def count_status(session: AsyncSession, status: PickupStatus) -> int:
    return int((await session.exec(select(func.count()).select_from(Pickup).where(Pickup.status == status))).one())


async def accuracy(session: AsyncSession, user_ids: set[UUID] | None = None) -> list[tuple[UUID, int, Decimal, Decimal]]:
    """(user_id, pickups, estimated kg, actual kg) over COMPLETED door pickups that had an estimate."""
    query = (
        select(Pickup.user_id, func.count(), func.sum(Pickup.estimated_kg), func.sum(Pickup.total_net_kg))
        .where(Pickup.status == PickupStatus.COMPLETED, Pickup.estimated_kg > 0, Pickup.total_net_kg.is_not(None))
        .group_by(Pickup.user_id)
    )
    if user_ids is not None:
        if not user_ids:
            return []
        query = query.where(Pickup.user_id.in_(user_ids))
    return [(u, int(n), Decimal(est), Decimal(act)) for u, n, est, act in (await session.exec(query)).all()]


def ratio(estimated: Decimal, actual: Decimal) -> Decimal:
    return (actual / estimated).quantize(Decimal("0.01")) if estimated > 0 else Decimal("0")


async def disputes_per_collector(session: AsyncSession) -> list[tuple[UUID, str, int, int]]:
    """(collector_id, name, pickups weighed, pickups disputed), most disputes first."""
    rows = await session.exec(
        select(
            Profile.id,
            Profile.full_name,
            func.count(Pickup.id).filter(Pickup.weighed_at.is_not(None)),
            func.count(Pickup.id).filter(Pickup.disputed_at.is_not(None)),
        )
        .join(Pickup, Pickup.collector_id == Profile.id, isouter=True)
        .where(Profile.role == Role.COLLECTOR)
        .group_by(Profile.id, Profile.full_name)
    )
    result = [(cid, name, int(w), int(d)) for cid, name, w, d in rows.all()]
    return sorted(result, key=lambda r: (-r[3], r[1]))
