"""Reminders and auto-confirm for weighed pickups (docs/specs/02-api.md `/jobs/reminders`, TRD §5.8).

Called every 15 minutes. For each AWAITING_CONFIRMATION pickup, in its own locked transaction:
- 48 h after weighing: COMPLETED with confirmed_via=AUTO, credited once (through pickup_state.transition);
- otherwise a reminder SMS when it passes 2 h, 12 h and 24 h (`reminders_sent` 0-3). A job that was down catches up
  with one SMS, not several.
The row lock makes overlapping runs safe: the second run sees the first one's changes. The counter is saved before the
SMS goes out, so a crash can lose a reminder but never send one twice."""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Pickup, PickupStatus, Profile
from app.pickup_schemas import AUTO_CONFIRM_AFTER
from app.schemas import points
from app.services import otp, termii
from app.services.pickup_state import lock_pickup, transition

log = logging.getLogger(__name__)

REMIND_AFTER = (timedelta(hours=2), timedelta(hours=12), timedelta(hours=24))
LAGOS = timezone(timedelta(hours=1))


@dataclass
class RunResult:
    checked: int = 0
    reminders: int = 0
    auto_confirmed: int = 0
    failed: list[str] = field(default_factory=list)


def reminders_due(weighed_at: datetime, now: datetime) -> int:
    """How many of the 2/12/24 h marks have passed."""
    return sum(1 for after in REMIND_AFTER if now >= weighed_at + after)


def reminder_sms(pickup: Pickup) -> str:
    pts = points(pickup.total_amount_kobo or 0)
    deadline = (pickup.weighed_at + AUTO_CONFIRM_AFTER).astimezone(LAGOS)
    return (
        f"PlastiCash: please check your pickup: {pickup.total_net_kg} kg = {pts:,} pts (₦{pts:,}). "
        f"Confirm or dispute in the app. If we don't hear from you, it confirms by itself on "
        f"{deadline:%d %b at %H:%M}."
    )


async def _one(session: AsyncSession, pickup_id: UUID, now: datetime, result: RunResult) -> str | None:
    """Handle one pickup inside the caller's transaction. Returns an SMS to send after commit, as (phone, text)."""
    pickup = await lock_pickup(session, pickup_id)
    if pickup.status != PickupStatus.AWAITING_CONFIRMATION or pickup.weighed_at is None:
        return None  # confirmed, disputed or handled by an overlapping run meanwhile
    if now >= pickup.weighed_at + AUTO_CONFIRM_AFTER:
        otp.clear(pickup)
        await transition(session, pickup.id, PickupStatus.COMPLETED, None)
        result.auto_confirmed += 1
        return None
    due = reminders_due(pickup.weighed_at, now)
    if due <= pickup.reminders_sent:
        return None
    pickup.reminders_sent = due
    session.add(pickup)
    result.reminders += 1
    return reminder_sms(pickup)


async def run(session: AsyncSession, now: datetime | None = None) -> RunResult:
    now = now or datetime.now(timezone.utc)
    result = RunResult()
    candidates = (
        await session.exec(
            select(Pickup.id, Pickup.user_id).where(
                Pickup.status == PickupStatus.AWAITING_CONFIRMATION,
                Pickup.weighed_at <= now - REMIND_AFTER[0],
            )
        )
    ).all()
    await session.commit()  # end the read transaction; each pickup gets its own below
    for pickup_id, user_id in candidates:
        result.checked += 1
        try:
            message = await _one(session, pickup_id, now, result)
            await session.commit()
        except Exception:  # one bad row must not stop the others
            await session.rollback()
            log.exception("reminders job failed for pickup %s", pickup_id)
            result.failed.append(str(pickup_id))
            continue
        if message:
            customer = await session.get(Profile, user_id)
            await termii.send_sms(customer.phone, message)
    return result
