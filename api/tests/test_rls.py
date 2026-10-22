"""RLS as the browser sees it: Supabase's `authenticated` role with a JWT `sub` (stubbed in conftest)."""
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Profile
from tests.factories import make_pickup, make_user


async def act_as(session: AsyncSession, role: str, user_id: UUID | None = None) -> None:
    """Switch the transaction to a browser role, like PostgREST/Realtime do with the JWT."""
    await session.exec(text(f"set local role {role}"))
    if user_id:
        await session.exec(text("select set_config('request.jwt.claim.sub', :sub, true)").bindparams(sub=str(user_id)))


@pytest_asyncio.fixture
async def two_users_with_pickups(session: AsyncSession) -> tuple[Profile, Profile]:
    alice, bob = await make_user(session, "Alice"), await make_user(session, "Bob")
    await make_pickup(session, alice, "GRA")
    await make_pickup(session, bob, "Uwani")
    return alice, bob


async def test_user_reads_only_own_pickups(session: AsyncSession, two_users_with_pickups) -> None:
    alice, _ = two_users_with_pickups
    await act_as(session, "authenticated", alice.id)
    owners = (await session.exec(text("select user_id from pickups"))).scalars().all()
    assert owners == [alice.id]


async def test_assigned_collector_reads_the_pickup(session: AsyncSession, two_users_with_pickups) -> None:
    alice, bob = two_users_with_pickups
    collector = await make_user(session, "Collector")
    await session.exec(
        text("update pickups set collector_id = :c, status = 'ASSIGNED' where user_id = :u").bindparams(
            c=collector.id, u=bob.id
        )
    )
    await act_as(session, "authenticated", collector.id)
    owners = (await session.exec(text("select user_id from pickups"))).scalars().all()
    assert owners == [bob.id]


async def test_assigned_collector_cannot_read_the_qr_token(session: AsyncSession, two_users_with_pickups) -> None:
    _, bob = two_users_with_pickups
    collector = await make_user(session, "Collector")
    await session.exec(
        text("update pickups set collector_id = :c, status = 'ASSIGNED' where user_id = :u").bindparams(
            c=collector.id, u=bob.id
        )
    )
    await act_as(session, "authenticated", collector.id)
    with pytest.raises(ProgrammingError, match="permission denied"):
        await session.exec(text("select qr_token from pickups"))


@pytest.mark.parametrize("column", ["qr_token", "otp_hash", "address", "dispute_reason"])
async def test_owner_reads_only_realtime_columns(session: AsyncSession, two_users_with_pickups, column: str) -> None:
    alice, _ = two_users_with_pickups
    await act_as(session, "authenticated", alice.id)
    with pytest.raises(ProgrammingError, match="permission denied"):
        await session.exec(text(f"select {column} from pickups"))


async def test_browser_cannot_change_pickups(session: AsyncSession, two_users_with_pickups) -> None:
    alice, _ = two_users_with_pickups
    await act_as(session, "authenticated", alice.id)
    with pytest.raises(ProgrammingError, match="permission denied"):
        await session.exec(text("update pickups set status = 'COMPLETED'"))


async def test_anon_reads_no_pickups(session: AsyncSession, two_users_with_pickups) -> None:
    await act_as(session, "anon")
    with pytest.raises(ProgrammingError, match="permission denied"):
        await session.exec(text("select id from pickups"))


@pytest.mark.parametrize("table", ["profiles", "prices", "pickup_items", "ledger_entries", "withdrawals", "bales"])
async def test_tables_without_policy_return_nothing(
    session: AsyncSession, two_users_with_pickups, table: str
) -> None:
    alice, _ = two_users_with_pickups
    await act_as(session, "authenticated", alice.id)
    assert (await session.exec(text(f"select count(*) from {table}"))).scalar_one() == 0


@pytest.mark.parametrize("view", ["wallet_balances", "current_prices", "raw_stock"])
async def test_views_are_hidden_from_the_browser(session: AsyncSession, view: str) -> None:
    await act_as(session, "authenticated", uuid4())
    with pytest.raises(ProgrammingError, match="permission denied"):
        await session.exec(text(f"select * from {view}"))


async def test_pickups_are_in_the_realtime_publication(session: AsyncSession) -> None:
    tables = (
        (await session.exec(text("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")))
        .scalars()
        .all()
    )
    assert tables == ["pickups"]
