"""Step 8 API: stats, price versions, users and collectors, adjustments, stock and bales. Required test 19."""
import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings
from app.db import get_session
from app.main import app
from app.models import (
    Bale, LedgerType, Material, Pickup, PickupStatus, Profile, Role, Withdrawal, WithdrawalStatus,
)
from app.services import ledger, stock, supabase_admin
from tests.factories import make_price, make_user, make_weighed_pickup
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

API = "/api/v1/admin"


@pytest_asyncio.fixture
async def admin(session: AsyncSession) -> Profile:
    return await make_user(session, "Admin", role=Role.ADMIN)


async def completed(session: AsyncSession, owner: Profile, collector: Profile, items, *, estimated: str | None = None) -> Pickup:
    """A COMPLETED pickup with priced items (test setup: status set directly, credit added like a confirm)."""
    pickup = await make_weighed_pickup(session, owner, collector, items)
    pickup.status, pickup.confirmed_at, pickup.estimated_kg = PickupStatus.COMPLETED, datetime.now(timezone.utc), (
        Decimal(estimated) if estimated else None
    )
    session.add(pickup)
    await ledger.credit_pickup(session, pickup)
    await session.flush()
    return pickup


async def stocked(session: AsyncSession, kg: str = "100.00") -> tuple[Profile, Profile]:
    await make_price(session, Material.PET, 185)
    owner = await make_user(session, "Owner")
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    await completed(session, owner, collector, [(Material.PET, kg)])
    return owner, collector


# ----- 8.7 stock and bales -----


async def test_19_bale_heavier_than_raw_stock_is_rejected(client: AsyncClient, session: AsyncSession, admin) -> None:
    await stocked(session, "100.00")
    too_heavy = await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "100.01"}, headers=bearer(admin.id))
    assert too_heavy.status_code == 422
    assert too_heavy.json()["code"] == "BALE_TOO_HEAVY"
    assert too_heavy.json()["details"]["raw_stock_kg"] == "100.00"

    first = await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "60"}, headers=bearer(admin.id))
    assert first.status_code == 201
    year = datetime.now(timezone.utc).year
    assert first.json()["code"] == f"PET-{year}-0001"
    # 40 kg left: 40.01 is refused, exactly 40 is fine.
    over = await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "40.01"}, headers=bearer(admin.id))
    assert over.status_code == 422
    exact = await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "40"}, headers=bearer(admin.id))
    assert exact.status_code == 201 and exact.json()["code"] == f"PET-{year}-0002"
    # Nothing of another material came in.
    cans = await client.post(f"{API}/bales", json={"material": "CAN", "weight_kg": "1"}, headers=bearer(admin.id))
    assert cans.status_code == 422


async def test_stock_counts_only_completed_pickups(client: AsyncClient, session: AsyncSession, admin) -> None:
    owner, collector = await stocked(session, "100.00")
    await make_weighed_pickup(session, owner, collector, [(Material.PET, "50.00")])  # awaiting: not stock yet
    await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "90"}, headers=bearer(admin.id))
    body = (await client.get(f"{API}/stock", headers=bearer(admin.id))).json()
    pet = next(m for m in body["materials"] if m["material"] == "PET")
    assert (pet["raw_in_kg"], pet["baled_kg"], pet["raw_stock_kg"], pet["loss_pct"]) == ("100.00", "90.00", "10.00", "10.0")
    assert body["bales_by_status"] == {"IN_STORE": 1, "PROCESSED": 0, "SOLD": 0}
    assert next(m for m in body["materials"] if m["material"] == "TIN")["loss_pct"] is None


