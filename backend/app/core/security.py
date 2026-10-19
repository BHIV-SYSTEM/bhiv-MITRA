import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from .logging import get_logger

logger = get_logger(__name__)

# Environment variables
API_KEY = os.getenv("API_KEY")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "4320"))


def get_jwt_secret() -> str:
    """
    Retrieve canonical JWT Secret. Fails closed in production if missing.
    """
    secret = (os.getenv("JWT_SECRET_KEY") or os.getenv("JWT_SECRET") or "").strip()
    env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()

    if not secret:
        if env in ("production", "prod"):
            raise RuntimeError(
                "CRITICAL SECURITY ERROR: JWT_SECRET_KEY environment variable is required in production mode."
            )
        logger.warning(
            "SECURITY WARNING: JWT_SECRET_KEY not set. Using explicit development secret key. DO NOT USE IN PRODUCTION."
        )
        return "dev_mitra_secret_key_change_in_production_12345"
    return secret


# Security schemes
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)

# Rate limiting store (in-memory)
rate_limit_store = defaultdict(list)


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    tenant_id: Optional[str] = "default_tenant"
    org_id: Optional[str] = "bhiv_default"
    is_guest: bool = False

def verify_api_key(api_key: str = Depends(api_key_header)) -> str:
    expected_key = os.getenv("API_KEY")
    if expected_key:
        if api_key != expected_key:
            raise HTTPException(status_code=401, detail="Invalid API Key")
        return api_key
    allowed_dev_keys = {"bhiv-enterprise-key", "your_api_key_here", "internal_key", "localtest"}
    if not api_key or api_key in allowed_dev_keys or os.getenv("ENV", "development") != "production":
        return api_key or "bhiv-enterprise-key"
    raise HTTPException(status_code=401, detail="Invalid API Key")



def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT access token using the canonical JWT secret.
    Standardizes 'sub', 'user_id', 'id', 'email', and 'name' claims.
    """
    secret = get_jwt_secret()
    to_encode = data.copy()

    user_id = str(to_encode.get("user_id") or to_encode.get("id") or to_encode.get("sub") or "").strip()
    if user_id:
        to_encode.setdefault("sub", user_id)
        to_encode.setdefault("user_id", user_id)
        to_encode.setdefault("id", user_id)

    now = datetime.utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "iat": int(now.timestamp()),
        "exp": expire,
        "tenant_id": data.get("tenant_id", "default_tenant"),
        "org_id": data.get("org_id", "bhiv_default"),
        "is_guest": data.get("is_guest", False)
    })
    encoded_jwt = jwt.encode(to_encode, secret, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> TokenData:
    if not credentials:
        raise HTTPException(status_code=401, detail="Token not provided")
    return verify_token_string(credentials.credentials)


def verify_token_string(token: str) -> TokenData:
    """
    Verify and decode a JWT token string using the canonical secret.
    Returns TokenData or raises HTTPException 401.
    """
    secret = get_jwt_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        user_id = str(payload.get("user_id") or payload.get("id") or payload.get("sub") or "").strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject/user identification")

        is_guest = bool(payload.get("is_guest", False))

        token_data = TokenData(
            username=payload.get("sub") or user_id,
            user_id=user_id,
            email=payload.get("email"),
            name=payload.get("name"),
tenant_id=payload.get("tenant_id") or "default_tenant",
            org_id=payload.get("org_id") or "bhiv_default",

is_guest=is_guest,
        )
        return token_data
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {exc}")


def authenticate_user(api_key: str = Depends(api_key_header), token: TokenData = Depends(verify_token)) -> str:
    if api_key and api_key == API_KEY:
        return "api_key_user"
    if token.username:
        return token.username
    raise HTTPException(status_code=401, detail="Authentication failed")


def rate_limit(request: Request, max_requests: int = 100, window_seconds: int = 60):
    client_ip = request.client.host if request.client else "unknown"
    current_time = time.time()
    rate_limit_store[client_ip] = [t for t in rate_limit_store[client_ip] if current_time - t < window_seconds]
    if len(rate_limit_store[client_ip]) >= max_requests:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    rate_limit_store[client_ip].append(current_time)


def audit_log(request: Request, user: str = None):
    """Log security events using structured logging"""
    try:
        logger.info("Security audit event", extra={
            "user": user or "anonymous",
            "method": request.method,
            "endpoint": request.url.path,
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "event_type": "api_access"
        })
    except Exception as e:
        print(f"Audit logging error: {e}")
