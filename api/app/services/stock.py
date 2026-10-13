"""Raw stock and bales (docs/specs/01-data-model.md §7, TRD).

Raw stock per material = Σ net kg of COMPLETED pickup items − Σ bale weights. A bale may not be heavier than raw
stock (required test 19). Bale creation takes a per-material advisory lock for the rest of the transaction, so two
bales made at the same moment can't both use the same kilos."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import Bale, BaleStatus, Material, Pickup, PickupItem, PickupStatus, Profile

ZERO = Decimal("0.00")
NEXT_STATUS = {BaleStatus.IN_STORE: BaleStatus.PROCESSED, BaleStatus.PROCESSED: BaleStatus.SOLD}


async def raw_in(session: AsyncSession, material: Material | None = None) -> dict[Material, Decimal]:
    """Net kg bought (COMPLETED pickups only) per material."""
    query = (
        select(PickupItem.material, func.coalesce(func.sum(PickupItem.net_kg), 0))
        .join(Pickup, Pickup.id == PickupItem.pickup_id)
        .where(Pickup.status == PickupStatus.COMPLETED)
        .group_by(PickupItem.material)
    )
    if material is not None:
        query = query.where(PickupItem.material == material)
    return {m: Decimal(kg) for m, kg in (await session.exec(query)).all()}


async def baled(session: AsyncSession, material: Material | None = None) -> dict[Material, Decimal]:
    query = select(Bale.material, func.coalesce(func.sum(Bale.weight_kg), 0)).group_by(Bale.material)
    if material is not None:
        query = query.where(Bale.material == material)
    return {m: Decimal(kg) for m, kg in (await session.exec(query)).all()}


async def raw_stock(session: AsyncSession, material: Material) -> Decimal:
    return (await raw_in(session, material)).get(material, ZERO) - (await baled(session, material)).get(material, ZERO)


def loss_pct(raw_in_kg: Decimal, baled_kg: Decimal) -> Decimal | None:
    """(raw kg in − bale kg) ÷ raw kg in, as a percentage with one decimal (TRD). None before anything came in."""
    if raw_in_kg <= 0:
        return None
    return ((raw_in_kg - baled_kg) * 100 / raw_in_kg).quantize(Decimal("0.1"))


async def _next_code(session: AsyncSession, material: Material, year: int) -> str:
    """PET-2026-0042: per material and year. Safe because the caller holds the material's lock."""
    prefix = f"{material.value}-{year}-"
    count = (
        await session.exec(select(func.count()).select_from(Bale).where(Bale.code.like(f"{prefix}%")))
    ).one()
    return f"{prefix}{count + 1:04d}"


async def create_bale(session: AsyncSession, admin: Profile, material: Material, weight_kg: Decimal) -> Bale:
    weight = Decimal(weight_kg).quantize(Decimal("0.01"))
    # Serialise bale creation per material until commit; raw stock is read after the lock.
    await session.exec(text("select pg_advisory_xact_lock(hashtext(:key))").bindparams(key=f"bale:{material.value}"))
    available = await raw_stock(session, material)
    if weight > available:
        raise ApiError(422, "BALE_TOO_HEAVY", f"Only {available} kg of {material.value} is in raw stock.",
                       {"raw_stock_kg": str(available)})
    bale = Bale(
        code=await _next_code(session, material, datetime.now(timezone.utc).year),
        material=material,
        weight_kg=weight,
        created_by=admin.id,
    )
    session.add(bale)
    await session.flush()
    await session.refresh(bale)
    return bale


async def _lock_bale(session: AsyncSession, bale_id: UUID) -> Bale:
    bale = (await session.exec(select(Bale).where(Bale.id == bale_id).with_for_update())).first()
    if bale is None:
        raise ApiError(404, "NOT_FOUND", "Bale not found.")
    return bale


async def move(session: AsyncSession, bale_id: UUID, to: BaleStatus, buyer: str | None = None,
               sale_price_kobo: int | None = None) -> Bale:
    """IN_STORE -> PROCESSED -> SOLD, one step at a time. SOLD needs a buyer and a price."""
    bale = await _lock_bale(session, bale_id)
    if NEXT_STATUS.get(bale.status) != to:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"A bale that is {bale.status.value} can't become {to.value}.",
                       {"from": bale.status.value, "to": to.value})
    now = datetime.now(timezone.utc)
    bale.status = to
    if to == BaleStatus.PROCESSED:
        bale.processed_at = now
    else:
        bale.buyer, bale.sale_price_kobo, bale.sold_at = (buyer or "").strip(), sale_price_kobo, now
    session.add(bale)
    await session.flush()
    await session.refresh(bale)
    return bale
