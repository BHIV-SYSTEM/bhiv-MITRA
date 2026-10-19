import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

from app.core.security import bearer_scheme, create_access_token, verify_token_string, rate_limit
from app.services.auth_service import UserAlreadyExistsError, auth_service


router = APIRouter()


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    tenant_id: Optional[str] = "default_tenant"
    org_id: Optional[str] = "bhiv_default"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    tenant_id: Optional[str] = "default_tenant"


class AuthUser(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    tenant_id: Optional[str] = "default_tenant"
    org_id: Optional[str] = "bhiv_default"
    is_guest: Optional[bool] = False


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class MeResponse(BaseModel):
    user: AuthUser


def _validate_name(name: str) -> str:
    cleaned = " ".join(name.strip().split())
    if len(cleaned) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    return cleaned


def _validate_password(password: str) -> str:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if len(password) > 72:
        raise HTTPException(status_code=400, detail="Password must be less than 72 characters.")
    return password


def _token_payload(user: dict) -> dict:
    return {
        "sub": user["id"],
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "tenant_id": user.get("tenant_id", "default_tenant"),
        "org_id": user.get("org_id", "bhiv_default"),
    }


async def _current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    token_data = verify_token_string(credentials.credentials)
    user_id = token_data.user_id or token_data.username
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token. Please log in again.")

    if getattr(token_data, "is_guest", False):
        return {
            "id": user_id,
            "user_id": user_id,
            "name": token_data.name or "Guest User",
            "email": token_data.email or f"{user_id}@guest.local",
            "is_guest": True,
        }

    user = await auth_service.get_public_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    user["is_guest"] = False
    return user


@router.post("/api/auth/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    name = _validate_name(request.name)
    password = _validate_password(request.password)

    try:
        user = await auth_service.create_user(name=name, email=str(request.email), password=password)
    except UserAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Email already registered.")

    token = create_access_token(data=_token_payload(user))
    return {"token": token, "user": user}


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    password = _validate_password(request.password)
    user = await auth_service.authenticate(email=str(request.email), password=password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(data=_token_payload(user))
    return {"token": token, "user": user}


@router.get("/api/auth/me", response_model=MeResponse)
async def get_me(user: dict = Depends(_current_user)):
    return {"user": user}


@router.get("/api/auth/google")
async def google_auth_redirect():
    """Initiate Google OAuth 2.0 PKCE authentication flow."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "mitra-google-client-id.apps.googleusercontent.com")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/callback/google")
    scope = "openid email profile https://www.googleapis.com/auth/gmail.send"
    google_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope={scope}&access_type=offline"
    )
    return {"url": google_url, "provider": "google"}


@router.get("/api/auth/apple")
async def apple_auth_redirect():
    """Initiate Apple Sign-In OAuth flow."""
    client_id = os.getenv("APPLE_CLIENT_ID", "com.mitra.app.signin")
    redirect_uri = os.getenv("APPLE_REDIRECT_URI", "http://localhost:3000/auth/callback/apple")
    apple_url = (
        f"https://appleid.apple.com/auth/authorize?"
        f"client_id={client_id}&redirect_uri={redirect_uri}&response_type=code%20id_token&response_mode=form_post"
    )
    return {"url": apple_url, "provider": "apple"}


@router.post("/api/auth/guest")
async def guest_auth(request: Request):
    """
    Issue a temporary guest JWT access token for anonymous users.
    Generates a unique server-side guest identity (usr_guest_<uuid12>).
    Applies per-IP rate limiting (20 requests/minute).
    """
    rate_limit(request, max_requests=20, window_seconds=60)

    guest_id = f"usr_guest_{uuid.uuid4().hex[:12]}"
    guest_name = "Guest User"
    guest_email = f"{guest_id}@guest.local"

    payload = {
        "sub": guest_id,
        "user_id": guest_id,
        "email": guest_email,
        "name": guest_name,
        "is_guest": True,
        "tenant_id": "default_tenant",
        "org_id": "bhiv_default"
    }

    # Guest token lifetime: 1 hour (60 minutes)
    token = create_access_token(data=payload, expires_delta=timedelta(hours=1))

    return {
        "access_token": token,
        "token_type": "bearer",
        "token": token,
        "user": {
            "id": guest_id,
            "name": guest_name,
            "email": guest_email,
            "is_guest": True,
            "tenant_id": "default_tenant",
            "org_id": "bhiv_default"
        },
    }
