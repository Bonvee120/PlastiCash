"""Withdrawals (docs/specs/04-money-rules-and-tests.md). Every change locks the row it reads, so concurrent requests
and duplicate webhooks are serialised; the caller commits.

PENDING --approve--> PROCESSING --webhook success--> PAID
PENDING --reject---> REJECTED + reversal
PROCESSING --webhook failed/reversed, or Paystack refused--> FAILED + reversal
PAID, FAILED and REJECTED are final.
"""
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.errors import ApiError
from app.models import Profile, Withdrawal, WithdrawalStatus
from app.services import ledger

W = WithdrawalStatus
FINAL = {W.PAID, W.FAILED, W.REJECTED}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def request_withdrawal(session: AsyncSession, user_id: UUID, amount_kobo: int) -> Withdrawal:
    # 1. Lock the user's profile row: a second request by the same user waits here until this one commits,
    #    and then sees this one's hold in the balance (CLAUDE.md rule 4).
    profile = (await session.exec(select(Profile).where(Profile.id == user_id).with_for_update())).one()
    await session.refresh(profile)

    # 2. Checks
    if not (profile.bank_name and profile.account_number and profile.account_name and profile.paystack_recipient_code):
        raise ApiError(400, "BANK_DETAILS_REQUIRED", "Add your bank account in Settings before withdrawing.")
    minimum = get_settings().min_withdrawal_kobo
    if amount_kobo < minimum:
        raise ApiError(400, "BELOW_MINIMUM", f"The minimum withdrawal is ₦{minimum // 100:,}.",
                       {"min_kobo": minimum})
    balance = await ledger.balance_kobo(session, user_id)
    if amount_kobo > balance:
        raise ApiError(400, "INSUFFICIENT_BALANCE", "That's more than your balance.", {"balance_kobo": balance})

    # 3. PENDING with a snapshot of the bank details, and the hold that takes the amount out of the balance
    withdrawal = Withdrawal(
        user_id=user_id,
        amount_kobo=amount_kobo,
        status=W.PENDING,
        bank_name=profile.bank_name,
        account_number=profile.account_number,
        account_name=profile.account_name,
        paystack_recipient_code=profile.paystack_recipient_code,
    )
    session.add(withdrawal)
    await session.flush()
    await ledger.hold_withdrawal(session, withdrawal)
    return withdrawal


async def lock_withdrawal(session: AsyncSession, withdrawal_id: UUID) -> Withdrawal | None:
    withdrawal = (
        await session.exec(select(Withdrawal).where(Withdrawal.id == withdrawal_id).with_for_update())
    ).first()
    if withdrawal is not None:
        await session.refresh(withdrawal)
    return withdrawal


async def _lock_pending(session: AsyncSession, withdrawal_id: UUID) -> Withdrawal:
    withdrawal = await lock_withdrawal(session, withdrawal_id)
    if withdrawal is None:
        raise ApiError(404, "NOT_FOUND", "Withdrawal not found.")
    if withdrawal.status != W.PENDING:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"This withdrawal is already {withdrawal.status.value.lower()}.",
                       {"from": withdrawal.status.value})
    return withdrawal


def _save(session: AsyncSession, withdrawal: Withdrawal) -> None:
    withdrawal.updated_at = _now()
    session.add(withdrawal)


async def approve(session: AsyncSession, withdrawal_id: UUID, admin: Profile) -> Withdrawal:
    """PENDING -> PROCESSING. Commit before calling Paystack, so two admins can't both send the money."""
    withdrawal = await _lock_pending(session, withdrawal_id)
    withdrawal.status = W.PROCESSING
    withdrawal.reviewed_by, withdrawal.reviewed_at = admin.id, _now()
    _save(session, withdrawal)
    await session.flush()
    return withdrawal


async def reject(session: AsyncSession, withdrawal_id: UUID, admin: Profile, reason: str) -> Withdrawal:
    """PENDING -> REJECTED, and the held amount goes back to the balance."""
    if not reason.strip():
        raise ApiError(422, "VALIDATION_ERROR", "Give a reason for the user.")
    withdrawal = await _lock_pending(session, withdrawal_id)
    withdrawal.status = W.REJECTED
    withdrawal.failure_reason = reason.strip()
    withdrawal.reviewed_by, withdrawal.reviewed_at = admin.id, _now()
    _save(session, withdrawal)
    await session.flush()
    await ledger.reverse_withdrawal(session, withdrawal)
    return withdrawal


async def record_transfer(session: AsyncSession, withdrawal_id: UUID, transfer_code: str | None) -> Withdrawal | None:
    withdrawal = await lock_withdrawal(session, withdrawal_id)
    if withdrawal is not None and transfer_code and not withdrawal.paystack_transfer_code:
        withdrawal.paystack_transfer_code = transfer_code
        _save(session, withdrawal)
    return withdrawal


async def mark_paid(session: AsyncSession, withdrawal_id: UUID) -> bool:
    """Paystack says the money arrived. False (nothing changes) if already final or unknown."""
    withdrawal = await lock_withdrawal(session, withdrawal_id)
    if withdrawal is None or withdrawal.status in FINAL:
        return False
    withdrawal.status = W.PAID
    withdrawal.paid_at = _now()
    _save(session, withdrawal)
    return True


async def fail(session: AsyncSession, withdrawal_id: UUID, reason: str) -> bool:
    """The payout failed or was reversed: FAILED and the money goes back. False if already final or unknown."""
    withdrawal = await lock_withdrawal(session, withdrawal_id)
    if withdrawal is None or withdrawal.status in FINAL:
        return False
    withdrawal.status = W.FAILED
    withdrawal.failure_reason = reason
    _save(session, withdrawal)
    await session.flush()
    await ledger.reverse_withdrawal(session, withdrawal)
    return True
