"""add thread titles to users

Revision ID: 20260608_02_add_thread_titles
Revises: 20260608_01_add_auth_tables
Create Date: 2026-06-08 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260608_02_add_thread_titles"
down_revision = "20260608_01_add_auth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "thread_titles",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "thread_titles")
