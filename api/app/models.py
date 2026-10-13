"""SQLModel tables. Source of truth: docs/specs/01-data-model.md and the SQL in docs/BACKEND_SCHEMA.md.

Money is integer kobo (bigint). Weights are Decimal kg, numeric(10,2).
ledger_entries and prices are insert-only: never update or delete their rows.
"""
import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

# ===== Enums =====


class Role(str, enum.Enum):
    USER = "USER"
    COLLECTOR = "COLLECTOR"
    ADMIN = "ADMIN"


class AccountType(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    ORGANIZATION = "ORGANIZATION"


class Material(str, enum.Enum):
    PET = "PET"
    PLASTIC = "PLASTIC"
    SACHET = "SACHET"
    CAN = "CAN"
    TIN = "TIN"


class PickupStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    DISPUTED = "DISPUTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PickupChannel(str, enum.Enum):
    DOOR = "DOOR"
    HUB = "HUB"


class ConfirmedVia(str, enum.Enum):
    APP = "APP"
    OTP = "OTP"
    AUTO = "AUTO"
    ADMIN = "ADMIN"


class LedgerType(str, enum.Enum):
    PICKUP_CREDIT = "PICKUP_CREDIT"
    WITHDRAWAL_HOLD = "WITHDRAWAL_HOLD"
    WITHDRAWAL_REVERSAL = "WITHDRAWAL_REVERSAL"
    ADJUSTMENT = "ADJUSTMENT"


class WithdrawalStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    PAID = "PAID"
    FAILED = "FAILED"
    REJECTED = "REJECTED"


class BaleStatus(str, enum.Enum):
    IN_STORE = "IN_STORE"
    PROCESSED = "PROCESSED"
    SOLD = "SOLD"


# ===== Column helpers =====


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Postgres enum type named as in the SQL (e.g. `material`), storing the member names."""
    return SAEnum(enum_cls, name=name)


def enum_col(enum_cls: type[enum.Enum], name: str, *, nullable: bool = False, default: str | None = None) -> Column:
    return Column(
        pg_enum(enum_cls, name),
        nullable=nullable,
        server_default=text(f"'{default}'") if default else None,
    )


def uuid_pk() -> Column:
    return Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))


def fk(target: str, *, nullable: bool = True, ondelete: str | None = None) -> Column:
    return Column(PGUUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable)


def now_ts() -> Column:
    return Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


def ts(nullable: bool = True) -> Column:
    return Column(DateTime(timezone=True), nullable=nullable)


def kg(nullable: bool = True, *, default: str | None = None) -> Column:
    return Column(Numeric(10, 2), nullable=nullable, server_default=text(default) if default else None)


def coord() -> Column:
    return Column(Numeric(9, 6), nullable=True)


def kobo(nullable: bool = False) -> Column:
    return Column(BigInteger, nullable=nullable)


def txt(nullable: bool = True, *, unique: bool = False) -> Column:
    return Column(Text, nullable=nullable, unique=unique)


def flag(default: bool) -> Column:
    return Column(Boolean, nullable=False, server_default=text("true" if default else "false"))


def counter() -> Column:
    return Column(Integer, nullable=False, server_default=text("0"))


# ===== 1. profiles =====


class Profile(SQLModel, table=True):
    """One row per Supabase Auth user; id = auth.users.id."""

    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("role <> 'USER' or account_type is not null", name="user_needs_account_type"),
        CheckConstraint(
            "account_type is distinct from 'ORGANIZATION' or org_name is not null", name="org_needs_name"
        ),
    )

    id: UUID = Field(sa_column=Column(PGUUID(as_uuid=True), primary_key=True))
    role: Role = Field(default=Role.USER, sa_column=enum_col(Role, "role", default="USER"))
    account_type: AccountType | None = Field(default=None, sa_column=enum_col(AccountType, "account_type", nullable=True))
    full_name: str = Field(sa_column=txt(nullable=False))
    org_name: str | None = Field(default=None, sa_column=txt())
    org_type: str | None = Field(default=None, sa_column=txt())
    cac_number: str | None = Field(default=None, sa_column=txt())
    phone: str = Field(sa_column=txt(nullable=False, unique=True))
    email: str = Field(sa_column=txt(nullable=False))
    address: str | None = Field(default=None, sa_column=txt())
    area: str | None = Field(default=None, sa_column=txt())
    bank_name: str | None = Field(default=None, sa_column=txt())
    bank_code: str | None = Field(default=None, sa_column=txt())
    account_number: str | None = Field(default=None, sa_column=txt())
    account_name: str | None = Field(default=None, sa_column=txt())
    paystack_recipient_code: str | None = Field(default=None, sa_column=txt())
    verified_picker: bool = Field(default=False, sa_column=flag(False))
    is_active: bool = Field(default=True, sa_column=flag(True))
    created_at: datetime | None = Field(default=None, sa_column=now_ts())


# ===== 2. prices (versioned, insert-only) =====


class Price(SQLModel, table=True):
    """Current price for a material = latest row with effective_from <= now()."""

    __tablename__ = "prices"
    __table_args__ = (
        CheckConstraint("price_kobo_per_kg >= 0", name="prices_price_kobo_per_kg_check"),
        CheckConstraint("kg_per_full_sack > 0", name="prices_kg_per_full_sack_check"),
        CheckConstraint("items_per_kg > 0", name="prices_items_per_kg_check"),
        CheckConstraint("co2_kg_saved_per_kg >= 0", name="prices_co2_kg_saved_per_kg_check"),
        Index("prices_material_effective_idx", "material", text("effective_from desc")),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    material: Material = Field(sa_column=enum_col(Material, "material"))
    price_kobo_per_kg: int = Field(sa_column=kobo())
    kg_per_full_sack: Decimal = Field(sa_column=Column(Numeric(6, 2), nullable=False))
    items_per_kg: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    co2_kg_saved_per_kg: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(6, 3), nullable=False, server_default=text("0"))
    )
    effective_from: datetime | None = Field(default=None, sa_column=now_ts())
    set_by: UUID | None = Field(default=None, sa_column=fk("profiles.id"))
    created_at: datetime | None = Field(default=None, sa_column=now_ts())


# ===== 3. pickups =====


class Pickup(SQLModel, table=True):
    """Status changes only through services/pickup_state.py."""

    __tablename__ = "pickups"
    __table_args__ = (
        CheckConstraint("preferred_window in ('MORNING','AFTERNOON')", name="pickups_preferred_window_check"),
        CheckConstraint("total_amount_kobo >= 0", name="pickups_total_amount_kobo_check"),
        CheckConstraint("reminders_sent between 0 and 3", name="pickups_reminders_sent_check"),
        CheckConstraint("status <> 'COMPLETED' or total_amount_kobo is not null", name="completed_has_amount"),
        CheckConstraint(
            "status in ('REQUESTED','CANCELLED') or collector_id is not null", name="assigned_has_collector"
        ),
        Index("pickups_status_idx", "status"),
        Index("pickups_area_status_idx", "area", "status"),
        Index("pickups_collector_idx", "collector_id", "status"),
        Index("pickups_user_created_idx", "user_id", text("created_at desc")),
        Index(
            "pickups_awaiting_weighed_idx",
            "weighed_at",
            postgresql_where=text("status = 'AWAITING_CONFIRMATION'"),
        ),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    user_id: UUID = Field(sa_column=fk("profiles.id", nullable=False))
    collector_id: UUID | None = Field(default=None, sa_column=fk("profiles.id"))
    channel: PickupChannel = Field(
        default=PickupChannel.DOOR, sa_column=enum_col(PickupChannel, "pickup_channel", default="DOOR")
    )
    status: PickupStatus = Field(
        default=PickupStatus.REQUESTED, sa_column=enum_col(PickupStatus, "pickup_status", default="REQUESTED")
    )
    area: str | None = Field(default=None, sa_column=txt())
    address: str | None = Field(default=None, sa_column=txt())
    lat: Decimal | None = Field(default=None, sa_column=coord())
    lng: Decimal | None = Field(default=None, sa_column=coord())
    preferred_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    preferred_window: str | None = Field(default=None, sa_column=txt())
    scheduled_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    pooled: bool = Field(default=False, sa_column=flag(False))
    estimate_sacks: Decimal | None = Field(default=None, sa_column=Column(Numeric(5, 1), nullable=True))
    estimate_note: str | None = Field(default=None, sa_column=txt())
    estimated_kg: Decimal | None = Field(default=None, sa_column=kg())
    request_photo_url: str | None = Field(default=None, sa_column=txt())
    qr_token: str | None = Field(
        default=None,
        sa_column=Column(
            Text, nullable=False, unique=True, server_default=text("encode(gen_random_bytes(16), 'hex')")
        ),
    )
    qr_scanned_at: datetime | None = Field(default=None, sa_column=ts())
    collector_lat: Decimal | None = Field(default=None, sa_column=coord())
    collector_lng: Decimal | None = Field(default=None, sa_column=coord())
    collector_location_at: datetime | None = Field(default=None, sa_column=ts())
    weighed_at: datetime | None = Field(default=None, sa_column=ts())
    weigh_photo_url: str | None = Field(default=None, sa_column=txt())
    total_net_kg: Decimal | None = Field(default=None, sa_column=kg())
    total_amount_kobo: int | None = Field(default=None, sa_column=kobo(nullable=True))
    under_minimum: bool = Field(default=False, sa_column=flag(False))
    otp_hash: str | None = Field(default=None, sa_column=txt())
    otp_expires_at: datetime | None = Field(default=None, sa_column=ts())
    otp_attempts: int = Field(default=0, sa_column=counter())
    otp_resends: int = Field(default=0, sa_column=counter())
    reminders_sent: int = Field(default=0, sa_column=counter())
    last_reminder_at: datetime | None = Field(default=None, sa_column=ts())
    confirmed_at: datetime | None = Field(default=None, sa_column=ts())
    confirmed_via: ConfirmedVia | None = Field(
        default=None, sa_column=enum_col(ConfirmedVia, "confirmed_via", nullable=True)
    )
    dispute_photo_url: str | None = Field(default=None, sa_column=txt())
    dispute_claimed_kg: Decimal | None = Field(default=None, sa_column=kg())
    dispute_reason: str | None = Field(default=None, sa_column=txt())
    disputed_at: datetime | None = Field(default=None, sa_column=ts())
    resolved_kg: Decimal | None = Field(default=None, sa_column=kg())
    resolved_by: UUID | None = Field(default=None, sa_column=fk("profiles.id"))
    resolution_note: str | None = Field(default=None, sa_column=txt())
    cancelled_reason: str | None = Field(default=None, sa_column=txt())
    created_at: datetime | None = Field(default=None, sa_column=now_ts())
    updated_at: datetime | None = Field(default=None, sa_column=now_ts())


# ===== 4. pickup_items =====


class PickupItem(SQLModel, table=True):
    """One row per material in a pickup. price_kobo_per_kg is a snapshot taken at weighing."""

    __tablename__ = "pickup_items"
    __table_args__ = (
        UniqueConstraint("pickup_id", "material", name="pickup_items_pickup_id_material_key"),
        CheckConstraint("gross_kg >= 0 and gross_kg <= 5000", name="pickup_items_gross_kg_check"),
        CheckConstraint("deduction_kg >= 0", name="pickup_items_deduction_kg_check"),
        CheckConstraint("net_kg >= 0", name="pickup_items_net_kg_check"),
        CheckConstraint("price_kobo_per_kg >= 0", name="pickup_items_price_kobo_per_kg_check"),
        CheckConstraint("amount_kobo >= 0", name="pickup_items_amount_kobo_check"),
        CheckConstraint("deduction_kg <= gross_kg", name="deduction_le_gross"),
        CheckConstraint("deduction_kg = 0 or deduction_reason is not null", name="deduction_reason_required"),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    pickup_id: UUID = Field(sa_column=fk("pickups.id", nullable=False, ondelete="CASCADE"))
    material: Material = Field(sa_column=enum_col(Material, "material"))
    gross_kg: Decimal = Field(sa_column=kg(nullable=False))
    deduction_kg: Decimal = Field(default=Decimal("0"), sa_column=kg(nullable=False, default="0"))
    deduction_reason: str | None = Field(default=None, sa_column=txt())
    net_kg: Decimal = Field(sa_column=kg(nullable=False))
    price_kobo_per_kg: int = Field(sa_column=kobo())
    price_id: UUID = Field(sa_column=fk("prices.id", nullable=False))
    amount_kobo: int = Field(sa_column=kobo())


# ===== 5. ledger_entries (insert-only) =====


class LedgerEntry(SQLModel, table=True):
    """Balance = SUM(amount_kobo) per user. Corrections are new ADJUSTMENT rows."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint(
            "(type = 'PICKUP_CREDIT' and amount_kobo > 0 and pickup_id is not null) or "
            "(type = 'WITHDRAWAL_HOLD' and amount_kobo < 0 and withdrawal_id is not null) or "
            "(type = 'WITHDRAWAL_REVERSAL' and amount_kobo > 0 and withdrawal_id is not null) or "
            "(type = 'ADJUSTMENT' and amount_kobo <> 0 and note is not null and created_by is not null)",
            name="ledger_sign",
        ),
        Index(
            "ledger_one_credit_per_pickup",
            "pickup_id",
            unique=True,
            postgresql_where=text("type = 'PICKUP_CREDIT'"),
        ),
        Index(
            "ledger_one_hold_per_withdrawal",
            "withdrawal_id",
            unique=True,
            postgresql_where=text("type = 'WITHDRAWAL_HOLD'"),
        ),
        Index(
            "ledger_one_reversal_per_withdrawal",
            "withdrawal_id",
            unique=True,
            postgresql_where=text("type = 'WITHDRAWAL_REVERSAL'"),
        ),
        Index("ledger_user_created_idx", "user_id", text("created_at desc")),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    user_id: UUID = Field(sa_column=fk("profiles.id", nullable=False))
    type: LedgerType = Field(sa_column=enum_col(LedgerType, "ledger_type"))
    amount_kobo: int = Field(sa_column=kobo())
    pickup_id: UUID | None = Field(default=None, sa_column=fk("pickups.id"))
    withdrawal_id: UUID | None = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("withdrawals.id", name="ledger_withdrawal_fk", use_alter=True),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=txt())
    created_by: UUID | None = Field(default=None, sa_column=fk("profiles.id"))
    created_at: datetime | None = Field(default=None, sa_column=now_ts())


