"""pickups: explicit select grant for realtime

From 30 Oct 2026 Supabase stops granting the API roles access to new tables in `public` automatically.
Realtime needs `authenticated` to have SELECT on `pickups`; RLS still limits each user to the pickups they
own or are assigned to. On databases created before that date the grant already exists, so this changes nothing.

Revision ID: c4f1a8e2d7b9
Revises: 7d3b9e2a6f10
Create Date: 2026-10-21 10:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c4f1a8e2d7b9'
down_revision: Union[str, Sequence[str], None] = '7d3b9e2a6f10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("grant select on pickups to authenticated")


def downgrade() -> None:
    """Downgrade schema."""
    # No-op: on databases created before 30 Oct the grant came from Supabase's defaults, and revoking it here
    # would break Realtime on pickups.
    pass
