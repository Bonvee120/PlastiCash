"""Steps 4.1-4.3: ledger, pickup state machine, price snapshot. Required tests 1 and 6 (docs/specs/04)."""
import asyncio
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import ConfirmedVia, LedgerEntry, LedgerType, Material, Pickup, PickupStatus, Role
from app.services import ledger, pricing
from app.services.pickup_state import transition
from tests.factories import make_pickup, make_price, make_user, make_weighed_pickup

S = PickupStatus


async def credits_for(session: AsyncSession, pickup: Pickup) -> int:
    query = select(func.count()).where(LedgerEntry.pickup_id == pickup.id, LedgerEntry.type == LedgerType.PICKUP_CREDIT)
    return (await session.exec(query)).one()


@pytest.fixture
async def people(session: AsyncSession):
    await make_price(session, Material.PET, 185)
    await make_price(session, Material.CAN, 400)
    owner = await make_user(session, "Chinaza")
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    return owner, collector, admin


# ----- 4.1 ledger -----


async def test_balance_is_the_sum_of_entries(session: AsyncSession, people) -> None:
    owner, _, admin = people
    assert await ledger.balance_kobo(session, owner.id) == 0
    await ledger.add_adjustment(session, owner.id, 50_000, "Goodwill credit", admin.id)
    await ledger.add_adjustment(session, owner.id, -12_500, "Correction", admin.id)
    assert await ledger.balance_kobo(session, owner.id) == 37_500


