"""Pickup flow (docs/specs/02 and 04): estimate, request, weigh, OTP, resolve. Status changes go through
services/pickup_state.py; this module prepares the data around them. Callers commit; SMS goes out after commit."""
import hmac
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.errors import ApiError
from app.models import Pickup, PickupChannel, PickupItem, PickupStatus, Profile, Role
from app.pickup_schemas import EstimateItemIn, EstimateLineOut, EstimateOut, PickupCreate, ResolveItemIn, WeighItemIn
from app.phone import normalize_ng_phone
from app.schemas import display_name, points
from app.services import cloudinary, otp, pricing
from app.services.pickup_state import Actor, actor_for, create_walk_in, lock_pickup, transition

S = PickupStatus
KG = Decimal("0.01")


def lagos_today() -> date:
    """Today's date in Enugu. Nigeria is UTC+1 all year (no daylight saving)."""
    return (datetime.now(timezone.utc) + timedelta(hours=1)).date()


# ----- Estimate (5.1) -----


async def estimate(session: AsyncSession, items: list[EstimateItemIn]) -> EstimateOut:
    """kg = sacks x kg_per_full_sack, or count / items_per_kg; points at today's prices; the 50 kg door check."""
    prices = await pricing.current_prices(session)
    lines: list[EstimateLineOut] = []
    for item in items:
        price = prices.get(item.material)
        if price is None:
            raise ApiError(409, "NO_PRICE", f"There is no price for {item.material.value} yet.")
        if item.sacks is not None:
            kg = item.sacks * price.kg_per_full_sack
        else:
            if not price.items_per_kg:
                raise ApiError(422, "VALIDATION_ERROR", f"Count {item.material.value} in sacks, not items.")
            kg = Decimal(item.item_count) / price.items_per_kg
        kg = kg.quantize(KG, rounding=ROUND_HALF_UP)
        amount = pricing.item_amount_kobo(kg, price.price_kobo_per_kg)
        lines.append(EstimateLineOut(material=item.material, kg=kg, amount_kobo=amount, points=points(amount)))
    total_kg = sum((line.kg for line in lines), Decimal("0"))
    amount = sum(line.amount_kobo for line in lines)
    minimum = get_settings().door_min_kg
    return EstimateOut(
        items=lines, total_kg=total_kg, amount_kobo=amount, points=points(amount), door_min_kg=minimum,
        meets_door_minimum=total_kg >= minimum, kg_to_minimum=max(Decimal(minimum) - total_kg, Decimal("0")),
    )


# ----- Requests (5.2) -----


def _estimate_note(body: PickupCreate, est: EstimateOut) -> str:
    parts = []
    for item, line in zip(body.items, est.items):
        measure = f"{item.sacks} sacks" if item.sacks is not None else f"{item.item_count} items"
        parts.append(f"{item.material.value}: {measure} (~{line.kg} kg)")
    summary = "; ".join(parts)
    return f"{summary}. {body.estimate_note.strip()}" if body.estimate_note and body.estimate_note.strip() else summary


async def create_request(session: AsyncSession, user: Profile, body: PickupCreate) -> Pickup:
    if body.preferred_date < lagos_today():
        raise ApiError(422, "VALIDATION_ERROR", "Choose today or a later day.")
    photo = cloudinary.check_photo_url(body.request_photo_url, "request_photo_url")
    est = await estimate(session, body.items)
    if not est.meets_door_minimum and not body.pool:
        raise ApiError(
            400, "BELOW_MINIMUM",
            f"Door pickup starts at {est.door_min_kg} kg. You have about {est.total_kg} kg.",
            {"estimated_kg": str(est.total_kg), "kg_to_minimum": str(est.kg_to_minimum), "suggestion": "HUB_OR_AREA_DAY"},
        )
    pickup = Pickup(
        user_id=user.id,
        channel=PickupChannel.DOOR,
        status=S.REQUESTED,
        area=body.area,
        address=body.address.strip(),
        lat=body.lat.quantize(Decimal("0.000001")),
        lng=body.lng.quantize(Decimal("0.000001")),
        preferred_date=body.preferred_date,
        preferred_window=body.preferred_window,
        pooled=not est.meets_door_minimum,
        estimate_sacks=sum((i.sacks for i in body.items if i.sacks is not None), Decimal("0")) or None,
        estimate_note=_estimate_note(body, est)[:500],
        estimated_kg=est.total_kg,
        request_photo_url=photo,
    )
    session.add(pickup)
    await session.flush()
    await session.refresh(pickup)
    return pickup


async def items_of(session: AsyncSession, pickup_id: UUID) -> list[PickupItem]:
    rows = await session.exec(select(PickupItem).where(PickupItem.pickup_id == pickup_id).order_by(PickupItem.material))
    return list(rows.all())


