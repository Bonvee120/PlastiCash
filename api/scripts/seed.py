"""Demo data: 8 people, price versions, 20 pickups across every status, ledger, withdrawals and bales.

Usage (from api/):
    python -m scripts.seed --test     # docker compose db-test; no Supabase Auth accounts
    python -m scripts.seed            # DATABASE_URL (Supabase); needs SUPABASE_URL,
                                      # SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD in api/.env

On Supabase every seeded person also gets a Supabase Auth account (email confirmed) so they can log in;
profiles.id = auth.users.id. The script refuses to run on a database that already has profiles.

Money follows the app rules: amounts are integer kobo, item amount = round_half_up(net_kg x price snapshot),
and every COMPLETED pickup has exactly one PICKUP_CREDIT.
"""
import argparse
import asyncio
import sys
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid4

import httpx
from sqlalchemy import func
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.models import (
    AccountType,
    Bale,
    BaleStatus,
    ConfirmedVia,
    LedgerEntry,
    LedgerType,
    Material,
    Pickup,
    PickupChannel,
    PickupItem,
    PickupStatus,
    Price,
    Profile,
    Role,
    Withdrawal,
    WithdrawalStatus,
)

NOW = datetime.now(timezone.utc).replace(microsecond=0)
DEMO_PHOTO = "https://res.cloudinary.com/demo/image/upload/sample.jpg"
HUB_ADDRESS = "EcoCyclers Hub (hub collector)"

# key: (role, account_type, full_name, org_name, org_type, area, phone)
PEOPLE = {
    "admin": (Role.ADMIN, None, "Kenechukwu Admin", None, None, "GRA", "+2348030000001"),
    "ifeanyi": (Role.COLLECTOR, None, "Ifeanyi Eze", None, None, "New Haven", "+2348030000002"),
    "amaka": (Role.COLLECTOR, None, "Amaka Obi", None, None, "Ogui", "+2348030000003"),
    "chinaza": (Role.USER, AccountType.INDIVIDUAL, "Chinaza Okafor", None, None, "Independence Layout", "+2348030000004"),
    "emeka": (Role.USER, AccountType.INDIVIDUAL, "Emeka Nwosu", None, None, "Coal Camp", "+2348030000005"),
    "ngozi": (Role.USER, AccountType.INDIVIDUAL, "Ngozi Eze", None, None, "Trans-Ekulu", "+2348030000006"),
    "greenhills": (Role.USER, AccountType.ORGANIZATION, "Mrs Adaeze Udeh", "Green Hills School", "school", "GRA", "+2348030000007"),
    "coalcity": (Role.USER, AccountType.ORGANIZATION, "Obinna Okeke", "Coal City Foods Ltd", "company", "Emene", "+2348030000008"),
}

# Placeholders: kg_per_full_sack and items_per_kg are TODO until EcoCyclers weighs its own standard sacks.
# CO2 factors: US EPA WARM v16, see RESEARCH.md (SACHET uses the Mixed Plastics proxy, an estimate).
# (price ₦/kg, kg per full sack, items per kg, kg CO2e saved per kg)
PRICES = {
    Material.PET: (185, "10.00", 40, "1.146"),
    Material.PLASTIC: (280, "12.00", None, "1.025"),
    Material.SACHET: (50, "8.00", None, "1.025"),
    Material.CAN: (400, "6.00", 65, "10.064"),
    Material.TIN: (200, "15.00", None, "2.017"),
}
OLD_PET_PRICE = 170  # an earlier PET version, to show that old pickups keep their price snapshot


def kobo_per_kg(naira: int) -> int:
    return naira * 100


