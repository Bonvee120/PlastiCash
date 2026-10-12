"""insert-only ledger and prices

CLAUDE.md rule 2: ledger rows are never updated or deleted; corrections are new ADJUSTMENT rows. Prices are
versioned the same way. The code already only inserts; these triggers make the database refuse UPDATE and DELETE
too, so neither a bug nor a manual SQL edit can rewrite money history. (TRUNCATE and DROP are not row changes and
stay possible for test resets and downgrades.)

Revision ID: 9d8f5dda6829
Revises: ea3a0e36fbad
Create Date: 2026-10-12

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9d8f5dda6829'
down_revision: Union[str, Sequence[str], None] = 'ea3a0e36fbad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ["ledger_entries", "prices"]


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        create function forbid_row_change() returns trigger language plpgsql as $$
        begin
          raise exception '% rows are insert-only; add a new row instead', tg_table_name
            using errcode = 'restrict_violation';
        end
        $$
    """)
    for table in TABLES:
        op.execute(f"""
            create trigger {table}_insert_only
              before update or delete on {table}
              for each row execute function forbid_row_change()
        """)


def downgrade() -> None:
    """Downgrade schema."""
    for table in TABLES:
        op.execute(f"drop trigger if exists {table}_insert_only on {table}")
    op.execute("drop function if exists forbid_row_change()")
