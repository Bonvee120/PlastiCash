"""The database itself enforces "a pickup is credited exactly once" (CLAUDE.md rule 3)."""
import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.models import LedgerEntry, LedgerType
from tests.factories import make_pickup, make_user


def credit(session: Session, pickup, amount_kobo: int = 18_500) -> None:
    session.add(LedgerEntry(user_id=pickup.user_id, type=LedgerType.PICKUP_CREDIT, amount_kobo=amount_kobo, pickup_id=pickup.id))
    session.flush()


def test_second_pickup_credit_is_rejected(session: Session) -> None:
    pickup = make_pickup(session, make_user(session))
    credit(session, pickup)

    with pytest.raises(IntegrityError, match="ledger_one_credit_per_pickup"):
        with session.begin_nested():
            credit(session, pickup)


def test_each_pickup_can_be_credited_once(session: Session) -> None:
    user = make_user(session)
    credit(session, make_pickup(session, user))
    credit(session, make_pickup(session, user))


def test_index_only_covers_pickup_credits(session: Session) -> None:
    """The unique index is partial: an ADJUSTMENT that refers to an already credited pickup is allowed."""
    admin = make_user(session, "Admin")
    pickup = make_pickup(session, make_user(session))
    credit(session, pickup)

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
    session.flush()
