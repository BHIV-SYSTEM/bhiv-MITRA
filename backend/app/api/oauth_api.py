import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse

from app.core.auth_dependencies import get_current_user
from app.services.oauth_transaction_service import oauth_transaction_service
from app.services.connected_account_service import connected_account_service
from app.services.identity_account_service import identity_account_service
from app.integrations.oauth.registry import oauth_provider_registry
from app.services.auth_service import auth_service
from app.core.security import create_access_token

from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

router = APIRouter()

def _token_payload(user: dict) -> dict:
    return {
        "sub": user["id"],
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
    }

def _get_frontend_base_url(request: Optional[Request] = None) -> str:
    """
    Derives canonical frontend base URL, respecting proxy headers (X-Forwarded-Proto, X-Forwarded-Host).
    Prevents localhost redirection when serving behind reverse proxy in production.
    """
    env_frontend = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if env_frontend and not env_frontend.startswith("http://localhost") and not env_frontend.startswith("http://127.0.0.1"):
        return env_frontend
    if request:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        if host and not host.startswith("localhost") and not host.startswith("127.0.0.1"):
            return f"{proto}://{host}"
        referer = request.headers.get("referer") or request.headers.get("origin") or ""
        if "8080" in referer:
            return "http://localhost:8080"
        if "3000" in referer:
            return "http://localhost:3000"
    return env_frontend or "http://localhost:8080"

def _resolve_redirect_uri(provider_name: str, request: Optional[Request] = None) -> str:
    """
    Returns the canonical redirect URI for a provider.
    Checks provider-specific env variable first, otherwise derives from request headers.
    """
    env_key = f"{provider_name.upper()}_REDIRECT_URI"
    configured = os.getenv(env_key, "").strip()
    if configured:
        return configured

    if request:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        if host:
            return f"{proto}://{host}/api/oauth/{provider_name}/callback"

    return f"http://localhost:8000/api/oauth/{provider_name}/callback"

def _is_browser_request(request: Optional[Request]) -> bool:
    if not request:
        return False
    accept = request.headers.get("accept", "").lower()
    return "text/html" in accept

@router.get("/api/oauth/{provider}/start")
@router.get("/api/auth/{provider}")  # Compatible route alias
async def start_oauth_flow(
    provider: str,
    purpose: str = Query("connect", description="OAuth transaction purpose: 'connect', 'login', 'signup', or 'upgrade_gmail'"),
    user_id: Optional[str] = Query(None, description="Ignored: identity is derived strictly from Bearer token"),
    request: Request = None
):
    """
    Initiates secure OAuth 2.0 PKCE transaction.
    For 'connect' or 'upgrade_gmail' purpose: requires valid non-guest JWT bearer token.
    For 'login' or 'signup' purpose: public endpoint; binds guest session ID if present.
    Returns JSON authorization URL or HTTP 302 redirect.
    """
    provider_name = provider.lower()
    if purpose not in ("connect", "login", "signup", "upgrade_gmail"):
        raise HTTPException(status_code=400, detail=f"Invalid OAuth purpose: '{purpose}'. Must be 'connect', 'login', 'signup', or 'upgrade_gmail'.")

    try:
        provider_inst = oauth_provider_registry.get(provider_name)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unsupported OAuth provider: {provider}")

    auth_user_id = None
    auth_header = request.headers.get("Authorization") if request else None

    if purpose in ("connect", "upgrade_gmail"):
        # Extract JWT identity strictly from Authorization header
        if not auth_header or not auth_header.strip().lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Authentication required for connecting service accounts.")
        
        from app.core.security import verify_token_string
        token = auth_header.split(" ")[1]
        try:
            token_data = verify_token_string(token)
            auth_user_id = token_data.user_id or token_data.username
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired JWT token.")

        if getattr(token_data, "is_guest", False):
            raise HTTPException(status_code=403, detail="Forbidden: Guest sessions cannot connect external accounts. Please sign up for a full account.")

        if not auth_user_id:
            raise HTTPException(status_code=401, detail="Invalid user session.")
    elif purpose in ("signup", "login"):
        # For signup or login from an existing session (e.g. guest conversion), capture user_id
        if auth_header and auth_header.strip().lower().startswith("bearer "):
            from app.core.security import verify_token_string
            token = auth_header.split(" ")[1]
            try:
                token_data = verify_token_string(token)
                auth_user_id = token_data.user_id or token_data.username
            except Exception:
                pass

    canonical_redirect = _resolve_redirect_uri(provider_name, request)

    # Safe diagnostic logging (no secrets/tokens)
    logger.info(
        "OAuth start flow initiated | provider: %s | purpose: %s | user_bound: %s | "
        "has_client_id: %s | has_client_secret: %s | has_encryption_key: %s | redirect_uri: %s",
        provider_name,
        purpose,
        bool(auth_user_id),
        bool(os.getenv(f"{provider_name.upper()}_CLIENT_ID")),
        bool(os.getenv(f"{provider_name.upper()}_CLIENT_SECRET")),
        bool(os.getenv("TOKEN_ENCRYPTION_KEY")),
        canonical_redirect
    )

    # Determine scopes based on purpose and provider
    req_scopes = None
    if provider_name == "google":
        if purpose in ("login", "signup"):
            req_scopes = ["openid", "email", "profile"]
        else:
            req_scopes = [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.compose",
                "https://www.googleapis.com/auth/calendar"
            ]

    # Create cryptographically secure OAuth transaction
    tx = oauth_transaction_service.create_transaction(
        provider=provider_name,
        purpose=purpose,
        user_id=auth_user_id,
        redirect_uri=canonical_redirect,
        scopes=req_scopes
    )

    try:
        auth_url = provider_inst.get_authorization_url(
            state=tx["state"],
            code_challenge=tx["code_challenge"],
            purpose=purpose,
            redirect_uri=canonical_redirect,
            scopes=req_scopes
        )
    except ValueError as val_err:
        raise HTTPException(status_code=503, detail=str(val_err))

    return {
        "url": auth_url,
        "auth_url": auth_url,
        "state": tx["state"],
        "provider": provider_name,
        "purpose": purpose
    }