# ===== 6. withdrawals =====


class Withdrawal(SQLModel, table=True):
    """id doubles as the Paystack transfer reference. Bank details are a snapshot at request time."""

    __tablename__ = "withdrawals"
    __table_args__ = (
        CheckConstraint("amount_kobo >= 100000", name="withdrawals_amount_kobo_check"),
        Index("withdrawals_status_idx", "status", "created_at"),
        Index("withdrawals_user_idx", "user_id", text("created_at desc")),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    user_id: UUID = Field(sa_column=fk("profiles.id", nullable=False))
    amount_kobo: int = Field(sa_column=kobo())
    status: WithdrawalStatus = Field(
        default=WithdrawalStatus.PENDING,
        sa_column=enum_col(WithdrawalStatus, "withdrawal_status", default="PENDING"),
    )
    bank_name: str = Field(sa_column=txt(nullable=False))
    account_number: str = Field(sa_column=txt(nullable=False))
    account_name: str = Field(sa_column=txt(nullable=False))
    paystack_recipient_code: str = Field(sa_column=txt(nullable=False))
    paystack_transfer_code: str | None = Field(default=None, sa_column=txt())
    failure_reason: str | None = Field(default=None, sa_column=txt())
    reviewed_by: UUID | None = Field(default=None, sa_column=fk("profiles.id"))
    reviewed_at: datetime | None = Field(default=None, sa_column=ts())
    paid_at: datetime | None = Field(default=None, sa_column=ts())
    created_at: datetime | None = Field(default=None, sa_column=now_ts())
    updated_at: datetime | None = Field(default=None, sa_column=now_ts())


# ===== 7. bales =====


class Bale(SQLModel, table=True):
    """A bale can't be heavier than raw stock for its material (checked in the service)."""

    __tablename__ = "bales"
    __table_args__ = (
        CheckConstraint("weight_kg > 0", name="bales_weight_kg_check"),
        CheckConstraint("sale_price_kobo >= 0", name="bales_sale_price_kobo_check"),
        CheckConstraint(
            "status <> 'SOLD' or (buyer is not null and sale_price_kobo is not null)", name="sold_has_buyer"
        ),
        Index("bales_material_status_idx", "material", "status"),
    )

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    code: str = Field(sa_column=txt(nullable=False, unique=True))
    material: Material = Field(sa_column=enum_col(Material, "material"))
    weight_kg: Decimal = Field(sa_column=kg(nullable=False))
    status: BaleStatus = Field(
        default=BaleStatus.IN_STORE, sa_column=enum_col(BaleStatus, "bale_status", default="IN_STORE")
    )
    buyer: str | None = Field(default=None, sa_column=txt())
    sale_price_kobo: int | None = Field(default=None, sa_column=kobo(nullable=True))
    created_by: UUID = Field(sa_column=fk("profiles.id", nullable=False))
    created_at: datetime | None = Field(default=None, sa_column=now_ts())
    processed_at: datetime | None = Field(default=None, sa_column=ts())
    sold_at: datetime | None = Field(default=None, sa_column=ts())


# ===== 8. push_subscriptions (added 13 Oct 2026: admins' browser push for new pickup requests) =====


class PushSubscription(SQLModel, table=True):
    """One browser or device that agreed to receive push notifications (Web Push). The endpoint is the push
    service's URL for that browser; p256dh and auth are its public keys for encrypting the message."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (Index("push_subscriptions_profile_idx", "profile_id"),)

    id: UUID | None = Field(default=None, sa_column=uuid_pk())
    profile_id: UUID = Field(sa_column=fk("profiles.id", nullable=False, ondelete="CASCADE"))
    endpoint: str = Field(sa_column=txt(nullable=False, unique=True))
    p256dh: str = Field(sa_column=txt(nullable=False))
    auth: str = Field(sa_column=txt(nullable=False))
    created_at: datetime | None = Field(default=None, sa_column=now_ts())
