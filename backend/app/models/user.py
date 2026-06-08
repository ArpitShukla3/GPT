from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text, func, text
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="local",
        server_default=text("'local'"),
    )
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    thread_ids: Mapped[list[str]] = mapped_column(
        MutableList.as_mutable(JSON),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    thread_titles: Mapped[dict[str, str]] = mapped_column(
        MutableDict.as_mutable(JSON),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
