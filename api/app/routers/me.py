"""The signed-in person's own profile. Any role can read and edit their own; only USER profiles are created here
(collectors and admins are created by an admin)."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth import AuthUser, CurrentProfile, get_auth_user
from app.db import get_session
from app.errors import ApiError
from app.models import AccountType, Profile, Role
from app.schemas import MeOut, ProfileCreate, ProfileUpdate

router = APIRouter(tags=["me"])

SessionDep = Annotated[Session, Depends(get_session)]

REQUIRED_FIELDS = ("full_name", "phone", "address", "area")
ORG_FIELDS = {"org_name", "org_type", "cac_number"}


def phone_taken_error() -> ApiError:
    return ApiError(409, "PHONE_TAKEN", "This phone number is already used by another account.")


def phone_taken(session: Session, phone: str, except_id: UUID | None = None) -> bool:
    query = select(Profile.id).where(Profile.phone == phone)
    if except_id is not None:
        query = query.where(Profile.id != except_id)
    return session.exec(query).first() is not None


def save(session: Session, profile: Profile) -> Profile:
    session.add(profile)
    try:
        session.commit()
    except IntegrityError:  # two requests racing for the same phone
        session.rollback()
        raise phone_taken_error() from None
    session.refresh(profile)
    return profile


@router.post("/me/profile", status_code=201, response_model=MeOut)
def create_profile(
    body: ProfileCreate, auth_user: Annotated[AuthUser, Depends(get_auth_user)], session: SessionDep
) -> MeOut:
    if session.get(Profile, auth_user.id) is not None:
        raise ApiError(409, "PROFILE_EXISTS", "Your profile is already set up.")
    if not auth_user.email:
        raise ApiError(422, "EMAIL_REQUIRED", "Your login has no email address.")
    if phone_taken(session, body.phone):
        raise phone_taken_error()
    profile = Profile(id=auth_user.id, role=Role.USER, email=auth_user.email, **body.model_dump())
    return MeOut.from_profile(save(session, profile))


@router.get("/me", response_model=MeOut)
def get_me(profile: CurrentProfile) -> MeOut:
    return MeOut.from_profile(profile)


@router.patch("/me", response_model=MeOut)
def update_me(body: ProfileUpdate, profile: CurrentProfile, session: SessionDep) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(key, "") is None for key in REQUIRED_FIELDS):
        raise ApiError(422, "VALIDATION_ERROR", "Name, phone, address and area can't be empty.")
    if ORG_FIELDS & changes.keys() and profile.account_type != AccountType.ORGANIZATION:
        raise ApiError(422, "VALIDATION_ERROR", "Only organizations have organization details.")
    if profile.account_type == AccountType.ORGANIZATION:
        if not changes.get("org_name", profile.org_name) or not changes.get("org_type", profile.org_type):
            raise ApiError(422, "VALIDATION_ERROR", "Organizations need an organization name and type.")
    if "phone" in changes and phone_taken(session, changes["phone"], except_id=profile.id):
        raise phone_taken_error()
    for key, value in changes.items():
        setattr(profile, key, value)
    return MeOut.from_profile(save(session, profile))
