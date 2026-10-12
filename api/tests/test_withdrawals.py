"""Steps 4.4-4.5: wallet, withdrawal request, admin approve/reject. Required tests 2, 10, 11 (docs/specs/04)."""
import asyncio
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.main import app
from app.models import LedgerEntry, LedgerType, Profile, Role, Withdrawal, WithdrawalStatus
from app.services import ledger
from app.services.paystack import BASE_URL
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

W = WithdrawalStatus
TRANSFER = f"{BASE_URL}/transfer"


async def funded_user(session: AsyncSession, admin: Profile, naira: int, *, bank: bool = True) -> Profile:
    user = await make_user(session, "Chinaza")
    if bank:
        user.bank_name, user.bank_code = "Guaranty Trust Bank", "058"
        user.account_number, user.account_name = "0123456789", "CHINAZA OKAFOR"
        user.paystack_recipient_code = "RCP_test"
        session.add(user)
    if naira:
        await ledger.add_adjustment(session, user.id, naira * 100, "Opening balance for test", admin.id)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def admin(session: AsyncSession) -> Profile:
    return await make_user(session, "Admin", role=Role.ADMIN)


async def withdraw(client: AsyncClient, user: Profile, naira: int):
    return await client.post("/api/v1/withdrawals", json={"amount_kobo": naira * 100}, headers=bearer(user.id))


async def balance(client: AsyncClient, user: Profile) -> int:
    return (await client.get("/api/v1/wallet", headers=bearer(user.id))).json()["balance_kobo"]


# ----- 4.4 request -----


async def test_withdraw_holds_the_amount(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await funded_user(session, admin, 3_000)
    response = await withdraw(client, user, 1_000)
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["amount_kobo"], body["points"]) == ("PENDING", 100_000, "1000")
    assert body["account_number_last4"] == "6789" and "0123456789" not in response.text
    assert await balance(client, user) == 200_000

    wallet = (await client.get("/api/v1/wallet", headers=bearer(user.id))).json()
    assert [e["type"] for e in wallet["entries"]] == ["WITHDRAWAL_HOLD", "ADJUSTMENT"]
    assert wallet["points"] == "2000"
    mine = (await client.get("/api/v1/withdrawals", headers=bearer(user.id))).json()
    assert [w["id"] for w in mine] == [body["id"]]


@pytest.mark.parametrize(
    "naira, balance_naira, bank, code",
    [
        (999, 5_000, True, "BELOW_MINIMUM"),
        (3_001, 3_000, True, "INSUFFICIENT_BALANCE"),
        (1_000, 5_000, False, "BANK_DETAILS_REQUIRED"),
    ],
    ids=["below 1,000", "above balance", "no bank account"],
)
async def test_10_withdrawal_rules(
    client: AsyncClient, session: AsyncSession, admin, naira, balance_naira, bank, code
) -> None:
    user = await funded_user(session, admin, balance_naira, bank=bank)
    response = await withdraw(client, user, naira)
    assert response.status_code == 400
    assert response.json()["code"] == code
    assert await balance(client, user) == balance_naira * 100  # nothing held


