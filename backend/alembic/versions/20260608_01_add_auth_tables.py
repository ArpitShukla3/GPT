"""add auth tables and user auth columns

Revision ID: 20260608_01_add_auth_tables
Revises: 20260604_01_create_chat_messages
Create Date: 2026-06-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260608_01_add_auth_tables"
down_revision = "20260604_01_create_chat_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "auth_provider",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'local'"),
        ),
    )
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "auth_provider")
    op.drop_column("users", "password_hash")
