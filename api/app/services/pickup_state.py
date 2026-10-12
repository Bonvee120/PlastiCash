"""Pickup state machine (docs/specs/04-money-rules-and-tests.md). The only place a pickup's status changes.

`transition()` locks the pickup row (SELECT ... FOR UPDATE) for the rest of the caller's transaction, checks that
the move is in the table below and that the caller may make it, applies the side effects, and on COMPLETED credits
the owner exactly once. Two requests racing on one pickup are serialised by the lock: the second sees the new status
and gets 409. The caller commits.
"""
import enum
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import ConfirmedVia, Pickup, PickupStatus, Profile, Role
from app.services import ledger

S = PickupStatus


class Actor(str, enum.Enum):
    ADMIN = "ADMIN"
    OWNER = "OWNER"  # the user who requested the pickup
    COLLECTOR = "COLLECTOR"  # the collector assigned to this pickup
    SYSTEM = "SYSTEM"  # the auto-confirm job


# (from, to) -> who may make the move
TRANSITIONS: dict[tuple[PickupStatus, PickupStatus], set[Actor]] = {
    (S.REQUESTED, S.ASSIGNED): {Actor.ADMIN},
    (S.REQUESTED, S.CANCELLED): {Actor.OWNER, Actor.ADMIN},
    (S.ASSIGNED, S.CANCELLED): {Actor.OWNER, Actor.ADMIN},
    (S.ASSIGNED, S.EN_ROUTE): {Actor.COLLECTOR},
    (S.EN_ROUTE, S.AWAITING_CONFIRMATION): {Actor.COLLECTOR},
    (S.AWAITING_CONFIRMATION, S.COMPLETED): {Actor.OWNER, Actor.COLLECTOR, Actor.SYSTEM},
    (S.AWAITING_CONFIRMATION, S.DISPUTED): {Actor.OWNER},
    (S.DISPUTED, S.COMPLETED): {Actor.ADMIN},
}
FINAL = {S.COMPLETED, S.CANCELLED}

# How a COMPLETED pickup was confirmed, by who confirmed it
CONFIRMED_VIA = {
    Actor.OWNER: ConfirmedVia.APP,
    Actor.COLLECTOR: ConfirmedVia.OTP,
    Actor.SYSTEM: ConfirmedVia.AUTO,
    Actor.ADMIN: ConfirmedVia.ADMIN,
}


class IllegalTransition(ApiError):
    def __init__(self, current: PickupStatus, target: PickupStatus, reason: str | None = None) -> None:
        super().__init__(
            409,
            "ILLEGAL_TRANSITION",
            reason or f"A pickup that is {current.value} can't become {target.value}.",
            {"from": current.value, "to": target.value},
        )


def actor_for(pickup: Pickup, profile: Profile | None) -> Actor | None:
    """Who the caller is for this pickup. None means they have no part in it."""
    if profile is None:
        return Actor.SYSTEM
    if profile.role == Role.ADMIN:
        return Actor.ADMIN
    if profile.role == Role.COLLECTOR and pickup.collector_id == profile.id:
        return Actor.COLLECTOR
    if profile.role == Role.USER and pickup.user_id == profile.id:
        return Actor.OWNER
    return None


async def lock_pickup(session: AsyncSession, pickup_id: UUID) -> Pickup:
    pickup = (await session.exec(select(Pickup).where(Pickup.id == pickup_id).with_for_update())).first()
    if pickup is None:
        raise ApiError(404, "NOT_FOUND", "Pickup not found.")
    # A row loaded earlier in this session may be stale; the lock guarantees we now read the committed state.
    await session.refresh(pickup)
    return pickup


async def transition(
    session: AsyncSession,
    pickup_id: UUID,
    to: PickupStatus,
    by: Profile | None,
    *,
    collector_id: UUID | None = None,
    scheduled_date: date | None = None,
    reason: str | None = None,
    dispute_photo_url: str | None = None,
    dispute_claimed_kg: Decimal | None = None,
) -> Pickup:
    """Move a pickup to `to`. `by` is the signed-in profile, or None for the system (auto-confirm job)."""
    pickup = await lock_pickup(session, pickup_id)
    current = pickup.status
    allowed = TRANSITIONS.get((current, to))
    if allowed is None:
        if current in FINAL:
            raise IllegalTransition(current, to, f"This pickup is already {current.value.lower()}.")
        raise IllegalTransition(current, to)

    actor = actor_for(pickup, by)
    if actor not in allowed:
        raise ApiError(403, "FORBIDDEN", "You can't make this change to this pickup.")

    now = datetime.now(timezone.utc)
    if to == S.ASSIGNED:
        if collector_id is None:
            raise ApiError(422, "VALIDATION_ERROR", "Choose a collector.")
        pickup.collector_id = collector_id
        pickup.scheduled_date = scheduled_date
    elif to == S.CANCELLED:
        pickup.cancelled_reason = reason
    elif to == S.AWAITING_CONFIRMATION:
        if pickup.qr_scanned_at is None:
            raise IllegalTransition(current, to, "Scan the customer's QR code before weighing.")
        if not pickup.total_amount_kobo:
            raise IllegalTransition(current, to, "Add the weighed items before finishing.")
        pickup.weighed_at = now
        # The collector's location is kept only while EN_ROUTE (CLAUDE.md rule 8).
        pickup.collector_lat = pickup.collector_lng = pickup.collector_location_at = None
    elif to == S.DISPUTED:
        if not reason:
            raise ApiError(422, "VALIDATION_ERROR", "Tell us what's wrong.")
        pickup.dispute_reason = reason
        pickup.dispute_photo_url = dispute_photo_url
        pickup.dispute_claimed_kg = dispute_claimed_kg
        pickup.disputed_at = now
    elif to == S.COMPLETED:
        if not pickup.total_amount_kobo:
            raise IllegalTransition(current, to, "This pickup has no weighed amount to pay.")
        pickup.confirmed_at = now
        pickup.confirmed_via = CONFIRMED_VIA[actor]
        if actor == Actor.ADMIN:
            pickup.resolved_by = by.id if by else None
            pickup.resolution_note = reason

    pickup.status = to
    pickup.updated_at = now
    session.add(pickup)
    await session.flush()

    if to == S.COMPLETED:
        await ledger.credit_pickup(session, pickup)
    return pickup
