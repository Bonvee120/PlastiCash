"""rls, realtime and view grants

RLS on all 7 tables. Only `pickups` gets a policy: a signed-in user can read the pickups they own or are
assigned to, which is all Supabase Realtime needs. Every other table has RLS and no policy, so the browser
can't read it. FastAPI connects as the table owner, so RLS doesn't limit it.

Needs Supabase's `anon` and `authenticated` roles, `auth.uid()` and the `supabase_realtime` publication.
On the test database these are stubbed in tests/conftest.py.

Revision ID: ea3a0e36fbad
Revises: eb2f5fe2832e
Create Date: 2026-10-12 09:55:23.754880

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ea3a0e36fbad'
down_revision: Union[str, Sequence[str], None] = 'eb2f5fe2832e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ["profiles", "prices", "pickups", "pickup_items", "ledger_entries", "withdrawals", "bales"]
VIEWS = "wallet_balances, current_prices, raw_stock"


def upgrade() -> None:
    """Upgrade schema."""
    for table in TABLES:
        op.execute(f"alter table {table} enable row level security")

    op.execute("""
        create policy "own or assigned pickups readable" on pickups
          for select to authenticated
          using (user_id = auth.uid() or collector_id = auth.uid())
    """)

    op.execute("alter publication supabase_realtime add table pickups")

    # Views are for FastAPI only. security_invoker makes them respect RLS; also hide them from the browser roles.
    op.execute(f"revoke all on {VIEWS} from anon, authenticated")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(f"grant all on {VIEWS} to anon, authenticated")
    op.execute("alter publication supabase_realtime drop table pickups")
    op.execute('drop policy if exists "own or assigned pickups readable" on pickups')
    for table in TABLES:
        op.execute(f"alter table {table} disable row level security")