def amount_kobo(net_kg: Decimal, price_kobo_per_kg: int) -> int:
    return int((net_kg * price_kobo_per_kg).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def ago(days: float = 0, hours: float = 0) -> datetime:
    return NOW - timedelta(days=days, hours=hours)


async def seed(session: AsyncSession, user_ids: dict[str, UUID]) -> dict[str, int]:
    """Insert all demo rows in the caller's transaction. Returns row counts."""
    # ----- people -----
    people: dict[str, Profile] = {}
    for key, (role, account_type, full_name, org_name, org_type, area, phone) in PEOPLE.items():
        people[key] = Profile(
            id=user_ids[key],
            role=role,
            account_type=account_type,
            full_name=full_name,
            org_name=org_name,
            org_type=org_type,
            phone=phone,
            email=f"{key}@example.com",
            area=area,
            address=HUB_ADDRESS if key == "amaka" else f"{area}, Enugu",
            verified_picker=key == "emeka",
            created_at=ago(days=60),
        )
    for key, bank in {
        "chinaza": ("Guaranty Trust Bank", "058", "0123456789", "CHINAZA OKAFOR"),
        "emeka": ("Access Bank", "044", "0234567890", "EMEKA NWOSU"),
        "greenhills": ("First Bank of Nigeria", "011", "0345678901", "GREEN HILLS SCHOOL"),
    }.items():
        p = people[key]
        p.bank_name, p.bank_code, p.account_number, p.account_name = bank
        p.paystack_recipient_code = f"RCP_seed_{key}"
    session.add_all(people.values())
    await session.flush()
    admin, ifeanyi, amaka = people["admin"], people["ifeanyi"], people["amaka"]

    # ----- prices (versioned) -----
    prices: dict[Material, Price] = {}
    old_pet = Price(
        material=Material.PET,
        price_kobo_per_kg=kobo_per_kg(OLD_PET_PRICE),
        kg_per_full_sack=Decimal(PRICES[Material.PET][1]),
        items_per_kg=PRICES[Material.PET][2],
        co2_kg_saved_per_kg=Decimal(PRICES[Material.PET][3]),
        effective_from=ago(days=60),
        set_by=admin.id,
    )
    session.add(old_pet)
    for material, (naira, sack, items, co2) in PRICES.items():
        prices[material] = Price(
            material=material,
            price_kobo_per_kg=kobo_per_kg(naira),
            kg_per_full_sack=Decimal(sack),
            items_per_kg=items,
            co2_kg_saved_per_kg=Decimal(co2),
            effective_from=ago(days=30),
            set_by=admin.id,
        )
    session.add_all(prices.values())
    await session.flush()

    # ----- pickups -----
    pickups: list[Pickup] = []

    async def add_pickup(
        user: str,
        status: PickupStatus,
        days: float,
        *,
        channel: PickupChannel = PickupChannel.DOOR,
        collector: Profile | None = None,
        items: list[tuple] = (),
        price_for: Callable[[Material], Price] = lambda m: prices[m],
        sacks: str | None = None,
        **fields,
    ) -> Pickup:
        owner = people[user]
        pickup = Pickup(
            id=uuid4(),
            user_id=owner.id,
            collector_id=collector.id if collector else None,
            channel=channel,
            status=status,
            area=owner.area,
            address=None if channel == PickupChannel.HUB else owner.address,
            created_at=ago(days=days),
            updated_at=ago(days=days),
            **fields,
        )
        if channel == PickupChannel.DOOR:
            pickup.lat, pickup.lng = Decimal("6.458400"), Decimal("7.546400")
            pickup.preferred_window = "MORNING"
            pickup.preferred_date = (ago(days=days) + timedelta(days=2)).date()
            pickup.request_photo_url = DEMO_PHOTO
        if sacks:
            pickup.estimate_sacks = Decimal(sacks)
            pickup.estimated_kg = (Decimal(sacks) * prices[Material.PET].kg_per_full_sack).quantize(Decimal("0.01"))

        # Items and totals first: the database refuses a COMPLETED pickup without total_amount_kobo.
        rows: list[PickupItem] = []
        if items:
            pickup.weighed_at = pickup.qr_scanned_at = ago(days=days, hours=-3)
            pickup.weigh_photo_url = DEMO_PHOTO
            total_kg, total_kobo = Decimal("0"), 0
            for material, gross, *deduction in items:
                gross = Decimal(gross)
                ded = Decimal(deduction[0]) if deduction else Decimal("0")
                net = gross - ded
                price = price_for(material)
                amount = amount_kobo(net, price.price_kobo_per_kg)
                rows.append(
                    PickupItem(
                        pickup_id=pickup.id,
                        material=material,
                        gross_kg=gross,
                        deduction_kg=ded,
                        deduction_reason=deduction[1] if deduction else None,
                        net_kg=net,
                        price_kobo_per_kg=price.price_kobo_per_kg,
                        price_id=price.id,
                        amount_kobo=amount,
                    )
                )
                total_kg += net
                total_kobo += amount
            pickup.total_net_kg, pickup.total_amount_kobo = total_kg, total_kobo
            pickup.under_minimum = channel == PickupChannel.DOOR and total_kg < 50

        session.add(pickup)
        await session.flush()
        session.add_all(rows)

        if status == PickupStatus.COMPLETED:
            pickup.confirmed_at = ago(days=days, hours=-5)
            session.add(
                LedgerEntry(
                    user_id=owner.id,
                    type=LedgerType.PICKUP_CREDIT,
                    amount_kobo=pickup.total_amount_kobo,
                    pickup_id=pickup.id,
                    created_at=pickup.confirmed_at,
                )
            )
        await session.flush()
        pickups.append(pickup)
        return pickup

    P, S = PickupStatus, PickupChannel
    PET, PLASTIC, SACHET, CAN, TIN = Material.PET, Material.PLASTIC, Material.SACHET, Material.CAN, Material.TIN

    # COMPLETED (7): door and hub, one at the old PET price, one under the 50 kg minimum
    await add_pickup("chinaza", P.COMPLETED, 40, collector=ifeanyi, sacks="5.5", confirmed_via=ConfirmedVia.APP,
               items=[(PET, "52.40", "1.20", "Wet bottles")], price_for=lambda m: old_pet)
    await add_pickup("chinaza", P.COMPLETED, 10, channel=S.HUB, collector=amaka, confirmed_via=ConfirmedVia.APP,
               items=[(PET, "18.50"), (CAN, "4.20")])
    await add_pickup("emeka", P.COMPLETED, 12, channel=S.HUB, collector=amaka, confirmed_via=ConfirmedVia.OTP,
               items=[(PET, "85.00"), (SACHET, "30.00", "2.00", "Sand and water in sachets")])
    await add_pickup("emeka", P.COMPLETED, 5, channel=S.HUB, collector=amaka, confirmed_via=ConfirmedVia.OTP,
               items=[(PLASTIC, "60.50"), (TIN, "12.00")])
    await add_pickup("greenhills", P.COMPLETED, 20, collector=ifeanyi, sacks="18", confirmed_via=ConfirmedVia.APP,
               scheduled_date=ago(days=19).date(), items=[(PET, "140.00"), (PLASTIC, "45.00")])
    await add_pickup("coalcity", P.COMPLETED, 15, collector=ifeanyi, sacks="27", confirmed_via=ConfirmedVia.AUTO,
               scheduled_date=ago(days=14).date(), reminders_sent=3, last_reminder_at=ago(days=13),
               items=[(PET, "210.00"), (CAN, "25.50"), (SACHET, "40.00")])
    await add_pickup("ngozi", P.COMPLETED, 8, collector=ifeanyi, sacks="3", pooled=True, confirmed_via=ConfirmedVia.APP,
               scheduled_date=ago(days=7).date(), items=[(PET, "32.75")])

    # DISPUTED (1)
    await add_pickup("ngozi", P.DISPUTED, 3, collector=ifeanyi, sacks="6", scheduled_date=ago(days=2).date(),
               items=[(PET, "55.00")], dispute_photo_url=DEMO_PHOTO, dispute_claimed_kg=Decimal("60.00"),
               dispute_reason="I weighed 6 full sacks at home before pickup", disputed_at=ago(days=2))

    # AWAITING_CONFIRMATION (2)
    await add_pickup("chinaza", P.AWAITING_CONFIRMATION, 1, collector=ifeanyi, sacks="5.5",
               scheduled_date=ago(days=0).date(), reminders_sent=1, last_reminder_at=ago(hours=20),
               items=[(PET, "50.50"), (PLASTIC, "6.00")])
    await add_pickup("greenhills", P.AWAITING_CONFIRMATION, 0.2, collector=ifeanyi, sacks="10",
               scheduled_date=ago(days=0).date(), items=[(PET, "95.00")])

    # EN_ROUTE (1): collector location stored only while EN_ROUTE
    await add_pickup("coalcity", P.EN_ROUTE, 2, collector=ifeanyi, sacks="20", scheduled_date=NOW.date(),
               collector_lat=Decimal("6.452100"), collector_lng=Decimal("7.510500"), collector_location_at=ago(hours=0.05))

    # ASSIGNED (3)
    tomorrow = (NOW + timedelta(days=1)).date()
    await add_pickup("greenhills", P.ASSIGNED, 1, collector=ifeanyi, sacks="12", scheduled_date=tomorrow)
    await add_pickup("coalcity", P.ASSIGNED, 1, collector=ifeanyi, sacks="25", scheduled_date=tomorrow)
    await add_pickup("chinaza", P.ASSIGNED, 2, collector=ifeanyi, sacks="5", scheduled_date=tomorrow)

    # REQUESTED (4): one pooled under-50 kg request
    await add_pickup("chinaza", P.REQUESTED, 0.5, sacks="2", pooled=True, estimate_note="2 rice sacks of bottles")
    await add_pickup("ngozi", P.REQUESTED, 0.3, sacks="6")
    await add_pickup("greenhills", P.REQUESTED, 0.2, sacks="12")
    await add_pickup("coalcity", P.REQUESTED, 0.1, sacks="20")

    # CANCELLED (2)
    await add_pickup("ngozi", P.CANCELLED, 25, sacks="5", cancelled_reason="Changed my mind")
    await add_pickup("chinaza", P.CANCELLED, 18, sacks="5", cancelled_reason="Duplicate request")

    # ----- withdrawals: PAID, PENDING, FAILED (with reversal) -----
    async def add_withdrawal(user: str, naira: int, status: WithdrawalStatus, days: float, **fields) -> Withdrawal:
        owner = people[user]
        w = Withdrawal(
            user_id=owner.id,
            amount_kobo=naira * 100,
            status=status,
            bank_name=owner.bank_name,
            account_number=owner.account_number,
            account_name=owner.account_name,
            paystack_recipient_code=owner.paystack_recipient_code,
            created_at=ago(days=days),
            updated_at=ago(days=days),
            **fields,
        )
        session.add(w)
        await session.flush()
        session.add(LedgerEntry(user_id=owner.id, type=LedgerType.WITHDRAWAL_HOLD, amount_kobo=-w.amount_kobo,
                                withdrawal_id=w.id, created_at=w.created_at))
        if status == WithdrawalStatus.FAILED:
            session.add(LedgerEntry(user_id=owner.id, type=LedgerType.WITHDRAWAL_REVERSAL, amount_kobo=w.amount_kobo,
                                    withdrawal_id=w.id, created_at=ago(days=days - 1)))
        await session.flush()
        return w

    await add_withdrawal("chinaza", 5_000, WithdrawalStatus.PAID, 9, reviewed_by=admin.id, reviewed_at=ago(days=8.9),
                   paystack_transfer_code="TRF_seed_paid", paid_at=ago(days=8.8))
    await add_withdrawal("greenhills", 20_000, WithdrawalStatus.PENDING, 1)
    await add_withdrawal("emeka", 3_000, WithdrawalStatus.FAILED, 4, reviewed_by=admin.id, reviewed_at=ago(days=3.9),
                   paystack_transfer_code="TRF_seed_failed", failure_reason="Could not resolve account (Paystack test)")

    # ----- bales (total per material stays under raw stock) -----
    for code, material, kg, status, extra in [
        ("PET-2026-0001", PET, "150.00", BaleStatus.SOLD,
         dict(processed_at=ago(days=10), sold_at=ago(days=6), buyer="Export buyer (demo)", sale_price_kobo=5_250_000)),
        ("PET-2026-0002", PET, "120.00", BaleStatus.PROCESSED, dict(processed_at=ago(days=3))),
        ("PET-2026-0003", PET, "100.00", BaleStatus.IN_STORE, {}),
        ("PLASTIC-2026-0001", PLASTIC, "80.00", BaleStatus.IN_STORE, {}),
        ("SACHET-2026-0001", SACHET, "50.00", BaleStatus.SOLD,
         dict(processed_at=ago(days=5), sold_at=ago(days=2), buyer="Local pelletiser (demo)", sale_price_kobo=600_000)),
    ]:
        session.add(Bale(code=code, material=material, weight_kg=Decimal(kg), status=status, created_by=admin.id,
                         created_at=ago(days=12), **extra))
    await session.flush()

    return {
        table.__tablename__: (await session.exec(select(func.count()).select_from(table))).one()
        for table in (Profile, Price, Pickup, PickupItem, LedgerEntry, Withdrawal, Bale)
    }


# ----- Supabase Auth accounts -----


def create_auth_users(supabase_url: str, service_key: str, password: str) -> dict[str, UUID]:
    """Create (or find) a confirmed Supabase Auth user per person. Returns key -> auth user id."""
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    ids: dict[str, UUID] = {}
    with httpx.Client(base_url=f"{supabase_url}/auth/v1", headers=headers, timeout=20) as client:
        existing = {
            u["email"]: UUID(u["id"])
            for u in client.get("/admin/users", params={"per_page": 1000}).raise_for_status().json()["users"]
        }
        for key, person in PEOPLE.items():
            email = f"{key}@example.com"
            if email in existing:
                ids[key] = existing[email]
                continue
            response = client.post(
                "/admin/users",
                json={"email": email, "password": password, "email_confirm": True,
                      "user_metadata": {"full_name": person[2]}},
            )
            response.raise_for_status()
            ids[key] = UUID(response.json()["id"])
    return ids


async def count_profiles(url: str) -> int:
    engine = create_async_engine(url)
    try:
        async with AsyncSession(engine) as session:
            return (await session.exec(select(func.count()).select_from(Profile))).one()
    finally:
        await engine.dispose()


async def seed_database(url: str, user_ids: dict[str, UUID]) -> dict[str, int]:
    engine = create_async_engine(url)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            counts = await seed(session, user_ids)
            await session.commit()
            return counts
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--test", action="store_true", help="seed TEST_DATABASE_URL without Supabase Auth")
    args = parser.parse_args()
    settings = get_settings()

    if args.test:
        url = settings.test_database_url
        user_ids = {key: uuid4() for key in PEOPLE}
    else:
        password = settings.seed_password
        missing = [name for name, value in [
            ("DATABASE_URL", settings.database_url),
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key),
            ("SEED_PASSWORD (12+ characters)", password if len(password) >= 12 else ""),
        ] if not value]
        if missing:
            sys.exit("Missing: " + ", ".join(missing))
        url = settings.database_url

    if asyncio.run(count_profiles(url)):
        sys.exit("profiles is not empty; refusing to seed. Seed only a fresh database.")
    if not args.test:
        user_ids = create_auth_users(settings.supabase_url, settings.supabase_service_role_key, password)
    counts = asyncio.run(seed_database(url, user_ids))

    print("Seeded:", ", ".join(f"{table} {n}" for table, n in counts.items()))
    print("Logins: <key>@example.com, e.g. admin@, ifeanyi@ (collector), chinaza@, greenhills@ (organization)")


if __name__ == "__main__":
    main()
