"""A user's recycling impact, computed (never stored) from their COMPLETED pickups (docs/app-logic.md).
CO2 saved = net kg x the US EPA WARM factor of the price version the item was weighed at (RESEARCH.md)."""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import LedgerEntry, LedgerType, Pickup, PickupItem, PickupStatus, Price


async def for_user(session: AsyncSession, user_id: UUID) -> dict:
    rows = (
        await session.exec(
            select(PickupItem.material, func.sum(PickupItem.net_kg), func.sum(PickupItem.net_kg * Price.co2_kg_saved_per_kg))
            .join(Pickup, Pickup.id == PickupItem.pickup_id)
            .join(Price, Price.id == PickupItem.price_id)
            .where(Pickup.user_id == user_id, Pickup.status == PickupStatus.COMPLETED)
            .group_by(PickupItem.material)
            .order_by(func.sum(PickupItem.net_kg).desc())
        )
    ).all()
    pickups = (
        await session.exec(select(func.count()).where(Pickup.user_id == user_id, Pickup.status == PickupStatus.COMPLETED))
    ).one()
    earned = (
        await session.exec(
            select(func.coalesce(func.sum(LedgerEntry.amount_kobo), 0)).where(
                LedgerEntry.user_id == user_id, LedgerEntry.type == LedgerType.PICKUP_CREDIT
            )
        )
    ).one()
    by_material = [
        {"material": m, "kg": Decimal(kg).quantize(Decimal("0.01")), "co2_kg": Decimal(co2).quantize(Decimal("0.1"))}
        for m, kg, co2 in rows
    ]
    return {
        "total_kg": sum((r["kg"] for r in by_material), Decimal("0")),
        "co2_kg": sum((r["co2_kg"] for r in by_material), Decimal("0")),
        "pickups": pickups,
        "earned_kobo": int(earned),
        "by_material": by_material,
    }
