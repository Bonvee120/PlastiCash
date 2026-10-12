"""Ops portal API. Every route is ADMIN only: the guard sits on the router itself, so a route added here later
can't forget it (docs/specs/02-api.md, required test 16)."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import AdminProfile, require_admin
from app.db import get_session
from app.models import Material, Price, Withdrawal, WithdrawalStatus
from app.schemas import PriceOut, RejectBody, WithdrawalOut
from app.services import paystack, withdrawals
from app.services.paystack import PaystackError

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/prices", response_model=list[PriceOut])
async def price_history(session: SessionDep, material: Material | None = None) -> list[PriceOut]:
    """Every price version, newest first; optionally for one material. Rows are never edited (insert-only)."""
    query = select(Price).order_by(Price.material, Price.effective_from.desc())
    if material is not None:
        query = query.where(Price.material == material)
    return [PriceOut.from_price(p) for p in (await session.exec(query)).all()]


# ----- Withdrawals -----


@router.get("/withdrawals", response_model=list[WithdrawalOut])
async def withdrawal_queue(session: SessionDep, status: WithdrawalStatus | None = None) -> list[WithdrawalOut]:
    """Review queue, oldest first (first in, first paid)."""
    query = select(Withdrawal).order_by(Withdrawal.created_at)
    if status is not None:
        query = query.where(Withdrawal.status == status)
    return [WithdrawalOut.from_withdrawal(w) for w in (await session.exec(query)).all()]


@router.post("/withdrawals/{withdrawal_id}/approve", response_model=WithdrawalOut)
async def approve_withdrawal(withdrawal_id: UUID, admin: AdminProfile, session: SessionDep) -> WithdrawalOut:
    """PENDING -> PROCESSING (committed first, so it can't be sent twice), then ask Paystack to send the money.
    The final PAID / FAILED comes by webhook. If Paystack refused, the payout is FAILED and the money goes back."""
    withdrawal = await withdrawals.approve(session, withdrawal_id, admin)
    await session.commit()
    try:
        result = await paystack.initiate_transfer(
            withdrawal.amount_kobo,
            withdrawal.paystack_recipient_code,
            reference=str(withdrawal.id),
            reason="PlastiCash payout",
        )
    except PaystackError as error:
        if error.not_sent:
            await withdrawals.fail(session, withdrawal.id, f"Paystack refused the transfer: {error.message}")
            await session.commit()
        # Otherwise it may have gone through: stay PROCESSING; the webhook decides.
        refreshed = await withdrawals.lock_withdrawal(session, withdrawal.id)
        await session.commit()
        return WithdrawalOut.from_withdrawal(refreshed)
    withdrawal = await withdrawals.record_transfer(session, withdrawal.id, result.get("transfer_code"))
    await session.commit()
    return WithdrawalOut.from_withdrawal(withdrawal)


@router.post("/withdrawals/{withdrawal_id}/reject", response_model=WithdrawalOut)
async def reject_withdrawal(
    withdrawal_id: UUID, body: RejectBody, admin: AdminProfile, session: SessionDep
) -> WithdrawalOut:
    withdrawal = await withdrawals.reject(session, withdrawal_id, admin, body.reason)
    await session.commit()
    return WithdrawalOut.from_withdrawal(withdrawal)
