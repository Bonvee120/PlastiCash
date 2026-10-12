"""Small helpers that insert valid rows for tests. Each flushes so the row gets its database defaults."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import AccountType, Material, Pickup, PickupStatus, Price, Profile, Role
from app.services import pricing


async def make_user(
    session: AsyncSession, name: str = "User", role: Role = Role.USER, is_active: bool = True
) -> Profile:
    user = Profile(
        id=uuid4(),
        role=role,
        account_type=AccountType.INDIVIDUAL if role == Role.USER else None,
        is_active=is_active,
        full_name=name,
        phone=f"+2348{uuid4().int % 10**9:09d}",
        email=f"{name.lower()}@example.com",
    )
    session.add(user)
    await session.flush()
    return user


async def make_pickup(session: AsyncSession, user: Profile, area: str = "GRA") -> Pickup:
    pickup = Pickup(user_id=user.id, area=area)
    session.add(pickup)
    await session.flush()
    return pickup


async def make_price(session: AsyncSession, material: Material, naira: int, *, kg_per_full_sack: str = "10") -> Price:
    price = Price(
        material=material,
        price_kobo_per_kg=naira * 100,
        kg_per_full_sack=Decimal(kg_per_full_sack),
        effective_from=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    session.add(price)
    await session.flush()
    return price


async def make_weighed_pickup(
    session: AsyncSession, owner: Profile, collector: Profile, items: list[tuple[Material, str]] = ((Material.PET, "20.00"),)
) -> Pickup:
    """A pickup AWAITING_CONFIRMATION with priced items, as if the collector had just weighed it.
    Status is set directly: this is test setup, not a state change under test."""
    pickup = Pickup(
        user_id=owner.id,
        collector_id=collector.id,
        status=PickupStatus.AWAITING_CONFIRMATION,
        area="GRA",
        qr_scanned_at=datetime.now(timezone.utc),
        weighed_at=datetime.now(timezone.utc),
        total_amount_kobo=0,
    )
    session.add(pickup)
    await session.flush()
    priced = [await pricing.priced_item(session, pickup.id, material, Decimal(kg)) for material, kg in items]
    session.add_all(priced)
    pricing.apply_totals(pickup, priced, door_min_kg=50)
    session.add(pickup)
    await session.flush()
    return pickup