@router.get("/api/oauth/{provider}/callback")
@router.post("/api/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    request: Request = None
):
    """
    Handles OAuth 2.0 server-side authorization code exchange and identity verification.
    Supports GET queries as well as POST form submissions (e.g. Apple form_post).
    Validates state, performs code exchange with PKCE, encrypts tokens, and updates connection/identity stores.
    Guarantees clean user-facing redirects rather than raw 500 errors on any exception.
    """
    provider_name = provider.lower()
    current_stage = "INIT"
    purpose = "connect"
    frontend_url = _get_frontend_base_url(request)
    is_browser = _is_browser_request(request)

    try:
        current_stage = "PARSE_INPUT"
        # Handle Apple Sign-In and other form_post responses
        if request and request.method == "POST":
            try:
                form = await request.form()
                code = code or form.get("code")
                state = state or form.get("state")
                error = error or form.get("error")
            except Exception as form_err:
                logger.warning(f"Error reading form data in callback: {form_err}")

        if not code and request:
            code = request.query_params.get("code")
        if not state and request:
            state = request.query_params.get("state")
        if not error and request:
            error = request.query_params.get("error")

        if code:
            code = str(code).strip()
        if state:
            state = str(state).strip()

        # Safe diagnostic logging of callback entry
        logger.info(
            "OAuth callback received | provider: %s | has_code: %s | has_state: %s | has_error: %s | is_browser: %s | path: %s",
            provider_name,
            bool(code),
            bool(state),
            bool(error),
            is_browser,
            request.url.path if request else "unknown"
        )

        if error:
            logger.warning(f"OAuth callback returned error from provider {provider}: {error}")
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=authorization_denied", status_code=302)
            return JSONResponse(
                status_code=400,
                content={"status": "error", "error": "authorization_denied", "detail": f"OAuth provider error: {error}"}
            )

        if not code or not state:
            logger.warning(f"OAuth callback missing code or state | provider: {provider_name}")
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=missing_code_or_state", status_code=302)
            raise HTTPException(status_code=400, detail="Missing required authorization code or state parameter.")

        # 1. Validate and consume OAuth state transaction
        current_stage = "STATE_CONSUMPTION"
        try:
            tx = oauth_transaction_service.validate_and_consume_transaction(
                state=state,
                provider=provider_name
            )
        except Exception as exc:
            logger.warning(f"OAuth state consumption failed: {exc}")
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=invalid_state", status_code=302)
            raise exc

        purpose = tx.get("purpose", "connect")
        if purpose not in ("connect", "login", "signup", "upgrade_gmail"):
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=invalid_purpose", status_code=302)
            raise HTTPException(status_code=400, detail="Invalid or missing OAuth purpose in transaction state.")

        try:
            provider_inst = oauth_provider_registry.get(provider_name)
        except KeyError:
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=unsupported_provider", status_code=302)
            raise HTTPException(status_code=400, detail=f"Unsupported OAuth provider: {provider}")

        # 2. Server-side code exchange with PKCE code_verifier
        current_stage = "CODE_EXCHANGE"
        target_redirect_uri = tx.get("redirect_uri") or _resolve_redirect_uri(provider_name, request)
        try:
            tokens = provider_inst.exchange_code(
                code=code,
                code_verifier=tx.get("code_verifier"),
                redirect_uri=target_redirect_uri
            )
        except Exception as exc:
            logger.error(f"OAuth code exchange failed: {exc.__class__.__name__}: {exc}")
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=exchange_failed", status_code=302)
            raise HTTPException(status_code=400, detail="Authorization code exchange failed. Please try again.")

        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        raw_expires = tokens.get("expires_in")
        expires_in = int(raw_expires) if raw_expires is not None else 3600
        expires_at = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()

        if not access_token and not tokens.get("id_token"):
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=missing_token", status_code=302)
            raise HTTPException(status_code=400, detail="Provider response did not include a valid token.")

        # 3. Retrieve provider identity
        current_stage = "IDENTITY_RETRIEVAL"
        try:
            identity = provider_inst.get_user_identity(access_token=access_token or "", id_token=tokens.get("id_token"))
        except Exception as exc:
            logger.error(f"Failed fetching user identity from {provider_name}: {exc.__class__.__name__}: {exc}")
            if is_browser:
                return RedirectResponse(url=f"{frontend_url}/?error=identity_failed", status_code=302)
            raise HTTPException(status_code=400, detail="Failed to verify identity with provider.")

        provider_subject = identity["provider_subject"]
        email = identity["email"]

        # Resolve granted scopes: prefer tokens response scope, fall back to transaction requested scopes
        raw_scope = tokens.get("scope")
        if isinstance(raw_scope, str):
            granted_scopes = [s.strip() for s in raw_scope.split() if s.strip()]
        elif isinstance(raw_scope, list):
            granted_scopes = raw_scope
        else:
            granted_scopes = tx.get("scopes") or []

        if purpose in ("login", "signup") and not granted_scopes:
            granted_scopes = ["openid", "email", "profile"]

        # 4. Handle connection or login/signup persistence
        if purpose in ("connect", "upgrade_gmail"):
            current_stage = "PERSIST_CONNECTION"
            user_id = tx.get("user_id")
            if not user_id:
                if is_browser:
                    return RedirectResponse(url=f"{frontend_url}/settings?status=error&provider={provider_name}&message={quote_plus('Invalid connection transaction state.')}", status_code=302)
                raise HTTPException(status_code=400, detail="Invalid connection transaction state.")

            # Persist connected account with encrypted tokens
            connected_account_service.create_connection(
                user_id=user_id,
                provider=provider_name,
                email=email,
                access_token=access_token or "",
                refresh_token=refresh_token,
                provider_account_id=provider_subject,
                scopes=granted_scopes,
                expires_at=expires_at
            )

            logger.info(
                "OAuth connection persisted successfully | provider: %s | purpose: %s | email_domain: %s | user_id: %s",
                provider_name,
                purpose,
                email.split("@")[-1] if "@" in email else "unknown",
                user_id
            )

            redirect_target = f"{frontend_url}/settings?status=success&provider={provider_name}&email={quote_plus(email)}"
            if purpose == "upgrade_gmail":
                redirect_target += "&upgraded=gmail"

            if is_browser:
                return RedirectResponse(url=redirect_target, status_code=302)

            msg = f"Successfully upgraded {provider_name.capitalize()} account access ({email})." if purpose == "upgrade_gmail" else f"Successfully connected {provider_name.capitalize()} account ({email})."
            return {
                "status": "success",
                "message": msg,
                "provider": provider_name,
                "email": email,
                "user_id": user_id,
                "purpose": purpose
            }

        else:
            # SIGNUP OR LOGIN FLOW
            current_stage = "PERSIST_IDENTITY"
            existing_link = identity_account_service.get_identity(provider_name, provider_subject)

            if existing_link:
                user_id = existing_link["user_id"]
                user = await auth_service.get_public_user_by_id(user_id)
                if not user:
                    user_display_name = identity.get("name") or email.split("@")[0] or "Mitra User"
                    user = await auth_service.create_user(name=user_display_name, email=email, password=create_access_token({"sub": "oauth_user"}))
                    identity_account_service.link_identity(user["id"], provider_name, provider_subject, email)
            else:
                user = await auth_service.get_user_by_email(email)
                if not user:
                    import uuid
                    random_pass = f"oauth_pass_{uuid.uuid4().hex}"
                    user_display_name = identity.get("name") or email.split("@")[0] or "Mitra User"
                    user = await auth_service.create_user(name=user_display_name, email=email, password=random_pass)

                user_id = user["id"]
                identity_account_service.link_identity(user_id, provider_name, provider_subject, email)

            # GUEST DATA MIGRATION
            current_stage = "MIGRATE_GUEST_DATA"
            guest_user_id = tx.get("user_id")
            if guest_user_id and guest_user_id != user_id and str(guest_user_id).startswith("usr_guest_"):
                try:
                    from pymongo import MongoClient
                    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
                    db_name = os.getenv("DATABASE_NAME", "ai_assistant")
                    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
                    sync_db = client[db_name]
                    for col in ["user_tasks", "tasks", "reminders", "calendar_events", "companion_history", "user_facts", "connected_accounts", "user_preferences"]:
                        sync_db[col].update_many({"user_id": guest_user_id}, {"$set": {"user_id": user_id}})
                    logger.info(f"Successfully migrated guest data from {guest_user_id} to user {user_id}")
                except Exception as mig_err:
                    logger.warning(f"Guest data migration warning: {mig_err}")

            user["is_guest"] = False
            jwt_token = create_access_token(data=_token_payload(user))

            if access_token:
                try:
                    connected_account_service.create_connection(
                        user_id=user_id,
                        provider=provider_name,
                        email=email,
                        access_token=access_token,
                        refresh_token=refresh_token,
                        provider_account_id=provider_subject,
                        scopes=granted_scopes,
                        expires_at=expires_at
                    )
                except Exception as conn_err:
                    logger.warning(f"Connected account token save warning during {purpose}: {conn_err}")

            redirect_target = f"{frontend_url}/auth/callback?token={jwt_token}"

            if is_browser:
                return RedirectResponse(url=redirect_target, status_code=302)

            return {
                "status": "success",
                "token": jwt_token,
                "user": user,
                "purpose": purpose
            }

    except Exception as top_exc:
        # If it's already an HTTPException and not a browser request, re-raise it
        if isinstance(top_exc, HTTPException) and not is_browser:
            raise top_exc

        # Safe diagnostic logging of unhandled exception
        logger.error(
            "OAuth callback unexpected failure | stage: %s | provider: %s | exception: %s | error: %s | path: %s",
            current_stage,
            provider_name,
            top_exc.__class__.__name__,
            str(top_exc),
            request.url.path if request else "unknown"
        )

        user_friendly_msg = f"{provider_name.capitalize()} connection could not be completed. Please try again."
        if is_browser:
            target_path = "/settings" if purpose == "connect" else "/auth/callback"
            return RedirectResponse(
                url=f"{frontend_url}{target_path}?status=error&provider={provider_name}&message={quote_plus(user_friendly_msg)}",
                status_code=302
            )
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": user_friendly_msg, "detail": str(top_exc)}
        )

@router.get("/api/connections")
async def list_user_connections(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieves safe metadata for all active connected accounts for the authenticated user.
    Tokens and secrets are strictly excluded.
    """
    auth_user_id = current_user["user_id"]
    connections = connected_account_service.list_user_connections(auth_user_id)
    return {
        "user_id": auth_user_id,
        "connections": connections
    }

@router.delete("/api/connections/{provider}")
async def disconnect_account(
    provider: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Disconnects and removes the specified provider connection for the authenticated user only.
    Prevents cross-user disconnection (IDOR safe).
    """
    auth_user_id = current_user["user_id"]
    provider_name = provider.lower()

    # Best effort token revocation
    conn = connected_account_service.get_user_connection(auth_user_id, provider_name, include_decrypted_tokens=True)
    if conn and conn.get("access_token"):
        try:
            provider_inst = oauth_provider_registry.get(provider_name)
            provider_inst.revoke_token(conn["access_token"])
        except Exception:
            pass

    deleted = connected_account_service.delete_connection(auth_user_id, provider_name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No active connection found for provider '{provider}'.")

    return {
        "status": "success",
        "message": f"Successfully disconnected {provider_name.capitalize()} account.",
        "provider": provider_name
    }
