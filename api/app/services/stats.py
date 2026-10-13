"""Numbers for the ops dashboard (PRD A8): this month's kg and points, queues, estimate accuracy, disputes per
collector. Nigeria is UTC+1 all year, so "this month" starts at 00:00 Lagos time on the 1st."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import (
    Bale, LedgerEntry, LedgerType, Pickup, PickupItem, PickupStatus, Profile, Role, Withdrawal, WithdrawalStatus,
)

LAGOS = timezone(timedelta(hours=1))
# A user whose actual kg is under 60% of their estimates gets a "low estimate accuracy" flag on new requests.
LOW_ACCURACY = Decimal("0.60")


def month_start(now: datetime | None = None) -> datetime:
    local = (now or datetime.now(timezone.utc)).astimezone(LAGOS)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


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


# ----- Fewer round trips: each database round trip costs the same whatever the query does -----


def _sum(column, *where):
    return select(func.coalesce(func.sum(column), 0)).where(*where).scalar_subquery()


def _count(*where):
    return select(func.count()).select_from(Pickup).where(*where).scalar_subquery()


async def counts(session: AsyncSession) -> dict[str, int]:
    """The ops sidebar badges in one query: waiting requests, open disputes, pending withdrawals."""
    requested, disputed, pending = (
        await session.exec(
            select(
                _count(Pickup.status == PickupStatus.REQUESTED),
                _count(Pickup.status == PickupStatus.DISPUTED),
                select(func.count()).select_from(Withdrawal).where(Withdrawal.status == WithdrawalStatus.PENDING)
                .scalar_subquery(),
            )
        )
    ).one()
    return {"pickups": int(requested), "disputes": int(disputed), "withdrawals": int(pending)}


async def headline(session: AsyncSession, since: datetime) -> dict:
    """All the dashboard's single numbers in one query."""
    completed_item = select(func.coalesce(func.sum(PickupItem.net_kg), 0)).join(
        Pickup, Pickup.id == PickupItem.pickup_id
    ).where(Pickup.status == PickupStatus.COMPLETED).scalar_subquery()
    row = (
        await session.exec(
            select(
                _sum(Pickup.total_net_kg, Pickup.status == PickupStatus.COMPLETED, Pickup.confirmed_at >= since),
                _sum(LedgerEntry.amount_kobo, LedgerEntry.type == LedgerType.PICKUP_CREDIT, LedgerEntry.created_at >= since),
                select(func.count()).select_from(Withdrawal).where(Withdrawal.status == WithdrawalStatus.PENDING)
                .scalar_subquery(),
                _sum(Withdrawal.amount_kobo, Withdrawal.status == WithdrawalStatus.PENDING),
                _count(Pickup.status == PickupStatus.DISPUTED),
                _count(Pickup.status == PickupStatus.REQUESTED),
                completed_item,
                select(func.coalesce(func.sum(Bale.weight_kg), 0)).scalar_subquery(),
            )
        )
    ).one()
    kg, paid, pending_n, pending_kobo, disputes, requests, raw_in, baled = row
    return {
        "kg_this_month": Decimal(kg),
        "points_paid_kobo": int(paid),
        "pending": (int(pending_n), int(pending_kobo)),
        "open_disputes": int(disputes),
        "waiting_requests": int(requests),
        "raw_stock_kg": Decimal(raw_in) - Decimal(baled),
    }


async def accuracy_with_profiles(session: AsyncSession) -> list[tuple[Profile, int, Decimal, Decimal]]:
    """Like `accuracy`, with each customer's profile in the same query (grouped by the primary key)."""
    rows = await session.exec(
        select(Profile, func.count(Pickup.id), func.sum(Pickup.estimated_kg), func.sum(Pickup.total_net_kg))
        .join(Pickup, Pickup.user_id == Profile.id)
        .where(Pickup.status == PickupStatus.COMPLETED, Pickup.estimated_kg > 0, Pickup.total_net_kg.is_not(None))
        .group_by(Profile.id)
    )
    return [(p, int(n), Decimal(est), Decimal(act)) for p, n, est, act in rows.all()]
