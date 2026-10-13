"""The signed-in user's wallet and withdrawals. Users only ever see their own (CLAUDE.md rule 8)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import UserProfile
from app.db import get_session
from app.errors import ApiError
from app.models import AccountType, LedgerEntry, Withdrawal
from app.schemas import ImpactOut, LedgerEntryOut, WalletOut, WithdrawalCreate, WithdrawalOut, points
from app.services import esg, impact, ledger, withdrawals
from app.services.pickups import lagos_today
from app.ratelimit import HOUR, rate_limit

router = APIRouter(tags=["wallet"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/wallet", response_model=WalletOut)
async def get_wallet(
    me: UserProfile,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WalletOut:
    balance = await ledger.balance_kobo(session, me.id)
    total = (await session.exec(select(func.count()).where(LedgerEntry.user_id == me.id))).one()
    entries = (
        await session.exec(
            select(LedgerEntry)
            .where(LedgerEntry.user_id == me.id)
            .order_by(LedgerEntry.created_at.desc(), LedgerEntry.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return WalletOut(
        balance_kobo=balance,
        points=points(balance),
        entries=[LedgerEntryOut.from_entry(e) for e in entries],
        total_entries=total,
    )


@router.post(
    "/withdrawals", status_code=201, response_model=WithdrawalOut,
    dependencies=[Depends(rate_limit("withdraw", 5, HOUR))],
)
async def request_withdrawal(body: WithdrawalCreate, me: UserProfile, session: SessionDep) -> WithdrawalOut:
    withdrawal = await withdrawals.request_withdrawal(session, me.id, body.amount_kobo)
    await session.commit()
    return WithdrawalOut.from_withdrawal(withdrawal)


@router.get("/withdrawals", response_model=list[WithdrawalOut])
async def my_withdrawals(me: UserProfile, session: SessionDep) -> list[WithdrawalOut]:
    rows = (
        await session.exec(select(Withdrawal).where(Withdrawal.user_id == me.id).order_by(Withdrawal.created_at.desc()))
    ).all()
    return [WithdrawalOut.from_withdrawal(w) for w in rows]


@router.get("/impact", response_model=ImpactOut)
async def my_impact(me: UserProfile, session: SessionDep) -> ImpactOut:
    data = await impact.for_user(session, me.id)
    return ImpactOut(**data, earned_points=points(data["earned_kobo"]))


@router.get("/reports/esg", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
async def esg_report(
    me: UserProfile,
    session: SessionDep,
    year: Annotated[int, Query(ge=2024, le=2100)],
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> Response:
    """Monthly (or yearly, without `month`) recycling report as a PDF. Organization accounts only (test 17)."""
    if me.account_type != AccountType.ORGANIZATION:
        raise ApiError(403, "ORGANIZATIONS_ONLY", "ESG reports are for organization accounts.")
    data = await esg.report_data(session, me, year, month, lagos_today())
    pdf = esg.render_pdf(data)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="plasticash-esg-{data["slug"]}.pdf"'},
    )
