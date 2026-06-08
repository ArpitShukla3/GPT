from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserRead


class AuthCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class SignupRequest(AuthCredentials):
    name: str = Field(min_length=2, max_length=100)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=20)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserRead


class MeResponse(BaseModel):
    user: UserRead