async def test_bale_moves_in_store_processed_sold(client: AsyncClient, session: AsyncSession, admin) -> None:
    await stocked(session)
    bale = (await client.post(f"{API}/bales", json={"material": "PET", "weight_kg": "50"}, headers=bearer(admin.id))).json()
    sell = {"buyer": "Lagos Recyclers Ltd", "sale_price_kobo": 1_500_000}
    early = await client.post(f"{API}/bales/{bale['id']}/sell", json=sell, headers=bearer(admin.id))
    assert early.status_code == 409  # must be processed first
    processed = await client.post(f"{API}/bales/{bale['id']}/process", headers=bearer(admin.id))
    assert processed.json()["status"] == "PROCESSED" and processed.json()["processed_at"]
    again = await client.post(f"{API}/bales/{bale['id']}/process", headers=bearer(admin.id))
    assert again.status_code == 409
    no_buyer = await client.post(f"{API}/bales/{bale['id']}/sell", json={"sale_price_kobo": 1}, headers=bearer(admin.id))
    assert no_buyer.status_code == 422
    sold = await client.post(f"{API}/bales/{bale['id']}/sell", json=sell, headers=bearer(admin.id))
    assert (sold.json()["status"], sold.json()["buyer"], sold.json()["sale_price_kobo"]) == ("SOLD", "Lagos Recyclers Ltd", 1_500_000)
    stock_body = (await client.get(f"{API}/stock", headers=bearer(admin.id))).json()
    assert stock_body["revenue_kobo"] == 1_500_000 and stock_body["bales_by_status"]["SOLD"] == 1


