"""Request and response models for prices, estimates and pickups. Each audience gets its own view of a pickup:
- the user (owner) never sees the collector's phone; the collector's position only while EN_ROUTE; the QR token only
  while ASSIGNED or EN_ROUTE (CLAUDE.md rule 8);
- the collector sees the customer's first name and address, never the QR token (they must scan it);
- the admin sees everything.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.areas import AREAS
from app.models import ConfirmedVia, Material, Pickup, PickupChannel, PickupItem, PickupStatus, Price
from app.schemas import points

AUTO_CONFIRM_AFTER = timedelta(hours=48)
Kg = Decimal


def _unique_materials(items: list) -> list:
    materials = [item.material for item in items]
    if len(set(materials)) != len(materials):
        raise ValueError("List each material once")
    return items


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ----- Prices and estimate -----


class CurrentPriceOut(BaseModel):
    material: Material
    price_kobo_per_kg: int
    points_per_kg: Decimal
    kg_per_full_sack: Decimal
    items_per_kg: int | None
    co2_kg_saved_per_kg: Decimal
    effective_from: datetime

    @classmethod
    def from_price(cls, p: Price) -> "CurrentPriceOut":
        return cls(
            material=p.material, price_kobo_per_kg=p.price_kobo_per_kg, points_per_kg=points(p.price_kobo_per_kg),
            kg_per_full_sack=p.kg_per_full_sack, items_per_kg=p.items_per_kg,
            co2_kg_saved_per_kg=p.co2_kg_saved_per_kg, effective_from=p.effective_from,
        )


class EstimateItemIn(_Strict):
    """How much of one material: full EcoCyclers sacks, or a count of bottles/cans."""

    material: Material
    sacks: Decimal | None = Field(default=None, gt=0, le=200, decimal_places=1)
    item_count: int | None = Field(default=None, gt=0, le=100_000)

    @model_validator(mode="after")
    def one_measure(self):
        if (self.sacks is None) == (self.item_count is None):
            raise ValueError("Give either sacks or a count, not both")
        return self


class EstimateIn(_Strict):
    items: list[EstimateItemIn] = Field(min_length=1, max_length=len(Material))

    _unique = field_validator("items")(classmethod(lambda cls, v: _unique_materials(v)))


class EstimateLineOut(BaseModel):
    material: Material
    kg: Decimal
    amount_kobo: int
    points: Decimal


class EstimateOut(BaseModel):
    items: list[EstimateLineOut]
    total_kg: Decimal
    amount_kobo: int
    points: Decimal
    door_min_kg: int
    meets_door_minimum: bool
    kg_to_minimum: Decimal


# ----- User: requests -----


class UploadSignatureIn(_Strict):
    purpose: Literal["request", "weigh", "dispute"]


class PickupCreate(EstimateIn):
    """A DOOR pickup request. Under the 50 kg minimum it's refused unless `pool` is true (wait for an area day)."""

    estimate_note: str | None = Field(default=None, max_length=300)
    request_photo_url: str
    lat: Decimal = Field(ge=-90, le=90)
    lng: Decimal = Field(ge=-180, le=180)
    address: str = Field(min_length=3, max_length=200)
    area: str
    preferred_date: date
    preferred_window: Literal["MORNING", "AFTERNOON"]
    pool: bool = False

    @field_validator("area")
    @classmethod
    def known_area(cls, value: str) -> str:
        if value not in AREAS:
            raise ValueError("Choose an area from the list")
        return value


class CancelIn(_Strict):
    reason: str | None = Field(default=None, max_length=300)


class DisputeIn(_Strict):
    photo_url: str
    claimed_kg: Decimal = Field(gt=0, le=10_000, decimal_places=2)
    reason: str = Field(min_length=3, max_length=500)


# ----- Collector -----


class LocationIn(_Strict):
    lat: Decimal = Field(ge=-90, le=90)
    lng: Decimal = Field(ge=-180, le=180)


class ScanIn(_Strict):
    qr_token: str = Field(min_length=1, max_length=100)


class WeighItemIn(_Strict):
    material: Material
    gross_kg: Decimal = Field(gt=0, le=5_000, decimal_places=2)
    deduction_kg: Decimal = Field(default=Decimal("0"), ge=0, le=5_000, decimal_places=2)
    deduction_reason: str | None = Field(default=None, max_length=200)


class WeighIn(_Strict):
    photo_url: str
    items: list[WeighItemIn] = Field(min_length=1, max_length=len(Material))

    _unique = field_validator("items")(classmethod(lambda cls, v: _unique_materials(v)))


class OtpIn(_Strict):
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class WalkInIn(WeighIn):
    user_id: UUID


class UserSearchOut(BaseModel):
    id: UUID
    name: str


# ----- Admin -----


class AssignIn(_Strict):
    collector_id: UUID
    scheduled_date: date


class ResolveItemIn(_Strict):
    material: Material
    net_kg: Decimal = Field(ge=0, le=5_000, decimal_places=2)


class ResolveIn(_Strict):
    items: list[ResolveItemIn] = Field(min_length=1, max_length=len(Material))
    note: str = Field(min_length=3, max_length=500)

    _unique = field_validator("items")(classmethod(lambda cls, v: _unique_materials(v)))


# ----- Responses -----