async def test_credit_pickup_twice_is_a_no_op(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_weighed_pickup(session, owner, collector)
    pickup.status = S.COMPLETED
    assert await ledger.credit_pickup(session, pickup) is True
    assert await ledger.credit_pickup(session, pickup) is False
    assert await credits_for(session, pickup) == 1
    assert await ledger.balance_kobo(session, owner.id) == pickup.total_amount_kobo == 20 * 18_500


@pytest.mark.parametrize("statement", ["update ledger_entries set amount_kobo = 1", "delete from ledger_entries"])
async def test_ledger_rows_cannot_be_changed(session: AsyncSession, people, statement: str) -> None:
    owner, _, admin = people
    await ledger.add_adjustment(session, owner.id, 1_000, "Test", admin.id)
    with pytest.raises(DBAPIError, match="insert-only"):
        async with session.begin_nested():
            await session.exec(text(statement))


async def test_prices_cannot_be_edited(session: AsyncSession, people) -> None:
    with pytest.raises(DBAPIError, match="insert-only"):
        async with session.begin_nested():
            await session.exec(text("update prices set price_kobo_per_kg = 1"))


# ----- 4.2 state machine -----


async def test_1_confirming_the_same_pickup_twice_credits_once(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_weighed_pickup(session, owner, collector)
    done = await transition(session, pickup.id, S.COMPLETED, owner)
    assert done.confirmed_via == ConfirmedVia.APP
    with pytest.raises(ApiError) as second:
        await transition(session, pickup.id, S.COMPLETED, collector)  # e.g. the OTP arrives too
    assert second.value.status_code == 409
    assert await credits_for(session, pickup) == 1
    assert await ledger.balance_kobo(session, owner.id) == 370_000


async def test_1_two_simultaneous_confirmations_credit_once(committed: AsyncEngine) -> None:
    """App confirm and OTP confirm at the same moment, on two connections: the row lock lets one through."""
    async with AsyncSession(committed, expire_on_commit=False) as setup:
        await make_price(setup, Material.PET, 185)
        owner = await make_user(setup, "Chinaza")
        collector = await make_user(setup, "Ifeanyi", role=Role.COLLECTOR)
        pickup = await make_weighed_pickup(setup, owner, collector)
        await setup.commit()

    async def confirm(by):
        async with AsyncSession(committed) as s:
            try:
                await transition(s, pickup.id, S.COMPLETED, by)
                await s.commit()
                return "ok"
            except ApiError as error:
                return error.status_code

    results = await asyncio.gather(confirm(owner), confirm(collector))
    assert sorted(results, key=str) == [409, "ok"]
    async with AsyncSession(committed) as check:
        assert await credits_for(check, pickup) == 1
        assert await ledger.balance_kobo(check, owner.id) == 370_000


async def test_happy_path_from_request_to_paid(session: AsyncSession, people) -> None:
    owner, collector, admin = people
    pickup = await make_pickup(session, owner)
    await transition(session, pickup.id, S.ASSIGNED, admin, collector_id=collector.id)
    await transition(session, pickup.id, S.EN_ROUTE, collector)
    pickup.qr_scanned_at = datetime.now(timezone.utc)
    pickup.collector_lat, pickup.collector_lng = Decimal("6.45"), Decimal("7.51")
    item = await pricing.priced_item(session, pickup.id, Material.CAN, Decimal("4.20"))
    session.add(item)
    pricing.apply_totals(pickup, [item], door_min_kg=50)
    weighed = await transition(session, pickup.id, S.AWAITING_CONFIRMATION, collector)
    assert weighed.collector_lat is None and weighed.weighed_at is not None  # location cleared at weighing
    assert weighed.under_minimum is True
    paid = await transition(session, pickup.id, S.COMPLETED, collector)
    assert paid.confirmed_via == ConfirmedVia.OTP
    assert await ledger.balance_kobo(session, owner.id) == 168_000


@pytest.mark.parametrize(
    "start, to, who",
    [
        (S.CANCELLED, S.COMPLETED, "owner"),
        (S.COMPLETED, S.DISPUTED, "owner"),
        (S.REQUESTED, S.COMPLETED, "admin"),
        (S.REQUESTED, S.EN_ROUTE, "collector"),
        (S.AWAITING_CONFIRMATION, S.CANCELLED, "admin"),
    ],
)
async def test_illegal_transitions_are_409(session: AsyncSession, people, start, to, who) -> None:
    owner, collector, admin = people
    pickup = await make_weighed_pickup(session, owner, collector)
    pickup.status = start
    await session.flush()
    with pytest.raises(ApiError) as error:
        await transition(session, pickup.id, to, {"owner": owner, "collector": collector, "admin": admin}[who])
    assert (error.value.status_code, error.value.code) == (409, "ILLEGAL_TRANSITION")


async def test_weighing_needs_the_qr_scan(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_weighed_pickup(session, owner, collector)
    pickup.status, pickup.qr_scanned_at = S.EN_ROUTE, None
    await session.flush()
    with pytest.raises(ApiError) as error:
        await transition(session, pickup.id, S.AWAITING_CONFIRMATION, collector)
    assert error.value.status_code == 409
    assert "QR" in error.value.message


async def test_wrong_person_gets_403(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    other_user = await make_user(session, "Ngozi")
    other_collector = await make_user(session, "Amaka", role=Role.COLLECTOR)
    pickup = await make_weighed_pickup(session, owner, collector)
    for stranger in (other_user, other_collector):
        with pytest.raises(ApiError) as error:
            await transition(session, pickup.id, S.COMPLETED, stranger)
        assert error.value.status_code == 403
    assert await credits_for(session, pickup) == 0


async def test_system_auto_confirm_is_marked_auto(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_weighed_pickup(session, owner, collector)
    done = await transition(session, pickup.id, S.COMPLETED, None)
    assert done.confirmed_via == ConfirmedVia.AUTO


# ----- 4.3 price snapshot -----


async def test_6_a_later_price_change_does_not_change_a_weighed_pickup(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_weighed_pickup(session, owner, collector, [(Material.PET, "10.00")])
    assert pickup.total_amount_kobo == 185_000
    await make_price(session, Material.PET, 250)  # the admin raises PET after weighing
    assert (await pricing.current_price(session, Material.PET)).price_kobo_per_kg == 25_000
    await transition(session, pickup.id, S.COMPLETED, owner)
    assert await ledger.balance_kobo(session, owner.id) == 185_000


def test_amounts_round_half_up_to_the_kobo() -> None:
    assert pricing.item_amount_kobo(Decimal("0.01"), 50) == 1  # 0.5 kobo -> 1
    assert pricing.item_amount_kobo(Decimal("0.03"), 50) == 2  # 1.5 kobo -> 2
    assert pricing.item_amount_kobo(Decimal("32.75"), 18_500) == 605_875


async def test_12_deduction_greater_than_gross_is_rejected(session: AsyncSession, people) -> None:
    owner, collector, _ = people
    pickup = await make_pickup(session, owner)
    with pytest.raises(ApiError) as error:
        await pricing.priced_item(session, pickup.id, Material.PET, Decimal("5"), Decimal("6"), "wet")
    assert error.value.code == "DEDUCTION_TOO_LARGE"
