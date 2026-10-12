"""Verify the Supabase access token, load the caller's profile, and guard routes by role.

Supabase signs access tokens with an asymmetric key published at ${SUPABASE_URL}/auth/v1/.well-known/jwks.json
(ES256 on this project). Legacy projects use HS256 with SUPABASE_JWT_SECRET; that path is used only when the
secret is set and the token says HS256.
"""
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import Profile, Role

ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    """The verified caller, before (or without) a profile row."""

    id: UUID
    email: str | None


def unauthorized(message: str = "Please log in again.") -> ApiError:
    return ApiError(401, "UNAUTHORIZED", message, headers={"WWW-Authenticate": "Bearer"})


@lru_cache
def get_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=10)


def decode_token(token: str) -> dict:
    settings = get_settings()
    issuer = f"{settings.supabase_url}/auth/v1"
    options = {"require": ["exp", "sub", "aud", "iss"]}
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm == "HS256" and settings.supabase_jwt_secret:
            key, algorithms = settings.supabase_jwt_secret, ["HS256"]
        elif algorithm in ASYMMETRIC_ALGORITHMS and settings.supabase_url:
            key = get_jwks_client(f"{issuer}/.well-known/jwks.json").get_signing_key_from_jwt(token).key
            algorithms = ASYMMETRIC_ALGORITHMS
        else:
            raise unauthorized()
        return jwt.decode(token, key, algorithms=algorithms, audience=AUDIENCE, issuer=issuer, options=options)
    except jwt.ExpiredSignatureError:
        raise unauthorized("Your session has expired. Please log in again.") from None
    except jwt.PyJWTError:
        raise unauthorized() from None


def get_auth_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> AuthUser:
    """Any valid Supabase user, even one without a profile yet (sign-up step 2)."""
    if credentials is None:
        raise unauthorized()
    claims = decode_token(credentials.credentials)
    try:
        user_id = UUID(claims["sub"])
    except ValueError:
        raise unauthorized() from None
    return AuthUser(id=user_id, email=claims.get("email"))


def get_current_profile(
    auth_user: Annotated[AuthUser, Depends(get_auth_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Profile:
    profile = session.get(Profile, auth_user.id)
    if profile is None:
        raise ApiError(404, "PROFILE_NOT_FOUND", "Finish signing up to continue.")
    if not profile.is_active:
        raise ApiError(403, "ACCOUNT_INACTIVE", "This account has been deactivated. Contact EcoCyclers.")
    return profile


def require_role(role: Role):
    def guard(profile: Annotated[Profile, Depends(get_current_profile)]) -> Profile:
        if profile.role != role:
            raise ApiError(403, "FORBIDDEN", "You don't have access to this page.")
        return profile

    guard.__name__ = f"require_{role.value.lower()}"
    return guard


require_user = require_role(Role.USER)
require_collector = require_role(Role.COLLECTOR)
require_admin = require_role(Role.ADMIN)

CurrentProfile = Annotated[Profile, Depends(get_current_profile)]
UserProfile = Annotated[Profile, Depends(require_user)]
CollectorProfile = Annotated[Profile, Depends(require_collector)]
AdminProfile = Annotated[Profile, Depends(require_admin)]
