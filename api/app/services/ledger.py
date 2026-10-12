"""The ledger: the only source of truth for money (CLAUDE.md rules 1-3).

- Money is integer kobo. A user's balance is SUM(amount_kobo) of their ledger entries; there is no balance column.
- Entries are insert-only (the database refuses UPDATE and DELETE). Corrections are ADJUSTMENT rows.
- One PICKUP_CREDIT per pickup, one WITHDRAWAL_HOLD and one WITHDRAWAL_REVERSAL per withdrawal: partial unique
  indexes enforce it. A duplicate insert fails inside a savepoint and is reported as "already done", so a retry,
  a double click or a duplicate webhook can never pay twice and never crashes.
"""
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import LedgerEntry, LedgerType, Pickup, PickupStatus, Withdrawal


async def balance_kobo(session: AsyncSession, user_id: UUID) -> int:
    total = await session.exec(
        select(func.coalesce(func.sum(LedgerEntry.amount_kobo), 0)).where(LedgerEntry.user_id == user_id)
    )
    return int(total.one())


async def _insert_once(session: AsyncSession, entry: LedgerEntry) -> bool:
    """Insert in a savepoint. False if a unique index says this entry already exists (nothing changes)."""
    try:
        async with session.begin_nested():
            session.add(entry)
    except IntegrityError as error:
        if "ledger_one_" not in str(error.orig):
            raise  # some other constraint: a real bug, don't hide it
        return False
    return True


async def credit_pickup(session: AsyncSession, pickup: Pickup) -> bool:
    """Credit a COMPLETED pickup's total to its owner. Returns False if it was already credited."""
    if pickup.status != PickupStatus.COMPLETED or not pickup.total_amount_kobo:
        raise ValueError("only a COMPLETED pickup with a positive total can be credited")
    return await _insert_once(
        session,
        LedgerEntry(
            user_id=pickup.user_id,
            type=LedgerType.PICKUP_CREDIT,
            amount_kobo=pickup.total_amount_kobo,
            pickup_id=pickup.id,
        ),
    )


async def hold_withdrawal(session: AsyncSession, withdrawal: Withdrawal) -> bool:
    """Take the withdrawal amount out of the balance while the payout is pending."""
    return await _insert_once(
        session,
        LedgerEntry(
            user_id=withdrawal.user_id,
            type=LedgerType.WITHDRAWAL_HOLD,
            amount_kobo=-withdrawal.amount_kobo,
            withdrawal_id=withdrawal.id,
        ),
    )


async def reverse_withdrawal(session: AsyncSession, withdrawal: Withdrawal) -> bool:
    """Give a held amount back (rejected or failed payout). Returns False if it was already reversed."""
    return await _insert_once(
        session,
        LedgerEntry(
            user_id=withdrawal.user_id,
            type=LedgerType.WITHDRAWAL_REVERSAL,
            amount_kobo=withdrawal.amount_kobo,
            withdrawal_id=withdrawal.id,
        ),
    )


async def add_adjustment(
    session: AsyncSession, user_id: UUID, amount_kobo: int, note: str, admin_id: UUID
) -> LedgerEntry:
    """Admin correction (e.g. a complaint after the 48 h auto-confirm). Never edits existing rows."""
    if amount_kobo == 0 or not note.strip():
        raise ValueError("an adjustment needs a non-zero amount and a note")
    entry = LedgerEntry(
        user_id=user_id, type=LedgerType.ADJUSTMENT, amount_kobo=amount_kobo, note=note.strip(), created_by=admin_id
    )
    session.add(entry)
    await session.flush()
    return entry
