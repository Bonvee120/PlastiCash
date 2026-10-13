"""Public: today's prices and the request estimate (no login needed: the landing page shows live prices)."""
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.models import LedgerEntry, LedgerType, Material, Pickup, PickupItem, PickupStatus, Price
from app.pickup_schemas import CurrentPriceOut, EstimateIn, EstimateOut
from app.schemas import points
from app.services import pickups, pricing
from app.ratelimit import MINUTE, rate_limit_ip
from app.redis_client import cache_get, cache_set

router = APIRouter(tags=["prices"])

PRICES_CACHE_KEY = "prices:current"

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/prices/current", response_model=list[CurrentPriceOut])
async def current_prices(session: SessionDep) -> list[CurrentPriceOut]:
    """The price in force for each material that has one. Cached in Redis; a new price version clears it."""
    cached = await cache_get(PRICES_CACHE_KEY)
    if cached is not None:
        return [CurrentPriceOut.model_validate(p) for p in cached]
    prices = await pricing.current_prices(session)
    out = [CurrentPriceOut.from_price(prices[m]) for m in Material if m in prices]
    await cache_set(PRICES_CACHE_KEY, [p.model_dump(mode="json") for p in out], 10 * 60)
    return out


@router.post(
    "/estimate", response_model=EstimateOut,
    dependencies=[Depends(rate_limit_ip("estimate", 120, 10 * MINUTE))],
)
async def estimate(body: EstimateIn, session: SessionDep) -> EstimateOut:
    return await pickups.estimate(session, body.items)


class TotalsOut(BaseModel):
    kg_recycled: Decimal
    points_paid_kobo: int
    points_paid: Decimal
    co2_kg: Decimal
    pickups: int


@router.get("/impact/total", response_model=TotalsOut)
async def impact_total(session: SessionDep) -> TotalsOut:
    """All-time totals for the landing page's impact band. Public: sums only, nothing about any one person.
    Cached in Redis for 5 minutes (marketing numbers; three aggregate queries otherwise)."""
    cached = await cache_get("impact:total")
    if cached is not None:
        return TotalsOut.model_validate(cached)
    kg, co2, pickups_done = (
        await session.exec(
            select(
                func.coalesce(func.sum(PickupItem.net_kg), 0),
                func.coalesce(func.sum(PickupItem.net_kg * Price.co2_kg_saved_per_kg), 0),
                func.count(func.distinct(Pickup.id)),
            )
            .join(Pickup, Pickup.id == PickupItem.pickup_id)
            .join(Price, Price.id == PickupItem.price_id)
            .where(Pickup.status == PickupStatus.COMPLETED)
        )
    ).one()
    paid = (
        await session.exec(
            select(func.coalesce(func.sum(LedgerEntry.amount_kobo), 0)).where(LedgerEntry.type == LedgerType.PICKUP_CREDIT)
        )
    ).one()
    totals = TotalsOut(
        kg_recycled=Decimal(kg).quantize(Decimal("0.01")),
        points_paid_kobo=int(paid),
        points_paid=points(int(paid)),
        co2_kg=Decimal(co2).quantize(Decimal("0.1")),
        pickups=int(pickups_done),
    )
    await cache_set("impact:total", totals.model_dump(mode="json"), 5 * 60)
    return totals
