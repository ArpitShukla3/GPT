from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import AuthService
from app.utils.errors import unauthorized


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


def get_current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized("Missing access token")

    token = authorization.removeprefix("Bearer ").strip()
    return auth_service.current_user(token)


def get_bearer_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized("Missing access token")

    return authorization.removeprefix("Bearer ").strip()
