from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.cors import add_cors_middleware
from app.db.base import Base
from app.db.session import engine
import app.models.auth_session as _auth_session_model  # noqa: F401
from app.models.chat_message import ChatMessage  # noqa: F401
from app.routes.auth_routes import router as auth_router
from app.routes.health_routes import router as health_router
from app.routes.user_routes import router as user_router

try:
    from app.controllers.user_controller import close_workflow, init_workflow
except ModuleNotFoundError:  # pragma: no cover - optional chat dependency
    def init_workflow() -> None:  # type: ignore[no-redef]
        return None

    def close_workflow() -> None:  # type: ignore[no-redef]
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_user_auth_columns()
    ensure_user_thread_ids_column()
    ensure_user_thread_titles_column()
    Base.metadata.create_all(bind=engine)
    init_workflow()
    yield
    close_workflow()


def ensure_user_thread_ids_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "thread_ids" in columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN thread_ids JSON NOT NULL DEFAULT '[]'"))


def ensure_user_thread_titles_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "thread_titles" in columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN thread_titles JSON NOT NULL DEFAULT '{}'"))


def ensure_user_auth_columns() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    alter_statements = []

    if "password_hash" not in columns:
        alter_statements.append("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if "auth_provider" not in columns:
        alter_statements.append("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'")
    if "google_sub" not in columns:
        alter_statements.append("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)")
    if "avatar_url" not in columns:
        alter_statements.append("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)")

    if not alter_statements:
        with engine.begin() as connection:
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"))
        return

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"))


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    add_cors_middleware(app)

    app.include_router(health_router)
    app.include_router(auth_router, prefix="/api")
    app.include_router(user_router, prefix="/api")

    return app


app = create_app()