async def test_exact_balance_and_minimum_are_allowed(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await funded_user(session, admin, 1_000)
    assert (await withdraw(client, user, 1_000)).status_code == 201
    assert await balance(client, user) == 0


async def test_withdrawal_amount_must_be_positive(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await funded_user(session, admin, 1_000)
    response = await client.post("/api/v1/withdrawals", json={"amount_kobo": 0}, headers=bearer(user.id))
    assert response.status_code == 422


async def test_only_users_withdraw(client: AsyncClient, session: AsyncSession, admin) -> None:
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    assert (await withdraw(client, collector, 1_000)).status_code == 403


@pytest_asyncio.fixture
async def concurrent_client(committed: AsyncEngine) -> AsyncIterator[AsyncClient]:
    """Each request gets its own session and connection, like production, on really committed data."""

    async def own_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(committed, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = own_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def test_2_two_simultaneous_withdrawals_cannot_overdraw(
    concurrent_client: AsyncClient, committed: AsyncEngine, monkeypatch
) -> None:
    # Widen the race window: pause right after the balance is read, where an overdraw would sneak in.
    # With the profile row lock the second request waits before reading; without it both read 1,500 and both pay.
    real_balance = ledger.balance_kobo

    async def slow_balance(session, user_id):
        value = await real_balance(session, user_id)
        await asyncio.sleep(0.3)
        return value

    monkeypatch.setattr(ledger, "balance_kobo", slow_balance)

    async with AsyncSession(committed, expire_on_commit=False) as setup:
        admin = await make_user(setup, "Admin", role=Role.ADMIN)
        user = await funded_user(setup, admin, 1_500)
        await setup.commit()

    first, second = await asyncio.gather(withdraw(concurrent_client, user, 1_000), withdraw(concurrent_client, user, 1_000))
    assert sorted([first.status_code, second.status_code]) == [201, 400]
    loser = first if first.status_code == 400 else second
    assert loser.json()["code"] == "INSUFFICIENT_BALANCE"

    async with AsyncSession(committed) as check:
        assert await ledger.balance_kobo(check, user.id) == 50_000
        holds = (await check.exec(select(func.count()).where(LedgerEntry.type == LedgerType.WITHDRAWAL_HOLD))).one()
        assert holds == 1


# ----- 4.5 approve and reject -----


async def pending(client: AsyncClient, session: AsyncSession, admin: Profile, naira: int = 1_000) -> tuple[Profile, str]:
    user = await funded_user(session, admin, 3_000)
    return user, (await withdraw(client, user, naira)).json()["id"]


async def test_11_reject_restores_the_balance(client: AsyncClient, session: AsyncSession, admin) -> None:
    user, withdrawal_id = await pending(client, session, admin)
    assert await balance(client, user) == 200_000
    response = await client.post(
        f"/api/v1/admin/withdrawals/{withdrawal_id}/reject", json={"reason": "Name mismatch"}, headers=bearer(admin.id)
    )
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["failure_reason"]) == ("REJECTED", "Name mismatch")
    assert await balance(client, user) == 300_000
    again = await client.post(
        f"/api/v1/admin/withdrawals/{withdrawal_id}/reject", json={"reason": "again"}, headers=bearer(admin.id)
    )
    assert again.status_code == 409
    assert await balance(client, user) == 300_000


@respx.mock
async def test_approve_sends_the_transfer_once(client: AsyncClient, session: AsyncSession, admin) -> None:
    user, withdrawal_id = await pending(client, session, admin)
    route = respx.post(TRANSFER).respond(200, json={"status": True, "data": {"transfer_code": "TRF_9", "status": "pending"}})
    response = await client.post(f"/api/v1/admin/withdrawals/{withdrawal_id}/approve", headers=bearer(admin.id))
    assert response.status_code == 200 and response.json()["status"] == "PROCESSING"
    sent = route.calls[0].request.read()
    assert f'"reference":"{withdrawal_id}"'.encode() in sent and b'"amount":100000' in sent
    assert (await session.get(Withdrawal, withdrawal_id)).paystack_transfer_code == "TRF_9"

    again = await client.post(f"/api/v1/admin/withdrawals/{withdrawal_id}/approve", headers=bearer(admin.id))
    assert again.status_code == 409
    assert route.call_count == 1
    assert await balance(client, user) == 200_000  # held until Paystack confirms


@respx.mock
async def test_approve_refused_by_paystack_fails_and_refunds(client: AsyncClient, session: AsyncSession, admin) -> None:
    user, withdrawal_id = await pending(client, session, admin)
    respx.post(TRANSFER).respond(400, json={"status": False, "message": "Insufficient balance"})
    response = await client.post(f"/api/v1/admin/withdrawals/{withdrawal_id}/approve", headers=bearer(admin.id))
    assert response.json()["status"] == "FAILED"
    assert "Insufficient balance" in response.json()["failure_reason"]
    assert await balance(client, user) == 300_000


@respx.mock
async def test_approve_timeout_keeps_processing_without_refund(client: AsyncClient, session: AsyncSession, admin) -> None:
    user, withdrawal_id = await pending(client, session, admin)
    respx.post(TRANSFER).mock(side_effect=httpx.ReadTimeout("slow"))
    response = await client.post(f"/api/v1/admin/withdrawals/{withdrawal_id}/approve", headers=bearer(admin.id))
    assert response.json()["status"] == "PROCESSING"
    assert await balance(client, user) == 200_000  # no refund: the transfer may have gone through


async def test_admin_queue_filters_by_status(client: AsyncClient, session: AsyncSession, admin) -> None:
    _, withdrawal_id = await pending(client, session, admin)
    queue = (await client.get("/api/v1/admin/withdrawals", params={"status": "PENDING"}, headers=bearer(admin.id))).json()
    assert withdrawal_id in [w["id"] for w in queue]
    paid = (await client.get("/api/v1/admin/withdrawals", params={"status": "PAID"}, headers=bearer(admin.id))).json()
    assert withdrawal_id not in [w["id"] for w in paid]
