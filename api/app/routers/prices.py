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

router = APIRouter(tags=["prices"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/prices/current", response_model=list[CurrentPriceOut])
async def current_prices(session: SessionDep) -> list[CurrentPriceOut]:
    """The price in force for each material that has one."""
    prices = await pricing.current_prices(session)
    return [CurrentPriceOut.from_price(prices[m]) for m in Material if m in prices]


@router.post("/estimate", response_model=EstimateOut)
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
    """All-time totals for the landing page's impact band. Public: sums only, nothing about any one person."""
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
    return TotalsOut(
        kg_recycled=Decimal(kg).quantize(Decimal("0.01")),
        points_paid_kobo=int(paid),
        points_paid=points(int(paid)),
        co2_kg=Decimal(co2).quantize(Decimal("0.1")),
        pickups=int(pickups_done),
    )
