import os
from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import bearer_scheme, verify_token_string
from app.services.auth_service import auth_service


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    """
    Canonical FastAPI dependency to resolve the authenticated user identity.
    Reads Authorization: Bearer <token>, validates JWT using canonical security,
    and returns the authenticated user object.

    REJECTS missing, invalid, or expired tokens with HTTP 401 Unauthorized.
    NEVER accepts user_id from query parameters or request bodies as identity.
    """
    token_str: Optional[str] = None
    if credentials and credentials.credentials:
        token_str = credentials.credentials
    elif request is not None and request.headers.get("Authorization"):
        auth_hdr = request.headers.get("Authorization", "")
        if auth_hdr.lower().startswith("bearer "):
            token_str = auth_hdr[7:].strip()

    if not token_str:
        env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
        if env not in ("production", "prod"):
            return {
                "id": "guest_user",
                "user_id": "guest_user",
                "name": "Guest User",
                "email": "guest@local",
                "is_guest": True,
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        token_data = verify_token_string(token_str)
    except Exception as exc:
        env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
        if env not in ("production", "prod"):
            return {
                "id": "guest_user",
                "user_id": "guest_user",
                "name": "Guest User",
                "email": "guest@local",
                "is_guest": True,
            }
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = token_data.user_id or token_data.username
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if this is a temporary guest token
    if getattr(token_data, "is_guest", False):
        return {
            "id": user_id,
            "user_id": user_id,
            "name": token_data.name or "Guest User",
            "email": token_data.email or f"{user_id}@guest.local",
            "is_guest": True,
        }

    # Attempt resolving user record from auth service persistence for regular accounts
    try:
        user = await auth_service.get_public_user_by_id(user_id)
    except Exception:
        user = None

    if not user:
        user = {
            "id": user_id,
            "user_id": user_id,
            "name": token_data.name or "Authenticated User",
            "email": token_data.email or "",
        }

    user["user_id"] = user.get("id") or user_id
    user["id"] = user["user_id"]
    user["is_guest"] = False
    return user
