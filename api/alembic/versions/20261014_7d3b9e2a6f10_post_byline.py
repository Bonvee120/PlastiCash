"""posts: byline

The name shown on a blog post, so the real writer is credited instead of the admin account that typed it in.
Empty means the admin account's name, as before.

Revision ID: 7d3b9e2a6f10
Revises: 112c05644351
Create Date: 2026-10-14 09:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d3b9e2a6f10'
down_revision: Union[str, Sequence[str], None] = '112c05644351'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('posts', sa.Column('byline', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('posts', 'byline')
