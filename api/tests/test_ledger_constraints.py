"""The database itself enforces "a pickup is credited exactly once" (CLAUDE.md rule 3)."""
import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import LedgerEntry, LedgerType, Pickup
from tests.factories import make_pickup, make_user


async def credit(session: AsyncSession, pickup: Pickup, amount_kobo: int = 18_500) -> None:
    session.add(
        LedgerEntry(user_id=pickup.user_id, type=LedgerType.PICKUP_CREDIT, amount_kobo=amount_kobo, pickup_id=pickup.id)
    )
    await session.flush()


async def test_second_pickup_credit_is_rejected(session: AsyncSession) -> None:
    pickup = await make_pickup(session, await make_user(session))
    await credit(session, pickup)

    with pytest.raises(IntegrityError, match="ledger_one_credit_per_pickup"):
        async with session.begin_nested():
            await credit(session, pickup)


async def test_each_pickup_can_be_credited_once(session: AsyncSession) -> None:
    user = await make_user(session)
    await credit(session, await make_pickup(session, user))
    await credit(session, await make_pickup(session, user))


async def test_index_only_covers_pickup_credits(session: AsyncSession) -> None:
    """The unique index is partial: an ADJUSTMENT that refers to an already credited pickup is allowed."""
    admin = await make_user(session, "Admin")
    pickup = await make_pickup(session, await make_user(session))
    await credit(session, pickup)

    session.add(
        LedgerEntry(
            user_id=pickup.user_id,
            type=LedgerType.ADJUSTMENT,
            amount_kobo=-500,
            pickup_id=pickup.id,
            note="Correction after recount",
            created_by=admin.id,
        )
    )
    await session.flush()
