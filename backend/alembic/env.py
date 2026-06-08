from logging.config import fileConfig
import os
import sys

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.db.base import Base  # noqa: E402
import app.models.auth_session as _auth_session_model  # noqa: F401,E402
import app.models.chat_message as _chat_message_model  # noqa: F401,E402
import app.models.user as _user_model  # noqa: F401,E402


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

load_dotenv()

target_metadata = Base.metadata


def get_database_url() -> str:
    return os.getenv("PGVECTOR_URI", "sqlite:///./app.db")


def run_migrations_offline() -> None:
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
