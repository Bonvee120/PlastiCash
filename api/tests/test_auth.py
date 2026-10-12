"""Token verification and role guards, with our own ES256 key standing in for Supabase's JWKS."""
from collections.abc import AsyncIterator
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

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


@pytest_asyncio.fixture
async def client(session: AsyncSession, settings) -> AsyncIterator[AsyncClient]:
    """A small app with one route per guard, so the guards are tested on their own."""
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/auth-only")
    async def auth_only(user=Depends(get_auth_user)):
        return {"id": str(user.id)}

    @app.get("/profile")
    async def profile(p: CurrentProfile):
        return {"id": str(p.id), "role": p.role}

    @app.get("/user")
    async def user_area(p: UserProfile):
        return {"ok": True}

    @app.get("/collector")
    async def collector_area(p: CollectorProfile):
        return {"ok": True}

    @app.get("/admin")
    async def admin_area(p: AdminProfile):
        return {"ok": True}

    async def test_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = test_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_valid_token_loads_the_profile(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, "Chinaza")
    response = await client.get("/profile", headers=bearer(token(user.id)))
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
async def test_missing_or_garbage_token_is_401(client: AsyncClient, headers: dict) -> None:
    response = await client.get("/profile", headers=headers)
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
async def test_invalid_tokens_are_401(client: AsyncClient, session: AsyncSession, bad_token) -> None:
    user = await make_user(session)
    response = await client.get("/profile", headers=bearer(bad_token(user.id)))
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


async def test_expired_token_says_so(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session)
    response = await client.get("/profile", headers=bearer(token(user.id, minutes=-1)))
    assert "expired" in response.json()["message"]


async def test_legacy_hs256_works_when_the_secret_is_set(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    settings.supabase_jwt_secret = LEGACY_SECRET
    user = await make_user(session)
    response = await client.get("/profile", headers=bearer(token(user.id, key=LEGACY_SECRET, algorithm="HS256")))
    assert response.status_code == 200


async def test_signed_up_user_without_profile(client: AsyncClient) -> None:
    new_id = uuid4()
    assert (await client.get("/auth-only", headers=bearer(token(new_id)))).json() == {"id": str(new_id)}
    response = await client.get("/profile", headers=bearer(token(new_id)))
    assert response.status_code == 404
    assert response.json()["code"] == "PROFILE_NOT_FOUND"


async def test_inactive_user_is_rejected(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, is_active=False)
    response = await client.get("/profile", headers=bearer(token(user.id)))
    assert response.status_code == 403
    assert response.json()["code"] == "ACCOUNT_INACTIVE"


@pytest.mark.parametrize("role", list(Role))
@pytest.mark.parametrize("area", ["user", "collector", "admin"])
async def test_role_guards(client: AsyncClient, session: AsyncSession, role: Role, area: str) -> None:
    profile = await make_user(session, role.value.title(), role=role)
    response = await client.get(f"/{area}", headers=bearer(token(profile.id)))
    if role.value.lower() == area:
        assert response.status_code == 200
    else:
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"
