"""push subscriptions

Browser push for admins: one row per browser or device that agreed to receive notifications. RLS on, no policy, and
no grants for the browser roles, like the other tables: only FastAPI (the table owner) reads it.

Revision ID: 4c2e7a91b5d3
Revises: 9d8f5dda6829
Create Date: 2026-10-13 15:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4c2e7a91b5d3"
down_revision: Union[str, Sequence[str], None] = "9d8f5dda6829"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("push_subscriptions_profile_idx", "push_subscriptions", ["profile_id"])
    op.execute("alter table push_subscriptions enable row level security")
    op.execute("revoke all on push_subscriptions from anon, authenticated")


def downgrade() -> None:
    op.drop_index("push_subscriptions_profile_idx", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
