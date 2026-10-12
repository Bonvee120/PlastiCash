"""Public: today's prices and the request estimate (no login needed: the landing page shows live prices)."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.models import Material
from app.pickup_schemas import CurrentPriceOut, EstimateIn, EstimateOut
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
