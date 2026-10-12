"""Prices and item amounts (CLAUDE.md rule 1, docs/specs/04 test 6).

amount_kobo = round_half_up(net_kg x price_kobo_per_kg). Each weighed item stores a snapshot of the price in force
(price_kobo_per_kg + price_id), so a later price change never alters a weighed pickup.
"""
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.dialects.postgresql import distinct_on
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import Material, Pickup, PickupItem, Price

KG = Decimal("0.01")


def item_amount_kobo(net_kg: Decimal, price_kobo_per_kg: int) -> int:
    return int((Decimal(net_kg) * price_kobo_per_kg).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def current_price(session: AsyncSession, material: Material, at: datetime | None = None) -> Price:
    """The latest price version for a material that is in force at `at` (default: now)."""
    at = at or datetime.now(timezone.utc)
    price = (
        await session.exec(
            select(Price)
            .where(Price.material == material, Price.effective_from <= at)
            .order_by(Price.effective_from.desc())
            .limit(1)
        )
    ).first()
    if price is None:
        raise ApiError(409, "NO_PRICE", f"There is no price for {material.value} yet.")
    return price


async def current_prices(session: AsyncSession, at: datetime | None = None) -> dict[Material, Price]:
    """The price in force for every material, in one query (one round trip; Supabase is far away)."""
    at = at or datetime.now(timezone.utc)
    rows = await session.exec(
        select(Price)
        .where(Price.effective_from <= at)
        .ext(distinct_on(Price.material))
        .order_by(Price.material, Price.effective_from.desc())
    )
    return {price.material: price for price in rows.all()}


async def priced_item(
    session: AsyncSession,
    pickup_id: UUID,
    material: Material,
    gross_kg: Decimal,
    deduction_kg: Decimal = Decimal("0"),
    deduction_reason: str | None = None,
) -> PickupItem:
    """A weighed item with today's price snapshot. Not added to the session; the caller decides."""
    gross = Decimal(gross_kg).quantize(KG, rounding=ROUND_HALF_UP)
    deduction = Decimal(deduction_kg).quantize(KG, rounding=ROUND_HALF_UP)
    if gross < 0 or deduction < 0:
        raise ApiError(422, "VALIDATION_ERROR", "Weights can't be negative.")
    if deduction > gross:
        raise ApiError(422, "DEDUCTION_TOO_LARGE", "The deduction can't be more than the weight.")
    if deduction > 0 and not (deduction_reason or "").strip():
        raise ApiError(422, "VALIDATION_ERROR", "Say why weight was deducted.")
    price = await current_price(session, material)
    net = gross - deduction
    return PickupItem(
        pickup_id=pickup_id,
        material=material,
        gross_kg=gross,
        deduction_kg=deduction,
        deduction_reason=deduction_reason.strip() if deduction_reason else None,
        net_kg=net,
        price_kobo_per_kg=price.price_kobo_per_kg,
        price_id=price.id,
        amount_kobo=item_amount_kobo(net, price.price_kobo_per_kg),
    )


def apply_totals(pickup: Pickup, items: list[PickupItem], door_min_kg: int) -> None:
    """Totals on the pickup from its items; flags a DOOR pickup that came in under the minimum."""
    pickup.total_net_kg = sum((item.net_kg for item in items), Decimal("0"))
    pickup.total_amount_kobo = sum(item.amount_kobo for item in items)
    pickup.under_minimum = pickup.channel.value == "DOOR" and pickup.total_net_kg < door_min_kg
