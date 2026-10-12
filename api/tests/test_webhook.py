"""Step 4.7: Paystack webhook. Required tests 3, 4, 5 (docs/specs/04)."""
import asyncio
import hashlib
import hmac
import json
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings
from app.db import get_session
from app.main import app
from app.models import LedgerEntry, LedgerType, Role, Withdrawal, WithdrawalStatus
from app.routers import webhooks
from app.services import ledger, withdrawals
from tests.factories import make_user

SECRET = "sk_test_webhook_unit_secret"
URL = "/api/v1/webhooks/paystack"
W = WithdrawalStatus


@pytest.fixture(autouse=True)
def webhook_secret(monkeypatch) -> None:
    monkeypatch.setattr(webhooks, "get_settings", lambda: Settings(paystack_secret_key=SECRET))


def signed(event: str, reference: str, *, secret: str = SECRET, **data) -> tuple[bytes, dict]:
    body = json.dumps({"event": event, "data": {"reference": reference, "amount": 100_000, **data}}).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return body, {"x-paystack-signature": signature, "content-type": "application/json"}


async def deliver(client: AsyncClient, event: str, reference: str, **kwargs):
    body, headers = signed(event, reference, **kwargs)
    return await client.post(URL, content=body, headers=headers)


async def processing_withdrawal(session: AsyncSession) -> Withdrawal:
    """A ₦1,000 payout that an admin approved: PROCESSING, with the hold in place (balance ₦2,000 of ₦3,000)."""
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    user = await make_user(session, "Chinaza")
    user.bank_name, user.account_number, user.account_name = "Access Bank", "0234567890", "CHINAZA OKAFOR"
    user.paystack_recipient_code = "RCP_test"
    session.add(user)
    await ledger.add_adjustment(session, user.id, 300_000, "Opening balance for test", admin.id)
    withdrawal = await withdrawals.request_withdrawal(session, user.id, 100_000)
    await withdrawals.approve(session, withdrawal.id, admin)
    await session.flush()
    return withdrawal


async def entries(session: AsyncSession, withdrawal: Withdrawal, kind: LedgerType) -> int:
    query = select(func.count()).where(LedgerEntry.withdrawal_id == withdrawal.id, LedgerEntry.type == kind)
    return (await session.exec(query)).one()


async def test_3_duplicate_success_pays_once(client: AsyncClient, session: AsyncSession) -> None:
    withdrawal = await processing_withdrawal(session)
    assert (await deliver(client, "transfer.success", str(withdrawal.id))).status_code == 200
    await session.refresh(withdrawal)
    assert withdrawal.status == W.PAID
    paid_at = withdrawal.paid_at

    assert (await deliver(client, "transfer.success", str(withdrawal.id))).status_code == 200
    await session.refresh(withdrawal)
    assert (withdrawal.status, withdrawal.paid_at) == (W.PAID, paid_at)
    rows = (await session.exec(select(func.count()).where(LedgerEntry.withdrawal_id == withdrawal.id))).one()
    assert rows == 1  # only the hold: no extra rows
    assert await ledger.balance_kobo(session, withdrawal.user_id) == 200_000


async def test_4_duplicate_failure_reverses_once(client: AsyncClient, session: AsyncSession) -> None:
    withdrawal = await processing_withdrawal(session)
    for _ in range(2):
        response = await deliver(client, "transfer.failed", str(withdrawal.id), reason="Account closed")
        assert response.status_code == 200
    await session.refresh(withdrawal)
    assert (withdrawal.status, withdrawal.failure_reason) == (W.FAILED, "Account closed")
    assert await entries(session, withdrawal, LedgerType.WITHDRAWAL_REVERSAL) == 1
    assert await ledger.balance_kobo(session, withdrawal.user_id) == 300_000  # restored once


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"x-paystack-signature": "deadbeef"},
        "other key",
        "tampered body",
    ],
    ids=["no signature", "garbage signature", "signed with another key", "body changed after signing"],
)
async def test_5_bad_signature_is_401_and_changes_nothing(client: AsyncClient, session: AsyncSession, headers) -> None:
    withdrawal = await processing_withdrawal(session)
    body, good = signed("transfer.success", str(withdrawal.id))
    if headers == "other key":
        body, headers = signed("transfer.success", str(withdrawal.id), secret="sk_test_attacker")
    elif headers == "tampered body":
        body, headers = body.replace(b"100000", b"999999"), good
    response = await client.post(URL, content=body, headers=headers)
    assert response.status_code == 401
    assert response.json()["code"] == "BAD_SIGNATURE"
    await session.refresh(withdrawal)
    assert withdrawal.status == W.PROCESSING


async def test_no_secret_configured_refuses_everything(client: AsyncClient, session: AsyncSession, monkeypatch) -> None:
    monkeypatch.setattr(webhooks, "get_settings", lambda: Settings(paystack_secret_key=""))
    withdrawal = await processing_withdrawal(session)
    response = await deliver(client, "transfer.success", str(withdrawal.id), secret="")
    assert response.status_code == 401
    await session.refresh(withdrawal)
    assert withdrawal.status == W.PROCESSING


async def test_reversed_counts_as_failed(client: AsyncClient, session: AsyncSession) -> None:
    withdrawal = await processing_withdrawal(session)
    await deliver(client, "transfer.reversed", str(withdrawal.id))
    await session.refresh(withdrawal)
    assert withdrawal.status == W.FAILED
    assert await ledger.balance_kobo(session, withdrawal.user_id) == 300_000


async def test_success_after_failure_changes_nothing(client: AsyncClient, session: AsyncSession) -> None:
    withdrawal = await processing_withdrawal(session)
    await deliver(client, "transfer.failed", str(withdrawal.id))
    await deliver(client, "transfer.success", str(withdrawal.id))
    await session.refresh(withdrawal)
    assert withdrawal.status == W.FAILED and withdrawal.paid_at is None


@pytest.mark.parametrize("event, reference", [("charge.success", None), ("transfer.success", "not-a-uuid"),
                                              ("transfer.success", "unknown")])
async def test_other_events_and_unknown_references_are_ignored(
    client: AsyncClient, session: AsyncSession, event, reference
) -> None:
    withdrawal = await processing_withdrawal(session)
    ref = {None: str(withdrawal.id), "unknown": str(uuid4())}.get(reference, reference)
    assert (await deliver(client, event, ref)).status_code == 200
    await session.refresh(withdrawal)
    assert withdrawal.status == W.PROCESSING


@pytest_asyncio.fixture
async def concurrent_client(committed: AsyncEngine) -> AsyncIterator[AsyncClient]:
    async def own_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(committed, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = own_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def test_4_simultaneous_duplicate_failures_reverse_once(
    concurrent_client: AsyncClient, committed: AsyncEngine
) -> None:
    async with AsyncSession(committed, expire_on_commit=False) as setup:
        withdrawal = await processing_withdrawal(setup)
        await setup.commit()

    responses = await asyncio.gather(*[deliver(concurrent_client, "transfer.failed", str(withdrawal.id)) for _ in range(3)])
    assert [r.status_code for r in responses] == [200, 200, 200]
    async with AsyncSession(committed) as check:
        assert await entries(check, withdrawal, LedgerType.WITHDRAWAL_REVERSAL) == 1
        assert await ledger.balance_kobo(check, withdrawal.user_id) == 300_000