class PickupItemOut(BaseModel):
    material: Material
    gross_kg: Decimal
    deduction_kg: Decimal
    deduction_reason: str | None
    net_kg: Decimal
    price_kobo_per_kg: int
    amount_kobo: int
    points: Decimal

    @classmethod
    def from_item(cls, i: PickupItem) -> "PickupItemOut":
        return cls(
            material=i.material, gross_kg=i.gross_kg, deduction_kg=i.deduction_kg,
            deduction_reason=i.deduction_reason, net_kg=i.net_kg, price_kobo_per_kg=i.price_kobo_per_kg,
            amount_kobo=i.amount_kobo, points=points(i.amount_kobo),
        )


class Position(BaseModel):
    lat: Decimal
    lng: Decimal
    at: datetime | None


class _PickupBase(BaseModel):
    id: UUID
    status: PickupStatus
    channel: PickupChannel
    area: str | None
    address: str | None
    lat: Decimal | None
    lng: Decimal | None
    preferred_date: date | None
    preferred_window: str | None
    scheduled_date: date | None
    pooled: bool
    estimate_sacks: Decimal | None
    estimated_kg: Decimal | None
    estimate_note: str | None
    request_photo_url: str | None
    items: list[PickupItemOut]
    total_net_kg: Decimal | None
    total_amount_kobo: int | None
    points: Decimal | None
    under_minimum: bool
    weigh_photo_url: str | None
    weighed_at: datetime | None
    auto_confirm_at: datetime | None
    confirmed_at: datetime | None
    confirmed_via: ConfirmedVia | None
    dispute_claimed_kg: Decimal | None
    dispute_reason: str | None
    resolution_note: str | None
    cancelled_reason: str | None
    created_at: datetime

    @staticmethod
    def _base(p: Pickup, items: list[PickupItem]) -> dict:
        awaiting = p.status == PickupStatus.AWAITING_CONFIRMATION and p.weighed_at is not None
        return dict(
            id=p.id, status=p.status, channel=p.channel, area=p.area, address=p.address, lat=p.lat, lng=p.lng,
            preferred_date=p.preferred_date, preferred_window=p.preferred_window, scheduled_date=p.scheduled_date,
            pooled=p.pooled, estimate_sacks=p.estimate_sacks, estimated_kg=p.estimated_kg,
            estimate_note=p.estimate_note, request_photo_url=p.request_photo_url,
            items=[PickupItemOut.from_item(i) for i in items], total_net_kg=p.total_net_kg,
            total_amount_kobo=p.total_amount_kobo,
            points=points(p.total_amount_kobo) if p.total_amount_kobo is not None else None,
            under_minimum=p.under_minimum, weigh_photo_url=p.weigh_photo_url, weighed_at=p.weighed_at,
            auto_confirm_at=p.weighed_at + AUTO_CONFIRM_AFTER if awaiting else None,
            confirmed_at=p.confirmed_at, confirmed_via=p.confirmed_via, dispute_claimed_kg=p.dispute_claimed_kg,
            dispute_reason=p.dispute_reason, resolution_note=p.resolution_note,
            cancelled_reason=p.cancelled_reason, created_at=p.created_at,
        )


class UserPickupOut(_PickupBase):
    collector_first_name: str | None
    collector_position: Position | None  # only while EN_ROUTE
    qr_token: str | None  # only while ASSIGNED or EN_ROUTE

    @classmethod
    def build(cls, p: Pickup, items: list[PickupItem], collector_first_name: str | None) -> "UserPickupOut":
        en_route = p.status == PickupStatus.EN_ROUTE
        position = None
        if en_route and p.collector_lat is not None and p.collector_lng is not None:
            position = Position(lat=p.collector_lat, lng=p.collector_lng, at=p.collector_location_at)
        return cls(
            **cls._base(p, items),
            collector_first_name=collector_first_name,
            collector_position=position,
            qr_token=p.qr_token if p.status in (PickupStatus.ASSIGNED, PickupStatus.EN_ROUTE) else None,
        )


class CollectorPickupOut(_PickupBase):
    customer_name: str
    qr_scanned: bool
    otp_locked: bool

    @classmethod
    def build(cls, p: Pickup, items: list[PickupItem], customer_name: str) -> "CollectorPickupOut":
        return cls(**cls._base(p, items), customer_name=customer_name, qr_scanned=p.qr_scanned_at is not None,
                   otp_locked=p.otp_attempts >= 5)


class AdminPickupOut(_PickupBase):
    user_id: UUID
    user_name: str
    collector_id: UUID | None
    collector_name: str | None
    dispute_photo_url: str | None
    resolved_kg: Decimal | None
    # The customer's past actual kg ÷ estimated kg (completed door pickups); set on the board only.
    user_estimate_accuracy: Decimal | None = None

    @classmethod
    def build(cls, p: Pickup, items: list[PickupItem], user_name: str, collector_name: str | None) -> "AdminPickupOut":
        return cls(**cls._base(p, items), user_id=p.user_id, user_name=user_name, collector_id=p.collector_id,
                   collector_name=collector_name, dispute_photo_url=p.dispute_photo_url, resolved_kg=p.resolved_kg)


class AreaTotal(BaseModel):
    area: str
    requests: int
    pooled: int
    estimated_kg: Decimal


class AdminBoardOut(BaseModel):
    pickups: list[AdminPickupOut]
    area_totals: list[AreaTotal]  # waiting (REQUESTED) requests per area, for pooling


class WeighOut(BaseModel):
    pickup: CollectorPickupOut
    sms_sent: bool
