"""RLS as the browser sees it: Supabase's `authenticated` role with a JWT `sub` (stubbed in conftest)."""
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session

from app.models import AccountType, Pickup, Profile


def make_user(session: Session, name: str) -> Profile:
    user = Profile(
        id=uuid4(),
        account_type=AccountType.INDIVIDUAL,
        full_name=name,
        phone=f"+234{uuid4().int % 10**10:010d}",
        email=f"{name.lower()}@example.com",
    )
    session.add(user)
    session.flush()
    return user


def act_as(session: Session, role: str, user_id: UUID | None = None) -> None:
    """Switch the transaction to a browser role, like PostgREST/Realtime do with the JWT."""
    session.exec(text(f"set local role {role}"))
    if user_id:
        session.exec(text("select set_config('request.jwt.claim.sub', :sub, true)").bindparams(sub=str(user_id)))


@pytest.fixture
def two_users_with_pickups(session: Session) -> tuple[Profile, Profile]:
    alice, bob = make_user(session, "Alice"), make_user(session, "Bob")
    session.add_all([Pickup(user_id=alice.id, area="GRA"), Pickup(user_id=bob.id, area="Uwani")])
    session.flush()
    return alice, bob


def test_user_reads_only_own_pickups(session: Session, two_users_with_pickups) -> None:
    alice, _ = two_users_with_pickups
    act_as(session, "authenticated", alice.id)
    owners = session.exec(text("select user_id from pickups")).scalars().all()
    assert owners == [alice.id]


def test_assigned_collector_reads_the_pickup(session: Session, two_users_with_pickups) -> None:
    alice, bob = two_users_with_pickups
    collector = make_user(session, "Collector")
    session.exec(
        text("update pickups set collector_id = :c, status = 'ASSIGNED' where user_id = :u").bindparams(
            c=collector.id, u=bob.id
        )
    )
    act_as(session, "authenticated", collector.id)
    owners = session.exec(text("select user_id from pickups")).scalars().all()
    assert owners == [bob.id]


def test_anon_reads_no_pickups(session: Session, two_users_with_pickups) -> None:
    act_as(session, "anon")
    assert session.exec(text("select count(*) from pickups")).scalar_one() == 0


@pytest.mark.parametrize("table", ["profiles", "prices", "pickup_items", "ledger_entries", "withdrawals", "bales"])
def test_tables_without_policy_return_nothing(session: Session, two_users_with_pickups, table: str) -> None:
    alice, _ = two_users_with_pickups
    act_as(session, "authenticated", alice.id)
    assert session.exec(text(f"select count(*) from {table}")).scalar_one() == 0


@pytest.mark.parametrize("view", ["wallet_balances", "current_prices", "raw_stock"])
def test_views_are_hidden_from_the_browser(session: Session, view: str) -> None:
    act_as(session, "authenticated", uuid4())
    with pytest.raises(ProgrammingError, match="permission denied"):
        session.exec(text(f"select * from {view}"))


def test_pickups_are_in_the_realtime_publication(session: Session) -> None:
    tables = session.exec(
        text("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")
    ).scalars().all()
    assert tables == ["pickups"]
