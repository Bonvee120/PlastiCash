"""The seed data must itself follow the money rules, since the demo and later tests rely on it."""
from decimal import Decimal
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.areas import AREAS
from app.models import LedgerEntry, LedgerType, Material, Pickup, PickupItem, PickupStatus, Profile
from scripts.seed import PEOPLE, seed


@pytest_asyncio.fixture
async def seeded(session: AsyncSession) -> dict[str, int]:
    return await seed(session, {key: uuid4() for key in PEOPLE})


async def balance(session: AsyncSession, phone: str) -> int:
    result = await session.exec(
        text("select balance_kobo from wallet_balances b join profiles p on p.id = b.user_id where p.phone = :ph")
        .bindparams(ph=phone)
    )
    return result.scalar_one()


async def test_row_counts(seeded: dict[str, int]) -> None:
    assert seeded == {
        "profiles": 8,
        "prices": 6,
        "pickups": 20,
        "pickup_items": 17,
        "ledger_entries": 11,
        "withdrawals": 3,
        "bales": 5,
    }


async def test_every_status_is_present(session: AsyncSession, seeded) -> None:
    statuses = set((await session.exec(select(Pickup.status))).all())
    assert statuses == set(PickupStatus)
    assert (await session.exec(select(Pickup).where(Pickup.under_minimum))).all()
    assert (await session.exec(select(Pickup).where(Pickup.pooled, Pickup.status == PickupStatus.REQUESTED))).all()


async def test_balances_match_hand_calculation(session: AsyncSession, seeded) -> None:
    phone = {key: person[6] for key, person in PEOPLE.items()}
    # chinaza: 51.20 kg PET at the old ₦170 + 18.50 kg PET at ₦185 + 4.20 kg cans at ₦400 - ₦5,000 paid out
    assert await balance(session, phone["chinaza"]) == 870_400 + 342_250 + 168_000 - 500_000
    # emeka: failed withdrawal is held and reversed, so it nets to zero
    assert await balance(session, phone["emeka"]) == 1_572_500 + 140_000 + 1_694_000 + 240_000
    # greenhills: pending withdrawal is held
    assert await balance(session, phone["greenhills"]) == 2_590_000 + 1_260_000 - 2_000_000
    assert await balance(session, phone["coalcity"]) == 3_885_000 + 1_020_000 + 200_000
    assert await balance(session, phone["ngozi"]) == 605_875
    for key in ("admin", "ifeanyi", "amaka"):
        assert await balance(session, phone[key]) == 0


async def test_each_completed_pickup_is_credited_once_with_its_total(session: AsyncSession, seeded) -> None:
    completed = (await session.exec(select(Pickup).where(Pickup.status == PickupStatus.COMPLETED))).all()
    credits = (await session.exec(select(LedgerEntry).where(LedgerEntry.type == LedgerType.PICKUP_CREDIT))).all()
    assert sorted(c.pickup_id for c in credits) == sorted(p.id for p in completed)
    by_pickup = {c.pickup_id: c.amount_kobo for c in credits}
    for pickup in completed:
        assert by_pickup[pickup.id] == pickup.total_amount_kobo


async def test_items_add_up_and_keep_their_price_snapshot(session: AsyncSession, seeded) -> None:
    for pickup in (await session.exec(select(Pickup).where(Pickup.total_net_kg.is_not(None)))).all():
        items = (await session.exec(select(PickupItem).where(PickupItem.pickup_id == pickup.id))).all()
        assert sum(i.net_kg for i in items) == pickup.total_net_kg
        assert sum(i.amount_kobo for i in items) == pickup.total_amount_kobo
    snapshots = (
        await session.exec(select(PickupItem.price_kobo_per_kg).where(PickupItem.material == Material.PET))
    ).all()
    assert 17_000 in snapshots  # the old PET version, kept on the old pickup
    current_pet = (
        await session.exec(text("select price_kobo_per_kg from current_prices where material = 'PET'"))
    ).scalar_one()
    assert current_pet == 18_500


async def test_raw_stock_is_never_negative(session: AsyncSession, seeded) -> None:
    stock = dict((await session.exec(text("select material::text, kg_in_store from raw_stock"))).all())
    assert all(kg >= 0 for kg in stock.values())
    assert stock["PET"] == Decimal("167.45")


async def test_people_use_known_areas(session: AsyncSession, seeded) -> None:
    assert {p.area for p in (await session.exec(select(Profile))).all()} <= set(AREAS)
