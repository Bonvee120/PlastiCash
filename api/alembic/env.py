"""Alembic environment.

Alembic owns the `public` schema only. Supabase's own schemas (auth, storage, realtime, ...) are never
touched: autogenerate looks at the default schema only, and include_name skips them explicitly.

Target database:
- default: DATABASE_URL (Supabase)
- `alembic -x db=test upgrade head`: TEST_DATABASE_URL (docker compose db-test)
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

import app.models  # noqa: F401  (registers the tables on SQLModel.metadata)
from app.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def database_url() -> str:
    settings = get_settings()
    use_test = context.get_x_argument(as_dictionary=True).get("db") == "test"
    url = settings.test_database_url if use_test else settings.database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set (use `-x db=test` for the test database)")
    return url


def include_name(name, type_, parent_names):
    if type_ == "schema":
        return name in (None, "public")
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
            include_schemas=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
