"""Request and response models. Database tables live in models.py."""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.areas import AREAS
from app.models import AccountType, Profile, Role
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
