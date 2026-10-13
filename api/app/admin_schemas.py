"""Request and response models for the ops portal: stats, prices, users and collectors, adjustments, stock and bales
(docs/specs/02-api.md, Admin)."""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import AccountType, Bale, BaleStatus, Material, Role
from app.schemas import WithdrawalOut, points


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ----- Prices -----


class PriceIn(_Strict):
    """A new price version. Rows are never edited; the newest version applies to weighings from now on."""

    material: Material
    price_kobo_per_kg: int = Field(ge=0, le=100_000_000)
    kg_per_full_sack: Decimal = Field(gt=0, le=1_000, decimal_places=2)
    items_per_kg: int | None = Field(default=None, gt=0, le=100_000)
    co2_kg_saved_per_kg: Decimal = Field(ge=0, le=100, decimal_places=3)


# ----- Withdrawals -----


class AdminWithdrawalOut(WithdrawalOut):
    user_name: str


# ----- Stats -----


class PendingWithdrawals(BaseModel):
    count: int
    amount_kobo: int


class UserAccuracy(BaseModel):
    user_id: UUID
    name: str
    pickups: int
    estimated_kg: Decimal
    actual_kg: Decimal
    accuracy: Decimal  # actual ÷ estimated; 1.00 is a perfect guess


class CollectorDisputes(BaseModel):
    collector_id: UUID
    name: str
    weighed: int
    disputes: int


class StatsOut(BaseModel):
    month_start: datetime
    kg_this_month: Decimal
    points_paid_kobo: int
    points_paid: Decimal
    pending_withdrawals: PendingWithdrawals
    open_disputes: int
    waiting_requests: int
    raw_stock_kg: Decimal
    estimate_accuracy: list[UserAccuracy]
    disputes_per_collector: list[CollectorDisputes]


# ----- Users and collectors -----


class UserRow(BaseModel):
    id: UUID
    role: Role
    account_type: AccountType | None
    name: str
    full_name: str
    email: str
    phone: str
    area: str | None
    is_active: bool
    verified_picker: bool
    balance_kobo: int
    created_at: datetime


class UserPatch(_Strict):
    is_active: bool | None = None
    verified_picker: bool | None = None
    role: Role | None = None


class CollectorIn(_Strict):
    full_name: str = Field(min_length=2, max_length=200)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str
    area: str | None = None
    # A first password the admin hands over in person. Never logged or returned.
    password: str = Field(min_length=12, max_length=72)

    @field_validator("full_name", "email")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class AdjustmentIn(_Strict):
    user_id: UUID
    amount_kobo: int = Field(ge=-100_000_000, le=100_000_000)  # up to ₦1,000,000 either way
    note: str = Field(min_length=3, max_length=500)

    @field_validator("amount_kobo")
    @classmethod
    def _not_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("The amount can't be zero")
        return value


# ----- Stock and bales -----


class BaleIn(_Strict):
    material: Material
    weight_kg: Decimal = Field(gt=0, le=10_000, decimal_places=2)


class SellIn(_Strict):
    buyer: str = Field(min_length=2, max_length=200)
    sale_price_kobo: int = Field(ge=0, le=100_000_000_000)


class BaleOut(BaseModel):
    id: UUID
    code: str
    material: Material
    weight_kg: Decimal
    status: BaleStatus
    buyer: str | None
    sale_price_kobo: int | None
    created_at: datetime
    processed_at: datetime | None
    sold_at: datetime | None

    @classmethod
    def from_bale(cls, b: Bale) -> "BaleOut":
        return cls(
            id=b.id, code=b.code, material=b.material, weight_kg=b.weight_kg, status=b.status, buyer=b.buyer,
            sale_price_kobo=b.sale_price_kobo, created_at=b.created_at, processed_at=b.processed_at, sold_at=b.sold_at,
        )


class MaterialStock(BaseModel):
    material: Material
    raw_in_kg: Decimal  # net kg from COMPLETED pickups
    baled_kg: Decimal
    raw_stock_kg: Decimal  # raw_in - baled
    loss_pct: Decimal | None  # (raw_in - baled) ÷ raw_in × 100 (TRD); includes plastic not baled yet


class StockOut(BaseModel):
    materials: list[MaterialStock]
    raw_in_kg: Decimal
    baled_kg: Decimal
    raw_stock_kg: Decimal
    loss_pct: Decimal | None
    bales_by_status: dict[BaleStatus, int]
    revenue_kobo: int
    revenue: Decimal
    bales: list[BaleOut]

    @staticmethod
    def money(kobo: int) -> Decimal:
        return points(kobo)


# ----- New request alerts (ops portal, while open) -----


class NewRequest(BaseModel):
    id: UUID
    user_name: str
    area: str | None
    estimated_kg: Decimal | None
    pooled: bool
    created_at: datetime


class NewRequestsOut(BaseModel):
    cursor: datetime  # pass back as `after` next time
    items: list[NewRequest]

