"""9.3 POST /jobs/reminders: reminders at 2, 12 and 24 h, auto-confirm at 48 h (required test 9)."""
import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings
from app.db import get_session
from app.main import app
from app.models import ConfirmedVia, LedgerEntry, LedgerType, Material, Pickup, PickupStatus, Role
from app.routers import jobs
from app.services import ledger
from tests.factories import make_price, make_user, make_weighed_pickup

URL = "/api/v1/jobs/reminders"
SECRET = "cron-secret-for-tests-0123456789abcdef"
HEADERS = {"X-Cron-Secret": SECRET}


@pytest.fixture(autouse=True)
def cron_secret(monkeypatch) -> None:
    monkeypatch.setattr(jobs, "get_settings", lambda: Settings(cron_secret=SECRET))


async def weighed(session: AsyncSession, hours_ago: float, *, reminders_sent: int = 0) -> Pickup:
    await make_price(session, Material.PET, 185)
    owner = await make_user(session, "Owner")
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    pickup = await make_weighed_pickup(session, owner, collector, [(Material.PET, "20.00")])
    pickup.weighed_at = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    pickup.reminders_sent = reminders_sent
    session.add(pickup)
    await session.flush()
    return pickup


async def credits(session: AsyncSession, pickup: Pickup) -> int:
    return (
        await session.exec(
            select(func.count()).select_from(LedgerEntry).where(
                LedgerEntry.pickup_id == pickup.id, LedgerEntry.type == LedgerType.PICKUP_CREDIT
            )
        )
    ).one()


@pytest.mark.parametrize("headers", [{}, {"X-Cron-Secret": "wrong"}])
async def test_job_needs_the_cron_secret(client: AsyncClient, headers) -> None:
    response = await client.post(URL, headers=headers)
    assert response.status_code == 401


async def test_job_is_closed_when_no_secret_is_configured(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(jobs, "get_settings", lambda: Settings(cron_secret=""))
    assert (await client.post(URL, headers={"X-Cron-Secret": ""})).status_code == 401


async def test_reminders_at_2_12_and_24_hours(client: AsyncClient, session: AsyncSession, sms) -> None:
    fresh = await weighed(session, 1)
    pickup = await weighed(session, 3)
    body = (await client.post(URL, headers=HEADERS)).json()
    assert (body["reminders"], body["auto_confirmed"]) == (1, 0)
    assert len(sms) == 1 and "please check your pickup: 20.00 kg = 3,700 pts" in sms[0][1]
    await session.refresh(pickup)
    await session.refresh(fresh)
    assert (pickup.reminders_sent, fresh.reminders_sent) == (1, 0)

    # Again in the same window: nothing new.
    await client.post(URL, headers=HEADERS)
    assert len(sms) == 1

    pickup.weighed_at = datetime.now(timezone.utc) - timedelta(hours=13)
    session.add(pickup)
    await session.flush()
    await client.post(URL, headers=HEADERS)
    await session.refresh(pickup)
    assert pickup.reminders_sent == 2 and len(sms) == 2


async def test_a_late_run_sends_one_reminder_not_three(client: AsyncClient, session: AsyncSession, sms) -> None:
    pickup = await weighed(session, 30)
    await client.post(URL, headers=HEADERS)
    await session.refresh(pickup)
    assert pickup.reminders_sent == 3 and len(sms) == 1


async def test_9_auto_confirm_at_48_hours_credits_once(client: AsyncClient, session: AsyncSession, sms) -> None:
    pickup = await weighed(session, 48.1, reminders_sent=3)
    early = await weighed(session, 47.9, reminders_sent=3)
    first = (await client.post(URL, headers=HEADERS)).json()
    assert first["auto_confirmed"] == 1
    await session.refresh(pickup)
    await session.refresh(early)
    assert (pickup.status, pickup.confirmed_via, pickup.otp_hash) == (PickupStatus.COMPLETED, ConfirmedVia.AUTO, None)
    assert early.status == PickupStatus.AWAITING_CONFIRMATION
    assert await ledger.balance_kobo(session, pickup.user_id) == 370_000

    second = (await client.post(URL, headers=HEADERS)).json()
    assert second["auto_confirmed"] == 0
    assert await credits(session, pickup) == 1
    assert await ledger.balance_kobo(session, pickup.user_id) == 370_000
    assert sms == []  # no reminder after all three were sent


async def test_disputed_pickups_are_left_alone(client: AsyncClient, session: AsyncSession, sms) -> None:
    pickup = await weighed(session, 60)
    pickup.status, pickup.disputed_at = PickupStatus.DISPUTED, datetime.now(timezone.utc)
    session.add(pickup)
    await session.flush()
    body = (await client.post(URL, headers=HEADERS)).json()
    assert (body["checked"], body["auto_confirmed"]) == (0, 0)
    await session.refresh(pickup)
    assert pickup.status == PickupStatus.DISPUTED


@pytest_asyncio.fixture
async def concurrent_client(committed: AsyncEngine) -> AsyncIterator[AsyncClient]:
    async def own_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(committed, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = own_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def test_9_overlapping_runs_credit_once(concurrent_client: AsyncClient, committed: AsyncEngine, sms) -> None:
    async with AsyncSession(committed, expire_on_commit=False) as setup:
        due = await weighed(setup, 49, reminders_sent=3)
        remind = await weighed(setup, 3)
        await setup.commit()

    first, second = await asyncio.gather(
        concurrent_client.post(URL, headers=HEADERS), concurrent_client.post(URL, headers=HEADERS)
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["auto_confirmed"] + second.json()["auto_confirmed"] == 1
    assert first.json()["reminders"] + second.json()["reminders"] == 1
    assert len(sms) == 1
    async with AsyncSession(committed) as check:
        assert await credits(check, due) == 1
        assert (await check.get(Pickup, remind.id)).reminders_sent == 1
