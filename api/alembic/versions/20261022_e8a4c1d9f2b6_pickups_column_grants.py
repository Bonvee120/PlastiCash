"""pickups: browser roles read only the columns Realtime needs

The browser's Supabase key could select every column of a pickup it can see, including `qr_token`, so an assigned
collector could read the customer's QR code without being at the door. The pickup screen's Realtime subscription
uses only the columns granted here; everything else the browser shows comes from FastAPI. `anon` gets nothing, and
no browser role can write (RLS has no write policy either; this makes it explicit).

Revision ID: e8a4c1d9f2b6
Revises: c4f1a8e2d7b9
Create Date: 2026-10-22 10:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e8a4c1d9f2b6'
down_revision: Union[str, Sequence[str], None] = 'c4f1a8e2d7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REALTIME_COLUMNS = "id, user_id, collector_id, status, collector_lat, collector_lng, collector_location_at, updated_at"


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("revoke all on pickups from anon, authenticated")
    op.execute(f"grant select ({REALTIME_COLUMNS}) on pickups to authenticated")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(f"revoke select ({REALTIME_COLUMNS}) on pickups from authenticated")
    op.execute("grant select on pickups to authenticated")
