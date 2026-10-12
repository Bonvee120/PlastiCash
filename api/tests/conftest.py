from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlmodel import Session, create_engine

from app.config import get_settings
from app.db import get_session
from app.main import app

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


def migrate_test_db(url: str) -> None:
    """Supabase stubs, then `alembic upgrade head` on the test database."""
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text(SUPABASE_STUBS))
    engine.dispose()

    config = Config(str(API_DIR / "alembic.ini"))
    config.cmd_opts = SimpleNamespace(x=["db=test"])
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Real Postgres from `docker compose up -d db-test`, never SQLite, migrated to head."""
    url = get_settings().test_database_url
    migrate_test_db(url)
    engine = create_engine(url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """Each test runs in a transaction that is rolled back afterwards."""
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            yield session
        transaction.rollback()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