async def items_by_pickup(session: AsyncSession, pickup_ids: list[UUID]) -> dict[UUID, list[PickupItem]]:
    """Items for many pickups in one query (avoids one round trip per pickup in lists)."""
    out: dict[UUID, list[PickupItem]] = {pickup_id: [] for pickup_id in pickup_ids}
    if pickup_ids:
        rows = await session.exec(
            select(PickupItem).where(PickupItem.pickup_id.in_(pickup_ids)).order_by(PickupItem.material)
        )
        for item in rows.all():
            out[item.pickup_id].append(item)
    return out


async def names(session: AsyncSession, profile_ids: set[UUID | None]) -> dict[UUID, Profile]:
    """Profiles for many ids in one query."""
    ids = [i for i in profile_ids if i is not None]
    if not ids:
        return {}
    return {p.id: p for p in (await session.exec(select(Profile).where(Profile.id.in_(ids)))).all()}


async def first_name(session: AsyncSession, profile_id: UUID | None) -> str | None:
    if profile_id is None:
        return None
    profile = await session.get(Profile, profile_id)
    return display_name(profile) if profile else None


# ----- Collector: own pickups only (5.3-5.5) -----


async def collectors_pickup(session: AsyncSession, pickup_id: UUID, collector: Profile) -> Pickup:
    """Lock a pickup assigned to this collector. Someone else's pickup looks like it doesn't exist (404)."""
    pickup = await lock_pickup(session, pickup_id)
    if actor_for(pickup, collector) != Actor.COLLECTOR:
        raise ApiError(404, "NOT_FOUND", "Pickup not found.")
    return pickup


async def update_location(session: AsyncSession, pickup_id: UUID, collector: Profile, lat: Decimal, lng: Decimal) -> Pickup:
    pickup = await collectors_pickup(session, pickup_id, collector)
    if pickup.status != S.EN_ROUTE:
        raise ApiError(409, "NOT_EN_ROUTE", "Location is shared only while you're on the way.")
    pickup.collector_lat, pickup.collector_lng = lat.quantize(Decimal("0.000001")), lng.quantize(Decimal("0.000001"))
    pickup.collector_location_at = datetime.now(timezone.utc)
    session.add(pickup)
    return pickup


async def scan(session: AsyncSession, pickup_id: UUID, collector: Profile, qr_token: str) -> Pickup:
    pickup = await collectors_pickup(session, pickup_id, collector)
    if pickup.status != S.EN_ROUTE:
        raise ApiError(409, "NOT_EN_ROUTE", "Start the trip before scanning the code.")
    if not hmac.compare_digest(pickup.qr_token or "", qr_token.strip()):
        raise ApiError(422, "QR_MISMATCH", "This QR code belongs to another pickup.")
    pickup.qr_scanned_at = datetime.now(timezone.utc)
    session.add(pickup)
    return pickup


async def _priced_items(session: AsyncSession, pickup: Pickup, items: list[WeighItemIn]) -> list[PickupItem]:
    priced = [
        await pricing.priced_item(session, pickup.id, i.material, i.gross_kg, i.deduction_kg, i.deduction_reason)
        for i in items
    ]
    session.add_all(priced)
    pricing.apply_totals(pickup, priced, get_settings().door_min_kg)
    if not pickup.total_amount_kobo:
        raise ApiError(422, "VALIDATION_ERROR", "There's nothing to pay: check the weights.")
    return priced


async def weigh(
    session: AsyncSession, pickup_id: UUID, collector: Profile, photo_url: str, items: list[WeighItemIn]
) -> tuple[Pickup, str]:
    """Items with today's prices, totals, then EN_ROUTE -> AWAITING_CONFIRMATION and a new code (for the SMS)."""
    pickup = await collectors_pickup(session, pickup_id, collector)
    if pickup.status == S.EN_ROUTE and pickup.qr_scanned_at is None:
        raise ApiError(409, "ILLEGAL_TRANSITION", "Scan the customer's QR code before weighing.",
                       {"from": pickup.status.value, "to": S.AWAITING_CONFIRMATION.value})
    if pickup.status != S.EN_ROUTE:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"A pickup that is {pickup.status.value} can't be weighed.",
                       {"from": pickup.status.value, "to": S.AWAITING_CONFIRMATION.value})
    pickup.weigh_photo_url = cloudinary.check_photo_url(photo_url)
    await _priced_items(session, pickup, items)
    session.add(pickup)
    await session.flush()
    pickup = await transition(session, pickup.id, S.AWAITING_CONFIRMATION, collector)
    code = otp.issue(pickup)
    session.add(pickup)
    return pickup, code


