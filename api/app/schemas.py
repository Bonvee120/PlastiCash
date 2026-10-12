"""Request and response models. Database tables live in models.py."""
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.areas import AREAS
from app.models import AccountType, LedgerEntry, LedgerType, Material, Price, Profile, Role, Withdrawal, WithdrawalStatus
from app.phone import normalize_ng_phone

OrgType = Literal["company", "school", "NGO", "church", "estate", "other"]


def _clean(value: str | None) -> str | None:
    """Collapse whitespace; an all-blank string becomes None."""
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


class _ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("full_name", "org_name", "address", "cac_number", mode="before", check_fields=False)
    @classmethod
    def strip_text(cls, value):
        return _clean(value) if isinstance(value, str) else value

    @field_validator("phone", check_fields=False)
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        phone = normalize_ng_phone(value)
        if phone is None:
            raise ValueError("Enter a Nigerian mobile number, e.g. 0803 123 4567")
        return phone

    @field_validator("area", check_fields=False)
    @classmethod
    def known_area(cls, value: str | None) -> str | None:
        if value is not None and value not in AREAS:
            raise ValueError("Choose an area from the list")
        return value


class ProfileCreate(_ProfileFields):
    """Sign-up step 2. Individuals: full name, phone, address, area.
    Organizations also give org name and type; full_name is the contact person; CAC is optional."""

    account_type: AccountType
    full_name: str = Field(min_length=1, max_length=200)
    phone: str
    address: str = Field(min_length=1, max_length=200)
    area: str
    org_name: str | None = Field(default=None, max_length=200)
    org_type: OrgType | None = None
    cac_number: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def org_fields(self):
        if self.account_type == AccountType.ORGANIZATION:
            if not self.org_name or not self.org_type:
                raise ValueError("Organizations need an organization name and type")
        else:
            self.org_name = self.org_type = self.cac_number = None
        return self


class ProfileUpdate(_ProfileFields):
    """PATCH /me: only these fields. Role, account type, email, bank details and flags are not editable here."""

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = None
    address: str | None = Field(default=None, min_length=1, max_length=200)
    area: str | None = None
    org_name: str | None = Field(default=None, min_length=1, max_length=200)
    org_type: OrgType | None = None
    cac_number: str | None = Field(default=None, max_length=50)


def display_name(profile: Profile) -> str:
    """Greeting name: org name for organizations, else the first word of full_name.
    Empty string if there is nothing to show; the web then says just "Welcome"."""
    if profile.account_type == AccountType.ORGANIZATION and profile.org_name:
        return profile.org_name
    words = (profile.full_name or "").split()
    return words[0] if words else ""


class BankOut(BaseModel):
    bank_name: str
    account_name: str
    account_number_last4: str


class MeOut(BaseModel):
    id: UUID
    role: Role
    account_type: AccountType | None
    display_name: str
    full_name: str
    email: str
    phone: str
    address: str | None
    area: str | None
    org_name: str | None
    org_type: str | None
    cac_number: str | None
    verified_picker: bool
    bank: BankOut | None

    @classmethod
    def from_profile(cls, p: Profile) -> "MeOut":
        bank = None
        if p.bank_name and p.account_number and p.account_name:
            bank = BankOut(
                bank_name=p.bank_name, account_name=p.account_name, account_number_last4=p.account_number[-4:]
            )
        return cls(
            id=p.id,
            role=p.role,
            account_type=p.account_type,
            display_name=display_name(p),
            full_name=p.full_name,
            email=p.email,
            phone=p.phone,
            address=p.address,
            area=p.area,
            org_name=p.org_name,
            org_type=p.org_type,
            cac_number=p.cac_number,
            verified_picker=p.verified_picker,
            bank=bank,
        )


def points(amount_kobo: int) -> Decimal:
    """1 point = ₦1 = 100 kobo. Responses carry both amount_kobo and points (docs/specs/02-api.md)."""
    return Decimal(amount_kobo) / 100


class PriceOut(BaseModel):
    id: UUID
    material: Material
    price_kobo_per_kg: int
    points_per_kg: Decimal
    kg_per_full_sack: Decimal
    items_per_kg: int | None
    co2_kg_saved_per_kg: Decimal
    effective_from: datetime
    set_by: UUID | None

    @classmethod
    def from_price(cls, p: Price) -> "PriceOut":
        return cls(
            id=p.id,
            material=p.material,
            price_kobo_per_kg=p.price_kobo_per_kg,
            points_per_kg=points(p.price_kobo_per_kg),
            kg_per_full_sack=p.kg_per_full_sack,
            items_per_kg=p.items_per_kg,
            co2_kg_saved_per_kg=p.co2_kg_saved_per_kg,
            effective_from=p.effective_from,
            set_by=p.set_by,
        )


# ----- Wallet and withdrawals -----


class WithdrawalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_kobo: int = Field(gt=0)


class RejectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=300)


class WithdrawalOut(BaseModel):
    id: UUID
    user_id: UUID
    amount_kobo: int
    points: Decimal
    status: WithdrawalStatus
    bank_name: str
    account_name: str
    account_number_last4: str
    failure_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None
    paid_at: datetime | None

    @classmethod
    def from_withdrawal(cls, w: Withdrawal) -> "WithdrawalOut":
        return cls(
            id=w.id,
            user_id=w.user_id,
            amount_kobo=w.amount_kobo,
            points=points(w.amount_kobo),
            status=w.status,
            bank_name=w.bank_name,
            account_name=w.account_name,
            account_number_last4=w.account_number[-4:],
            failure_reason=w.failure_reason,
            created_at=w.created_at,
            reviewed_at=w.reviewed_at,
            paid_at=w.paid_at,
        )


class LedgerEntryOut(BaseModel):
    id: UUID
    type: LedgerType
    amount_kobo: int
    points: Decimal
    pickup_id: UUID | None
    withdrawal_id: UUID | None
    note: str | None
    created_at: datetime

    @classmethod
    def from_entry(cls, e: LedgerEntry) -> "LedgerEntryOut":
        return cls(
            id=e.id, type=e.type, amount_kobo=e.amount_kobo, points=points(e.amount_kobo), pickup_id=e.pickup_id,
            withdrawal_id=e.withdrawal_id, note=e.note, created_at=e.created_at,
        )


class WalletOut(BaseModel):
    balance_kobo: int
    points: Decimal
    entries: list[LedgerEntryOut]
    total_entries: int


# ----- Bank details -----


class BankOption(BaseModel):
    name: str
    code: str


class BankIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bank_code: str = Field(min_length=3, max_length=10, pattern=r"^[0-9A-Za-z]+$")
    account_number: str = Field(pattern=r"^\d{10}$")  # NUBAN


class BankResolveOut(BaseModel):
    bank_name: str
    account_name: str


class MaterialImpact(BaseModel):
    material: Material
    kg: Decimal
    co2_kg: Decimal


class ImpactOut(BaseModel):
    total_kg: Decimal
    co2_kg: Decimal
    pickups: int
    earned_kobo: int
    earned_points: Decimal
    by_material: list[MaterialImpact]
