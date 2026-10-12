"""Small helpers that insert valid rows for tests. Each flushes so the row gets its database defaults."""
from uuid import uuid4

from sqlmodel import Session

from app.models import AccountType, Pickup, Profile, Role


def make_user(session: Session, name: str = "User", role: Role = Role.USER, is_active: bool = True) -> Profile:
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
    session.flush()
    return user


def make_pickup(session: Session, user: Profile, area: str = "GRA") -> Pickup:
    pickup = Pickup(user_id=user.id, area=area)
    session.add(pickup)
    session.flush()
    return pickup