async def confirm_with_code(session: AsyncSession, pickup_id: UUID, collector: Profile, code: str) -> Pickup:
    pickup = await collectors_pickup(session, pickup_id, collector)
    if pickup.status != S.AWAITING_CONFIRMATION:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"This pickup is {pickup.status.value.lower()}.",
                       {"from": pickup.status.value, "to": S.COMPLETED.value})
    try:
        otp.check(pickup, code)
    except ApiError as error:
        if error.code == "OTP_WRONG":
            session.add(pickup)
            await session.commit()  # keep the attempt count even though the request fails
        raise
    otp.clear(pickup)
    return await transition(session, pickup.id, S.COMPLETED, collector)


async def resend_code(session: AsyncSession, pickup_id: UUID, collector: Profile) -> tuple[Pickup, str]:
    pickup = await collectors_pickup(session, pickup_id, collector)
    if pickup.status != S.AWAITING_CONFIRMATION:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"This pickup is {pickup.status.value.lower()}.")
    if pickup.otp_resends >= otp.MAX_RESENDS:
        raise ApiError(429, "TOO_MANY_RESENDS", "No more codes for this pickup. Ask the customer to confirm in the app.")
    pickup.otp_resends += 1
    code = otp.issue(pickup)
    session.add(pickup)
    return pickup, code


def weighed_sms(pickup: Pickup, collector_name: str, code: str) -> str:
    pts = points(pickup.total_amount_kobo or 0)
    return (
        f"PlastiCash: {collector_name} weighed {pickup.total_net_kg} kg = {pts:,} pts (₦{pts:,}). "
        f"Your code is {code}. Give it to the collector to confirm, or confirm in the app. "
        "It confirms by itself in 48 hours."
    )


# ----- Admin resolve (5.6) -----


async def resolve(session: AsyncSession, pickup_id: UUID, admin: Profile, lines: list[ResolveItemIn], note: str) -> Pickup:
    """Final kg per material, priced with each item's ORIGINAL snapshot, then DISPUTED -> COMPLETED + credit."""
    pickup = await lock_pickup(session, pickup_id)
    if pickup.status != S.DISPUTED:
        raise ApiError(409, "ILLEGAL_TRANSITION", f"A pickup that is {pickup.status.value} can't be resolved.",
                       {"from": pickup.status.value, "to": S.COMPLETED.value})
    items = {item.material: item for item in await items_of(session, pickup.id)}
    if {line.material for line in lines} != set(items):
        raise ApiError(422, "VALIDATION_ERROR", "Give a final weight for each material that was weighed.",
                       {"materials": [m.value for m in items]})
    for line in lines:
        item = items[line.material]
        net = line.net_kg.quantize(KG, rounding=ROUND_HALF_UP)
        if net <= item.gross_kg:
            item.deduction_kg = item.gross_kg - net
            if item.deduction_kg > 0 and not item.deduction_reason:
                item.deduction_reason = "Adjusted on review"
        else:  # the review found more than the collector recorded
            item.gross_kg, item.deduction_kg, item.deduction_reason = net, Decimal("0"), None
        item.net_kg = net
        item.amount_kobo = pricing.item_amount_kobo(net, item.price_kobo_per_kg)  # same snapshot as at weighing
        session.add(item)
    pricing.apply_totals(pickup, list(items.values()), get_settings().door_min_kg)
    pickup.resolved_kg = pickup.total_net_kg
    session.add(pickup)
    await session.flush()
    return await transition(session, pickup.id, S.COMPLETED, admin, reason=note)


# ----- Hub walk-in (5.7) -----


async def find_user_by_phone(session: AsyncSession, phone: str) -> Profile | None:
    normalized = normalize_ng_phone(phone)
    if normalized is None:
        raise ApiError(422, "VALIDATION_ERROR", "Enter a Nigerian mobile number, e.g. 0803 123 4567")
    return (
        await session.exec(select(Profile).where(Profile.phone == normalized, Profile.role == Role.USER,
                                                 Profile.is_active))
    ).first()


async def walk_in(
    session: AsyncSession, collector: Profile, user_id: UUID, photo_url: str, items: list[WeighItemIn]
) -> tuple[Pickup, str]:
    user = await session.get(Profile, user_id)
    if user is None or user.role != Role.USER or not user.is_active:
        raise ApiError(404, "NOT_FOUND", "Customer not found.")
    pickup = Pickup(
        user_id=user.id, collector_id=collector.id, channel=PickupChannel.HUB, status=S.REQUESTED,
        area=user.area, scheduled_date=lagos_today(), qr_scanned_at=datetime.now(timezone.utc),
        weigh_photo_url=cloudinary.check_photo_url(photo_url),
    )
    session.add(pickup)
    await session.flush()
    await _priced_items(session, pickup, items)
    pickup = await create_walk_in(session, pickup, collector)
    code = otp.issue(pickup)
    session.add(pickup)
    return pickup, code
