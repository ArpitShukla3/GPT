from fastapi import APIRouter, Depends

from app.dependencies import get_auth_service, get_bearer_token, get_current_user
from app.schemas.auth import AuthCredentials, AuthResponse, GoogleAuthRequest, MeResponse, SignupRequest
from app.schemas.user import UserRead
from app.models.user import User
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(
    payload: SignupRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, access_token, expires_at = auth_service.signup(payload)
    return AuthResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=UserRead.model_validate(user),
    )


@router.post("/signin", response_model=AuthResponse)
def signin(
    payload: AuthCredentials,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, access_token, expires_at = auth_service.signin(payload)
    return AuthResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: AuthCredentials,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, access_token, expires_at = auth_service.signin(payload)
    return AuthResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=UserRead.model_validate(user),
    )


@router.post("/google", response_model=AuthResponse)
def google_signin(
    payload: GoogleAuthRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, access_token, expires_at = auth_service.google_signin(payload)
    return AuthResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(user=UserRead.model_validate(current_user))


@router.post("/logout", status_code=204)
def logout(
    token: str = Depends(get_bearer_token),
    auth_service: AuthService = Depends(get_auth_service),
):
    auth_service.revoke_token(token)
