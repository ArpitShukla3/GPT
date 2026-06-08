from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    id: int
    is_active: bool
    auth_provider: str = "local"
    avatar_url: str | None = None
    created_at: datetime | None = None
    thread_ids: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ThreadSummaryRead(BaseModel):
    thread_id: str
    title: str | None = None


class ThreadListRead(BaseModel):
    thread_ids: list[str]
    threads: list[ThreadSummaryRead]


class ThreadCreateRead(BaseModel):
    thread_id: str
    thread_ids: list[str]
    threads: list[ThreadSummaryRead]


class ThreadMessageRead(BaseModel):
    id: int
    user_id: int
    thread_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
