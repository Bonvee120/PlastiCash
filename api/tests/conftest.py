import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from types import SimpleNamespace

import asyncpg
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app import auth
from app.config import Settings, get_settings
from app.db import get_session
from app.main import app
from tests import tokens

API_DIR = Path(__file__).resolve().parent.parent

# What Supabase provides and the migrations rely on, recreated on plain Postgres:
# the browser roles with Supabase's default grants, auth.uid() reading the JWT `sub`, and the
# Realtime publication. Idempotent; runs before the migrations so the default grants apply.
SUPABASE_STUBS = """
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
    '')::uuid
$fn$;
"""


async def apply_supabase_stubs(url: str) -> None:
    # asyncpg runs a multi-statement script only through its own execute(), not through SQLAlchemy.
    connection = await asyncpg.connect(url.replace("postgresql+asyncpg://", "postgresql://"))
    try:
        await connection.execute(SUPABASE_STUBS)
    finally:
        await connection.close()


def migrate_test_db(url: str) -> None:
    """Supabase stubs, then `alembic upgrade head` on the test database.
    Sync on purpose: both run their own event loop, so they must run outside the tests' loop."""
    asyncio.run(apply_supabase_stubs(url))
    config = Config(str(API_DIR / "alembic.ini"))
    config.cmd_opts = SimpleNamespace(x=["db=test"])
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def migrated_test_db_url() -> str:
    url = get_settings().test_database_url
    migrate_test_db(url)
    return url


@pytest_asyncio.fixture(scope="session")
async def engine(migrated_test_db_url: str) -> AsyncIterator[AsyncEngine]:
    """Real Postgres from `docker compose up -d db-test`, never SQLite, migrated to head."""
    engine = create_async_engine(migrated_test_db_url, pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Each test runs in a transaction that is rolled back afterwards; commits inside become savepoints."""
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as session:
            yield session
        await transaction.rollback()


@pytest_asyncio.fixture
async def committed(engine: AsyncEngine) -> AsyncIterator[AsyncEngine]:
    """For concurrency tests: separate connections must see each other's rows, so these tests really commit.
    The test database is wiped afterwards (TRUNCATE, which the insert-only triggers allow)."""
    assert engine.url.database and engine.url.database.endswith("_test"), "refusing to wipe a non-test database"
    yield engine
    async with engine.begin() as connection:
        await connection.execute(
            text("truncate profiles, prices, pickups, pickup_items, ledger_entries, withdrawals, bales cascade")
        )


@pytest.fixture
def fake_supabase_auth(monkeypatch) -> Settings:
    """Make app.auth trust tokens from tests/tokens.py instead of fetching Supabase's JWKS."""
    settings = Settings(supabase_url=tokens.SUPABASE_URL, supabase_jwt_secret="")
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    public_key = tokens.SIGNING_KEY.public_key()
    jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=public_key))
    monkeypatch.setattr(auth, "get_jwks_client", lambda _url: jwks)
    return settings


@pytest.fixture
def app_settings(monkeypatch) -> Settings:
    """Test values for OTP, Cloudinary and SMS, in every module that reads them. SMS stays off."""
    from app.services import cloudinary, otp, pickups, termii, withdrawals

    settings = Settings(
        otp_secret="otp-secret-for-tests-only-0123456789",
        cloudinary_cloud_name="testcloud",
        cloudinary_api_key="123456",
        cloudinary_api_secret="cloudinary-secret-for-tests",
        sms_enabled=False,
    )
    for module in (cloudinary, otp, pickups, termii, withdrawals):
        monkeypatch.setattr(module, "get_settings", lambda: settings)
    return settings


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:
    """Capture SMS instead of sending: [(phone, text), ...]."""
    from app.services import termii

    sent: list[tuple[str, str]] = []

    async def fake_send(phone: str, message: str) -> bool:
        sent.append((phone, message))
        return True

    monkeypatch.setattr(termii, "send_sms", fake_send)
    return sent


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """The real app, in the tests' event loop, using the test's session."""

    async def test_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = test_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
