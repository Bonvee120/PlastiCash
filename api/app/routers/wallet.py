"""The signed-in user's wallet and withdrawals. Users only ever see their own (CLAUDE.md rule 8)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import UserProfile
from app.db import get_session
from app.models import LedgerEntry, Withdrawal
from app.schemas import LedgerEntryOut, WalletOut, WithdrawalCreate, WithdrawalOut, points
from app.services import ledger, withdrawals

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


@router.post("/withdrawals", status_code=201, response_model=WithdrawalOut)
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