@pytest_asyncio.fixture
async def concurrent_client(committed: AsyncEngine) -> AsyncIterator[AsyncClient]:
    async def own_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(committed, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = own_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def test_two_simultaneous_bales_cannot_exceed_stock(
    concurrent_client: AsyncClient, committed: AsyncEngine, monkeypatch
) -> None:
    # Pause right after raw stock is read; without the material lock both requests see 100 kg and both bale 60.
    real = stock.raw_stock

    async def slow_raw_stock(session, material):
        value = await real(session, material)
        await asyncio.sleep(0.3)
        return value

    monkeypatch.setattr(stock, "raw_stock", slow_raw_stock)
    async with AsyncSession(committed, expire_on_commit=False) as setup:
        admin = await make_user(setup, "Admin", role=Role.ADMIN)
        await stocked(setup, "100.00")
        await setup.commit()

    body = {"material": "PET", "weight_kg": "60"}
    first, second = await asyncio.gather(
        concurrent_client.post(f"{API}/bales", json=body, headers=bearer(admin.id)),
        concurrent_client.post(f"{API}/bales", json=body, headers=bearer(admin.id)),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 422]
    async with AsyncSession(committed) as check:
        assert (await check.exec(select(func.count()).select_from(Bale))).one() == 1


# ----- 8.4 prices -----


async def test_new_price_version_applies_to_new_weighings_only(client: AsyncClient, session: AsyncSession, admin) -> None:
    await make_price(session, Material.PET, 185)
    owner = await make_user(session, "Owner")
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    old = await make_weighed_pickup(session, owner, collector, [(Material.PET, "10.00")])

    body = {"material": "PET", "price_kobo_per_kg": 20_000, "kg_per_full_sack": "9.5", "items_per_kg": 42,
            "co2_kg_saved_per_kg": "1.146"}
    created = await client.post(f"{API}/prices", json=body, headers=bearer(admin.id))
    assert created.status_code == 201
    assert (created.json()["points_per_kg"], created.json()["set_by"]) == ("200", str(admin.id))
    current = (await client.get("/api/v1/prices/current")).json()
    assert next(p for p in current if p["material"] == "PET")["price_kobo_per_kg"] == 20_000
    history = (await client.get(f"{API}/prices?material=PET", headers=bearer(admin.id))).json()
    assert [p["price_kobo_per_kg"] for p in history] == [20_000, 18_500]
    await session.refresh(old)
    assert old.total_amount_kobo == 185_000  # the earlier weighing keeps its snapshot

    bad = await client.post(f"{API}/prices", json={**body, "kg_per_full_sack": "0"}, headers=bearer(admin.id))
    assert bad.status_code == 422


# ----- 8.1 stats -----


async def test_stats_show_this_months_totals(client: AsyncClient, session: AsyncSession, admin) -> None:
    await make_price(session, Material.PET, 185)
    owner = await make_user(session, "Owner")
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    await completed(session, owner, collector, [(Material.PET, "20.00")], estimated="40.00")
    disputed = await make_weighed_pickup(session, owner, collector, [(Material.PET, "5.00")])
    disputed.status, disputed.disputed_at = PickupStatus.DISPUTED, datetime.now(timezone.utc)
    session.add(disputed)
    await ledger.add_adjustment(session, owner.id, 500_000, "Opening", admin.id)
    session.add(Withdrawal(user_id=owner.id, amount_kobo=200_000, status=WithdrawalStatus.PENDING, bank_name="GTB",
                           account_number="0123456789", account_name="OWNER", paystack_recipient_code="RCP_test"))
    await session.flush()

    body = (await client.get(f"{API}/stats", headers=bearer(admin.id))).json()
    assert body["kg_this_month"] == "20.00"
    assert body["points_paid_kobo"] == 370_000 and body["points_paid"] == "3700"
    assert body["pending_withdrawals"] == {"count": 1, "amount_kobo": 200_000}
    assert (body["open_disputes"], body["raw_stock_kg"]) == (1, "20.00")
    assert body["estimate_accuracy"][0]["accuracy"] == "0.50"
    row = next(c for c in body["disputes_per_collector"] if c["collector_id"] == str(collector.id))
    assert (row["weighed"], row["disputes"]) == (2, 1)


async def test_board_flags_users_with_low_estimate_accuracy(client: AsyncClient, session: AsyncSession, admin) -> None:
    await make_price(session, Material.PET, 185)
    owner = await make_user(session, "Owner")
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    await completed(session, owner, collector, [(Material.PET, "20.00")], estimated="50.00")
    session.add(Pickup(user_id=owner.id, area="GRA", estimated_kg=Decimal("60")))
    await session.flush()
    board = (await client.get(f"{API}/pickups?status=REQUESTED", headers=bearer(admin.id))).json()
    assert board["pickups"][0]["user_estimate_accuracy"] == "0.40"


# ----- 8.6 users, collectors, adjustments -----


async def test_users_list_search_and_balance(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await make_user(session, "Chinaza")
    await ledger.add_adjustment(session, user.id, 123_400, "Opening", admin.id)
    await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    found = (await client.get(f"{API}/users?q=chin", headers=bearer(admin.id))).json()
    assert [(u["full_name"], u["balance_kobo"]) for u in found] == [("Chinaza", 123_400)]
    collectors = (await client.get(f"{API}/users?role=COLLECTOR", headers=bearer(admin.id))).json()
    assert [u["full_name"] for u in collectors] == ["Ifeanyi"]
    by_phone = (await client.get(f"{API}/users?q=0{user.phone[4:]}", headers=bearer(admin.id))).json()
    assert [u["id"] for u in by_phone] == [str(user.id)]


async def test_deactivated_user_is_locked_out(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await make_user(session, "Chinaza")
    response = await client.patch(f"{API}/users/{user.id}", json={"is_active": False}, headers=bearer(admin.id))
    assert response.status_code == 200 and response.json()["is_active"] is False
    me = await client.get("/api/v1/me", headers=bearer(user.id))
    assert me.status_code == 403 and me.json()["code"] == "ACCOUNT_INACTIVE"


async def test_user_patch_rules(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await make_user(session, "Emeka")
    picker = await client.patch(f"{API}/users/{user.id}", json={"verified_picker": True}, headers=bearer(admin.id))
    assert picker.json()["verified_picker"] is True
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    bad = await client.patch(f"{API}/users/{collector.id}", json={"verified_picker": True}, headers=bearer(admin.id))
    assert bad.status_code == 422
    to_user = await client.patch(f"{API}/users/{collector.id}", json={"role": "USER"}, headers=bearer(admin.id))
    assert (to_user.json()["role"], to_user.json()["account_type"]) == ("USER", "INDIVIDUAL")
    to_collector = await client.patch(f"{API}/users/{user.id}", json={"role": "COLLECTOR"}, headers=bearer(admin.id))
    assert (to_collector.json()["role"], to_collector.json()["verified_picker"]) == ("COLLECTOR", False)
    for change in ({"is_active": False}, {"role": "USER"}):
        self_change = await client.patch(f"{API}/users/{admin.id}", json=change, headers=bearer(admin.id))
        assert self_change.status_code == 409


async def test_adjustment_needs_note_and_cannot_go_below_zero(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await make_user(session, "Chinaza")
    credit = await client.post(f"{API}/ledger/adjustments", json={"user_id": str(user.id), "amount_kobo": 50_000,
                               "note": "Complaint after auto-confirm"}, headers=bearer(admin.id))
    assert credit.status_code == 201 and credit.json()["type"] == LedgerType.ADJUSTMENT.value
    too_much = await client.post(f"{API}/ledger/adjustments", json={"user_id": str(user.id), "amount_kobo": -50_001,
                                 "note": "Correction"}, headers=bearer(admin.id))
    assert too_much.status_code == 422 and too_much.json()["code"] == "INSUFFICIENT_BALANCE"
    for body in ({"amount_kobo": 100, "note": ""}, {"amount_kobo": 0, "note": "Zero"}):
        bad = await client.post(f"{API}/ledger/adjustments", json={"user_id": str(user.id), **body}, headers=bearer(admin.id))
        assert bad.status_code == 422
    debit = await client.post(f"{API}/ledger/adjustments", json={"user_id": str(user.id), "amount_kobo": -50_000,
                              "note": "Correction"}, headers=bearer(admin.id))
    assert debit.status_code == 201
    assert await ledger.balance_kobo(session, user.id) == 0


@pytest.fixture
def auth_admin(monkeypatch) -> Settings:
    settings = Settings(supabase_url="https://testproject.supabase.co", supabase_service_role_key="service-key-for-tests")
    monkeypatch.setattr(supabase_admin, "get_settings", lambda: settings)
    return settings


COLLECTOR = {"full_name": "Obiora Ani", "email": "Obiora@Example.com", "phone": "0803 555 0101", "area": "Emene",
             "password": "first-password-123"}


@respx.mock
async def test_create_collector(client: AsyncClient, session: AsyncSession, admin, auth_admin) -> None:
    route = respx.post("https://testproject.supabase.co/auth/v1/admin/users").respond(
        200, json={"id": "6f1c3e1e-7a2b-4c1d-9e8f-0a1b2c3d4e5f"}
    )
    response = await client.post(f"{API}/collectors", json=COLLECTOR, headers=bearer(admin.id))
    assert response.status_code == 201
    body = response.json()
    assert (body["id"], body["role"], body["email"], body["phone"]) == (
        "6f1c3e1e-7a2b-4c1d-9e8f-0a1b2c3d4e5f", "COLLECTOR", "obiora@example.com", "+2348035550101")
    sent = route.calls[0].request
    assert sent.headers["Authorization"] == "Bearer service-key-for-tests"
    assert b'"email_confirm":true' in sent.read()
    assert "password" not in response.text

    taken = await client.post(f"{API}/collectors", json=COLLECTOR, headers=bearer(admin.id))
    assert taken.status_code == 409 and taken.json()["code"] == "PHONE_TAKEN"
    assert route.call_count == 1  # checked before creating a login


@respx.mock
async def test_create_collector_with_taken_email(client: AsyncClient, session: AsyncSession, admin, auth_admin) -> None:
    respx.post("https://testproject.supabase.co/auth/v1/admin/users").respond(
        422, json={"msg": "A user with this email address has already been registered"}
    )
    response = await client.post(f"{API}/collectors", json=COLLECTOR, headers=bearer(admin.id))
    assert response.status_code == 409 and response.json()["code"] == "EMAIL_TAKEN"
    assert (await session.exec(select(Profile).where(Profile.phone == "+2348035550101"))).first() is None


async def test_create_collector_validates_before_calling_supabase(client: AsyncClient, admin, auth_admin) -> None:
    with respx.mock(assert_all_called=False) as mock:
        route = mock.post("https://testproject.supabase.co/auth/v1/admin/users")
        bad = await client.post(f"{API}/collectors", json={**COLLECTOR, "phone": "12345", "area": "Lagos"},
                                headers=bearer(admin.id))
        short = await client.post(f"{API}/collectors", json={**COLLECTOR, "password": "short"}, headers=bearer(admin.id))
        assert not route.called
    assert bad.status_code == 422
    assert {e["field"] for e in bad.json()["details"]["errors"]} == {"phone", "area"}
    assert short.status_code == 422


async def test_withdrawal_queue_shows_the_customer(client: AsyncClient, session: AsyncSession, admin) -> None:
    user = await make_user(session, "Chinaza")
    session.add(Withdrawal(user_id=user.id, amount_kobo=100_000, status=WithdrawalStatus.PENDING, bank_name="GTB",
                           account_number="0123456789", account_name="CHINAZA", paystack_recipient_code="RCP_test"))
    await session.flush()
    queue = (await client.get(f"{API}/withdrawals?status=PENDING", headers=bearer(admin.id))).json()
    assert [(w["user_name"], w["account_number_last4"]) for w in queue] == [("Chinaza", "6789")]
