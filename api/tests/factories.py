"""Small helpers that insert valid rows for tests. Each flushes so the row gets its database defaults."""
from uuid import uuid4

from sqlmodel import Session

from app.models import AccountType, Pickup, Profile


def make_user(session: Session, name: str = "User") -> Profile:
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


def make_pickup(session: Session, user: Profile, area: str = "GRA") -> Pickup:
    pickup = Pickup(user_id=user.id, area=area)
    session.add(pickup)
    session.flush()
    return pickup
