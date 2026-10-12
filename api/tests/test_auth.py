"""Token verification and role guards, with our own ES256 key standing in for Supabase's JWKS."""
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import AdminProfile, CollectorProfile, CurrentProfile, UserProfile, get_auth_user
from app.config import Settings
from app.db import get_session
from app.errors import install_error_handlers
from app.models import Role
from tests.factories import make_user
from tests.tokens import ISSUER, token

OTHER_KEY = ec.generate_private_key(ec.SECP256R1())
LEGACY_SECRET = "legacy-hs256-secret-for-tests-only-0123456789"


def bearer(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture
def settings(fake_supabase_auth: Settings) -> Settings:
    return fake_supabase_auth


@pytest.fixture
def client(session: Session, settings) -> Iterator[TestClient]:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/auth-only")
    def auth_only(user=Depends(get_auth_user)):
        return {"id": str(user.id)}

    @app.get("/profile")
    def profile(p: CurrentProfile):
        return {"id": str(p.id), "role": p.role}

    @app.get("/user")
    def user_area(p: UserProfile):
        return {"ok": True}

    @app.get("/collector")
    def collector_area(p: CollectorProfile):
        return {"ok": True}

    @app.get("/admin")
    def admin_area(p: AdminProfile):
        return {"ok": True}

    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c


def test_valid_token_loads_the_profile(client: TestClient, session: Session) -> None:
    user = make_user(session, "Chinaza")
    response = client.get("/profile", headers=bearer(token(user.id)))
    assert response.status_code == 200
    assert response.json() == {"id": str(user.id), "role": "USER"}


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic dXNlcjpwYXNz"},
    ],
    ids=["no header", "garbage", "wrong scheme"],
)
def test_missing_or_garbage_token_is_401(client: TestClient, headers: dict) -> None:
    response = client.get("/profile", headers=headers)
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
    "bad_token",
    [
        lambda sub: token(sub, key=OTHER_KEY),
        lambda sub: token(sub, minutes=-1),
        lambda sub: token(sub, aud="anon"),
        lambda sub: token(sub, iss="https://someone-else.supabase.co/auth/v1"),
        lambda sub: jwt.encode({"sub": str(sub), "aud": "authenticated", "iss": ISSUER}, None, algorithm="none"),
        lambda sub: token(sub, key=LEGACY_SECRET, algorithm="HS256"),
        lambda sub: token("not-a-uuid"),
    ],
    ids=["wrong key", "expired", "wrong audience", "wrong issuer", "alg none", "HS256 without secret", "bad sub"],
)
def test_invalid_tokens_are_401(client: TestClient, session: Session, bad_token) -> None:
    user = make_user(session)
    response = client.get("/profile", headers=bearer(bad_token(user.id)))
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_expired_token_says_so(client: TestClient, session: Session) -> None:
    response = client.get("/profile", headers=bearer(token(make_user(session).id, minutes=-1)))
    assert "expired" in response.json()["message"]


def test_legacy_hs256_works_when_the_secret_is_set(client: TestClient, session: Session, settings) -> None:
    settings.supabase_jwt_secret = LEGACY_SECRET
    user = make_user(session)
    response = client.get("/profile", headers=bearer(token(user.id, key=LEGACY_SECRET, algorithm="HS256")))
    assert response.status_code == 200


def test_signed_up_user_without_profile(client: TestClient) -> None:
    new_id = uuid4()
    assert client.get("/auth-only", headers=bearer(token(new_id))).json() == {"id": str(new_id)}
    response = client.get("/profile", headers=bearer(token(new_id)))
    assert response.status_code == 404
    assert response.json()["code"] == "PROFILE_NOT_FOUND"


def test_inactive_user_is_rejected(client: TestClient, session: Session) -> None:
    user = make_user(session, is_active=False)
    response = client.get("/profile", headers=bearer(token(user.id)))
    assert response.status_code == 403
    assert response.json()["code"] == "ACCOUNT_INACTIVE"


@pytest.mark.parametrize("role", list(Role))
@pytest.mark.parametrize("area", ["user", "collector", "admin"])
def test_role_guards(client: TestClient, session: Session, role: Role, area: str) -> None:
    profile = make_user(session, role.value.title(), role=role)
    response = client.get(f"/{area}", headers=bearer(token(profile.id)))
    if role.value.lower() == area:
        assert response.status_code == 200
    else:
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"
