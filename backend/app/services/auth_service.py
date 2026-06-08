from __future__ import annotations

from datetime import UTC, datetime, timedelta

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.auth import AuthCredentials, GoogleAuthRequest, SignupRequest
from app.schemas.user import UserRead
from app.utils.errors import conflict, unauthorized
from app.utils.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    normalize_email,
    verify_password,
)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def signup(self, payload: SignupRequest) -> tuple[User, str, datetime]:
        email = normalize_email(payload.email)
        existing_user = self.db.scalar(select(User).where(User.email == email))
        if existing_user:
            raise conflict("Email already exists")

        user = User(
            name=payload.name.strip(),
            email=email,
            password_hash=hash_password(payload.password),
            auth_provider="local",
            thread_ids=[],
            thread_titles={},
        )
        self.db.add(user)
        self.db.flush()
        access_token, expires_at = self._create_session(user.id)
        self.db.commit()
        self.db.refresh(user)
        return user, access_token, expires_at

    def signin(self, payload: AuthCredentials) -> tuple[User, str, datetime]:
        email = normalize_email(payload.email)
        user = self.db.scalar(select(User).where(User.email == email))
        if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
            raise unauthorized("Invalid email or password")

        access_token, expires_at = self._create_session(user.id)
        self.db.commit()
        return user, access_token, expires_at

    def google_signin(self, payload: GoogleAuthRequest) -> tuple[User, str, datetime]:
        if not settings.google_client_id:
            raise unauthorized("Google sign-in is not configured")

        google_user = self._verify_google_credential(payload.credential)
        email = normalize_email(google_user["email"])
        google_sub = google_user["sub"]
        display_name = (google_user.get("name") or email.split("@", 1)[0]).strip()
        avatar_url = google_user.get("picture")

        user = self.db.scalar(select(User).where(User.google_sub == google_sub))
        if user is None:
            user = self.db.scalar(select(User).where(User.email == email))

        if user is None:
            user = User(
                name=display_name,
                email=email,
                google_sub=google_sub,
                avatar_url=avatar_url,
                auth_provider="google",
                thread_ids=[],
                thread_titles={},
            )
            self.db.add(user)
            self.db.flush()
        else:
            if not user.is_active:
                raise unauthorized("User is inactive")

            user.name = display_name or user.name
            user.email = email
            user.google_sub = google_sub
            user.avatar_url = avatar_url or user.avatar_url
            user.auth_provider = "google"

        access_token, expires_at = self._create_session(user.id)
        self.db.commit()
        self.db.refresh(user)
        return user, access_token, expires_at

    def current_user(self, token: str) -> User:
        session = self._get_active_session(token)
        user = self.db.get(User, session.user_id)
        if not user or not user.is_active:
            raise unauthorized("User not found")
        return user

    def revoke_token(self, token: str) -> None:
        session = self._get_active_session(token)
        session.revoked_at = datetime.now(UTC)
        self.db.commit()

    def serialize_user(self, user: User) -> UserRead:
        return UserRead.model_validate(user)

    def _create_session(self, user_id: int) -> tuple[str, datetime]:
        access_token = generate_session_token()
        expires_at = datetime.now(UTC) + timedelta(days=settings.auth_session_days)
        session = AuthSession(
            user_id=user_id,
            token_hash=hash_session_token(access_token),
            expires_at=expires_at,
        )
        self.db.add(session)
        return access_token, expires_at

    def _get_active_session(self, token: str) -> AuthSession:
        token_hash = hash_session_token(token)
        session = self.db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
        if (
            session is None
            or session.revoked_at is not None
            or self._as_utc(session.expires_at) <= datetime.now(UTC)
        ):
            raise unauthorized("Invalid or expired session")
        return session

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _verify_google_credential(self, credential: str) -> dict[str, str]:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential},
            timeout=15,
        )
        if response.status_code != 200:
            raise unauthorized("Invalid Google credential")

        payload = response.json()
        if payload.get("aud") != settings.google_client_id:
            raise unauthorized("Google credential audience mismatch")
        if payload.get("email_verified") != "true":
            raise unauthorized("Google account email is not verified")

        required_fields = {"email", "sub"}
        if not required_fields.issubset(payload):
            raise unauthorized("Google credential is incomplete")
        return payload
