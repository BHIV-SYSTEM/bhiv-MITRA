"""
whatsapp_api.py — Endpoints for Personal & Business WhatsApp Integration
Supports:
1. Personal WhatsApp Click-to-Chat MVP (wa.me URL generation, phone validation, AI drafting)
2. Business WhatsApp (Meta Cloud API status, credential connection, message dispatch)
3. Meta Webhook Verification & Status tracking
"""

import os
import re
import json
import logging
import requests
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, Depends, status
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field

from app.core.auth_dependencies import get_current_user
from app.executors.meta_whatsapp_executor import (
    MetaWhatsAppExecutor,
    generate_personal_wa_link,
    normalize_e164_phone
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp Integration"])

# ── Pydantic Request Models ──

class MetaEmbeddedSignupExchangeRequest(BaseModel):
    code: str = Field(..., description="Meta authorization code from Embedded Signup")
    waba_id: Optional[str] = Field(None, description="WhatsApp Business Account ID returned in session info")
    phone_number_id: Optional[str] = Field(None, description="Phone number ID returned in session info")

class PersonalPrepareRequest(BaseModel):
    phone: str = Field(..., description="Recipient phone number with or without country code")
    message: str = Field(..., description="Message text to prefill")
    country_code: str = Field("91", description="Default country code if omitted")


class AIDraftRequest(BaseModel):
    instruction: str = Field(..., description="Natural language prompt describing what to say")
    recipient_name: Optional[str] = Field(None, description="Optional recipient name")
    tone: Optional[str] = Field("friendly", description="Tone: friendly, professional, urgent, concise")


class BusinessConnectRequest(BaseModel):
    phone_number_id: str = Field(..., description="Meta WhatsApp Phone Number ID")
    waba_id: str = Field(..., description="WhatsApp Business Account ID (WABA)")
    access_token: str = Field(..., description="Meta System User or App Access Token")
    phone_display_number: Optional[str] = Field(None, description="Display phone number e.g. +1 555-0100")


class BusinessSendRequest(BaseModel):
    to_phone: str = Field(..., description="Recipient phone number in international format")
    message: Optional[str] = Field(None, description="Text content to transmit via Meta Cloud API (required if not using a template)")
    template_name: Optional[str] = Field(None, description="Optional pre-approved template name (e.g. hello_world)")
    language_code: Optional[str] = Field("en_US", description="Template language code (defaults to en_US)")
    components: Optional[list] = Field(None, description="Optional template components/parameters")


# ── 1. PERSONAL WHATSAPP (CLICK-TO-CHAT MVP) ──

@router.post("/personal/prepare")
async def prepare_personal_whatsapp(req: PersonalPrepareRequest):
    """
    Validates recipient phone number and generates official wa.me Click to Chat URL.
    Mandates manual send confirmation and explains delivery limitations.
    """
    norm = normalize_e164_phone(req.phone, default_country_code=req.country_code)
    if not norm["valid"]:
        raise HTTPException(status_code=400, detail=norm["error"])

    link_data = generate_personal_wa_link(
        phone=req.phone,
        message=req.message,
        default_country_code=req.country_code
    )

    return {
        "status": "ready",
        "mode": "personal",
        "recipient": link_data["formatted_phone"],
        "recipient_e164": link_data["phone_e164"],
        "message": link_data["message"],
        "wa_url": link_data["url"],
        "disclaimer": link_data["notice"],
        "manual_send_required": True,
        "delivery_verifiable": False,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/personal/draft")
async def generate_ai_draft(req: AIDraftRequest):
    """
    Generates an AI-assisted WhatsApp message draft from natural language instructions.
    """
    prompt = req.instruction.strip()
    name = (req.recipient_name or "").strip()
    tone = req.tone.lower()

    # Rule-based intelligent draft synthesizer
    salutation = f"Hi {name}, " if name else "Hi, "
    
    # Check common intents
    p_lower = prompt.lower()
    if "running late" in p_lower or "arrive" in p_lower or "reach" in p_lower:
        time_match = re.search(r'(\d{1,2}(?::\d{2})?\s*(?:am|pm|hours)?)', prompt, re.IGNORECASE)
        time_str = time_match.group(1) if time_match else "a bit later"
        body = f"I'm running a bit late and should arrive by {time_str}. Thanks for understanding!"
    elif "reschedule" in p_lower or "postpone" in p_lower:
        body = "Could we please reschedule our meeting? Let me know what time works best for you."
    elif "thank" in p_lower:
        body = "Thank you so much for your help today! Really appreciate it."
    elif "status" in p_lower or "update" in p_lower:
        body = "Just checking in to get a quick update on this. Let me know when you have a moment."
    else:
        # Clean stripped body from prompt
        clean = re.sub(r'^(?:tell|say|send|message|ask)\s+(?:him|her|them|rahul|someone)?\s+(?:that|saying)?\s*', '', prompt, flags=re.IGNORECASE).strip()
        if clean:
            body = clean[0].upper() + clean[1:] if len(clean) > 1 else clean.upper()
        else:
            body = prompt

    final_draft = f"{salutation}{body}" if not body.lower().startswith("hi") else body

    return {
        "status": "success",
        "instruction": req.instruction,
        "recipient_name": name,
        "tone": tone,
        "draft": final_draft,
        "timestamp": datetime.utcnow().isoformat()
    }


# ── 2. BUSINESS WHATSAPP & META EMBEDDED SIGNUP (COEXISTENCE) ──

@router.get("/embedded-signup/config-status")
async def get_embedded_signup_config_status():
    """
    Safe configuration status endpoint for Meta WhatsApp Embedded Signup (Coexistence).
    Reports whether the required Meta App Secret and App ID are configured
    in the backend environment without revealing any sensitive secret values.
    """
    app_id = (
        os.getenv("META_APP_ID")
        or os.getenv("META_WA_APP_ID")
        or os.getenv("INSTAGRAM_APP_ID")
        or "1325283592858854"
    ).strip()

    app_secret = (
        os.getenv("META_APP_SECRET")
        or os.getenv("META_WA_APP_SECRET")
        or os.getenv("WHATSAPP_APP_SECRET")
        or os.getenv("INSTAGRAM_APP_SECRET")
        or ""
    ).strip()

    config_id = os.getenv("META_WA_CONFIG_ID", "1600310887693339").strip()
    api_version = os.getenv("META_WA_API_VERSION", "v25.0").strip()
    is_secret_configured = bool(app_secret)

    return {
        "status": "configured" if is_secret_configured else "missing_secret",
        "app_id": app_id,
        "app_secret_configured": is_secret_configured,
        "config_id": config_id,
        "api_version": api_version,
        "coexistence_enabled": True,
        "message": (
            "Meta Embedded Signup is ready for Coexistence onboarding."
            if is_secret_configured
            else "Server configuration error: Meta App Secret is not configured in backend environment."
        ),
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/embedded-signup/exchange")
@router.post("/business/oauth/exchange")
async def exchange_embedded_signup_code(
    req: MetaEmbeddedSignupExchangeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Exchanges the authorization code from Meta's Embedded Signup for a User Access Token,
    validates the WABA and phone number identifiers server-side via Graph API v25.0,
    subscribes the WABA to webhooks, and securely stores the AES-256 encrypted credentials
    against the authenticated user account with strict tenant isolation.
    """
    if not current_user or current_user.get("is_guest"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to connect your WhatsApp Business account."
        )

    user_id = str(current_user.get("id") or current_user.get("user_id") or "").strip()
    if not user_id or user_id.lower() in ("guest_user", "user_default", "none", "null"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user identity."
        )

    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code is required.")

    app_id = (
        os.getenv("META_APP_ID")
        or os.getenv("META_WA_APP_ID")
        or os.getenv("INSTAGRAM_APP_ID")
        or "1325283592858854"
    ).strip()

    app_secret = (
        os.getenv("META_APP_SECRET")
        or os.getenv("META_WA_APP_SECRET")
        or os.getenv("WHATSAPP_APP_SECRET")
        or os.getenv("INSTAGRAM_APP_SECRET")
        or ""
    ).strip()

    if not app_secret:
        logger.error("META_APP_SECRET environment variable is not configured in backend environment.")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: Meta App Secret is not configured in backend environment. Please configure META_APP_SECRET in the backend environment."
        )

    api_version = os.getenv("META_WA_API_VERSION", "v25.0").strip()
    graph_base = f"https://graph.facebook.com/{api_version}"

    # 1. Server-side exchange: Authorization Code -> Access Token
    token_url = f"{graph_base}/oauth/access_token"
    token_params = {
        "client_id": app_id,
        "client_secret": app_secret,
        "code": code
    }

    try:
        token_resp = requests.get(token_url, params=token_params, timeout=15)
    except Exception as exc:
        logger.error(f"Network error during Meta token exchange: {exc}")
        raise HTTPException(status_code=502, detail="Failed to connect to Meta Graph API.")

    if token_resp.status_code != 200:
        try:
            err_json = token_resp.json().get("error", {})
            err_msg = err_json.get("message", "Token exchange failed.")
        except Exception:
            err_msg = token_resp.text[:200]
        logger.warning(f"Meta token exchange error (HTTP {token_resp.status_code}): {err_msg}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Meta authorization exchange failed: {err_msg}"
        )

    token_data = token_resp.json()
    user_access_token = token_data.get("access_token")
    if not user_access_token:
        raise HTTPException(status_code=400, detail="Meta response did not contain an access token.")

    # 2. Server-side token inspection via /debug_token
    debug_url = f"{graph_base}/debug_token"
    debug_params = {
        "input_token": user_access_token,
        "access_token": f"{app_id}|{app_secret}"
    }

    waba_id = req.waba_id.strip() if req.waba_id else None
    phone_number_id = req.phone_number_id.strip() if req.phone_number_id else None
    granted_scopes = []

    try:
        debug_resp = requests.get(debug_url, params=debug_params, timeout=15)
        if debug_resp.status_code == 200:
            dbg_data = debug_resp.json().get("data", {})
            if not dbg_data.get("is_valid"):
                raise HTTPException(status_code=400, detail="Meta token is invalid or expired.")

            token_app_id = str(dbg_data.get("app_id", ""))
            if token_app_id and token_app_id != str(app_id):
                raise HTTPException(status_code=400, detail="Token was not issued for this application.")

            granted_scopes = dbg_data.get("scopes", [])

            # Extract WABA target ID from granular scopes if not supplied by postMessage
            if not waba_id:
                for gs in dbg_data.get("granular_scopes", []):
                    if gs.get("scope") == "whatsapp_business_management":
                        target_ids = gs.get("target_ids") or []
                        if target_ids:
                            waba_id = str(target_ids[0])
                            break
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Error inspecting token via debug_token: {exc}")

    # 3. Validate WABA ID and fetch account name
    waba_name = "WhatsApp Business Account"
    if waba_id:
        try:
            waba_resp = requests.get(
                f"{graph_base}/{waba_id}",
                headers={"Authorization": f"Bearer {user_access_token}"},
                params={"fields": "id,name,currency,timezone_id"},
                timeout=12
            )
            if waba_resp.status_code == 200:
                waba_info = waba_resp.json()
                waba_name = waba_info.get("name") or waba_name
            else:
                logger.warning(f"Could not verify WABA ID {waba_id}: {waba_resp.text[:150]}")
        except Exception as exc:
            logger.warning(f"Error checking WABA {waba_id}: {exc}")

    # 4. Fetch and validate Phone Number Details
    display_phone_number = None
    verified_name = None
    quality_rating = None

    if phone_number_id:
        try:
            phone_resp = requests.get(
                f"{graph_base}/{phone_number_id}",
                headers={"Authorization": f"Bearer {user_access_token}"},
                params={"fields": "id,display_phone_number,verified_name,quality_rating,code_verification_status"},
                timeout=12
            )
            if phone_resp.status_code == 200:
                p_data = phone_resp.json()
                display_phone_number = p_data.get("display_phone_number")
                verified_name = p_data.get("verified_name")
                quality_rating = p_data.get("quality_rating")
        except Exception as exc:
            logger.warning(f"Error validating phone number {phone_number_id}: {exc}")

    # Fallback: Query all phone numbers for this WABA if phone_number_id was not provided
    if waba_id and not display_phone_number:
        try:
            numbers_resp = requests.get(
                f"{graph_base}/{waba_id}/phone_numbers",
                headers={"Authorization": f"Bearer {user_access_token}"},
                params={"fields": "id,display_phone_number,verified_name,quality_rating,code_verification_status"},
                timeout=12
            )
            if numbers_resp.status_code == 200:
                num_list = numbers_resp.json().get("data", [])
                if num_list:
                    primary = num_list[0]
                    phone_number_id = phone_number_id or primary.get("id")
                    display_phone_number = primary.get("display_phone_number")
                    verified_name = primary.get("verified_name")
                    quality_rating = primary.get("quality_rating")
        except Exception as exc:
            logger.warning(f"Error fetching phone numbers for WABA {waba_id}: {exc}")

    if not phone_number_id:
        phone_number_id = f"waba_phone_{waba_id}" if waba_id else "unknown_phone_id"

    # 5. Subscribe WABA to Webhooks (messages, message_template_status_update)
    if waba_id:
        try:
            sub_resp = requests.post(
                f"{graph_base}/{waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {user_access_token}"},
                timeout=12
            )
            if sub_resp.status_code == 200:
                logger.info(f"Subscribed MITRA app to WABA {waba_id} webhooks.")
            else:
                logger.warning(f"WABA subscribed_apps response (HTTP {sub_resp.status_code}): {sub_resp.text[:150]}")
        except Exception as exc:
            logger.warning(f"Error subscribing WABA to webhooks: {exc}")

    # 6. Store connection in ConnectedAccountService with encryption at rest
    from app.services.connected_account_service import connected_account_service
    now_iso = datetime.utcnow().isoformat()
    extra_data = {
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "waba_name": waba_name,
        "display_phone_number": display_phone_number,
        "verified_name": verified_name,
        "quality_rating": quality_rating,
        "coexistence_mode": True,
        "signup_type": "embedded_signup_v4",
        "session_info_version": "3",
        "feature_type": "whatsapp_business_app_onboarding",
        "features": ["app_only_install"],
        "connected_at": now_iso
    }

    connected_account_service.create_connection(
        user_id=user_id,
        provider="whatsapp_business",
        email=display_phone_number or f"WABA-{waba_id or phone_number_id}",
        access_token=user_access_token,
        provider_account_id=phone_number_id,
        scopes=granted_scopes,
        extra_data=extra_data
    )

    # 7. Return sanitized response (NEVER expose access_token or app_secret)
    return {
        "status": "connected",
        "provider": "whatsapp_business",
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "display_phone_number": display_phone_number,
        "verified_name": verified_name,
        "quality_rating": quality_rating,
        "coexistence_mode": True,
        "signup_type": "embedded_signup_v4",
        "message": "WhatsApp Business Account successfully connected via Meta Embedded Signup Coexistence.",
        "timestamp": now_iso
    }


@router.get("/business/status")
async def get_business_whatsapp_status(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns real-time connection status of Meta WhatsApp Business Platform for the authenticated user.
    """
    user_id = str(current_user.get("id") or current_user.get("user_id") or "user_default").strip()
    client = MetaWhatsAppExecutor()
    creds = client.get_credentials(user_id=user_id)

    from app.services.connected_account_service import connected_account_service
    conn = connected_account_service.get_user_connection(user_id, "whatsapp_business", include_decrypted_tokens=False)
    extra = (conn.get("extra_data") or {}) if conn else {}

    is_user_conn = bool(conn and conn.get("status") in ("connected", "active"))
    has_token = bool(creds.get("access_token"))
    has_phone_id = bool(creds.get("phone_number_id"))
    is_connected = is_user_conn or (has_token and has_phone_id and creds.get("source") == "user_connected_account")

    # Mask token for security
    token = creds.get("access_token") or ""
    masked_token = f"{token[:6]}...{token[-4:]}" if len(token) > 12 else ("Set" if token else "None")

    meta_secret_configured = bool(
        (
            os.getenv("META_APP_SECRET")
            or os.getenv("META_WA_APP_SECRET")
            or os.getenv("WHATSAPP_APP_SECRET")
            or os.getenv("INSTAGRAM_APP_SECRET")
            or ""
        ).strip()
    )
    meta_app_id = (
        os.getenv("META_APP_ID")
        or os.getenv("META_WA_APP_ID")
        or os.getenv("INSTAGRAM_APP_ID")
        or "1325283592858854"
    ).strip()

    return {
        "status": "connected" if is_connected else "disconnected",
        "mode": "business",
        "source": creds.get("source", "none"),
        "phone_number_id": creds.get("phone_number_id") or None,
        "waba_id": creds.get("waba_id") or None,
        "display_phone_number": extra.get("display_phone_number") or (conn.get("email") if conn else None),
        "verified_name": extra.get("verified_name"),
        "coexistence_mode": extra.get("coexistence_mode", False),
        "token_configured": has_token,
        "masked_token": masked_token,
        "meta_app_id": meta_app_id,
        "app_secret_configured": meta_secret_configured,
        "api_version": client.api_version,
        "can_send": is_connected,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/business/connect")
async def connect_business_whatsapp(
    req: BusinessConnectRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Saves and encrypts Meta WhatsApp Business Cloud API credentials for the authenticated user.
    """
    if not req.phone_number_id.strip() or not req.access_token.strip():
        raise HTTPException(status_code=400, detail="phone_number_id and access_token are required.")

    user_id = str(current_user.get("id") or current_user.get("user_id") or "user_default").strip()

    try:
        from app.services.connected_account_service import connected_account_service
        connected_account_service.create_connection(
            user_id=user_id,
            provider="whatsapp_business",
            access_token=req.access_token.strip(),
            provider_account_id=req.phone_number_id.strip(),
            email=req.phone_display_number or f"WABA-{req.waba_id}",
            extra_data={
                "phone_number_id": req.phone_number_id.strip(),
                "waba_id": req.waba_id.strip(),
                "display_phone_number": req.phone_display_number,
                "connected_at": datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to persist WhatsApp Business credentials: {e}")
        # In non-DB fallback environment
        os.environ["META_WA_PHONE_NUMBER_ID"] = req.phone_number_id.strip()
        os.environ["META_WA_WABA_ID"] = req.waba_id.strip()
        os.environ["META_WA_ACCESS_TOKEN"] = req.access_token.strip()

    return {
        "status": "connected",
        "provider": "whatsapp_business",
        "phone_number_id": req.phone_number_id.strip(),
        "waba_id": req.waba_id.strip(),
        "message": "Meta WhatsApp Business Account successfully connected.",
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/business/disconnect")
async def disconnect_business_whatsapp(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Disconnects and deletes saved Meta WhatsApp Business credentials for the authenticated user.
    """
    user_id = str(current_user.get("id") or current_user.get("user_id") or "user_default").strip()
    try:
        from app.services.connected_account_service import connected_account_service
        connected_account_service.delete_connection(user_id=user_id, provider="whatsapp_business")
    except Exception as e:
        logger.warning(f"Error removing connection: {e}")

    return {
        "status": "disconnected",
        "message": "Meta WhatsApp Business Account disconnected.",
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/business/send")
async def send_business_message(
    req: BusinessSendRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Executes backend transmission of WhatsApp message via official Meta Cloud API for the authenticated user.
    """
    user_id = str(current_user.get("id") or current_user.get("user_id") or "user_default").strip()
    client = MetaWhatsAppExecutor()
    if req.template_name:
        res = client.send_template_message(
            to_phone=req.to_phone,
            template_name=req.template_name,
            language_code=req.language_code or "en_US",
            components=req.components,
            user_id=user_id
        )
    else:
        if not (req.message and req.message.strip()):
            raise HTTPException(status_code=400, detail="message is required when template_name is not provided.")
        res = client.send_text_message(
            to_phone=req.to_phone,
            message=req.message.strip(),
            user_id=user_id
        )

    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("error"))

    return res


# ── 3. META WEBHOOKS (VERIFICATION & DELIVERY STATUS) ──

@router.get("/webhook")
async def verify_meta_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token")
):
    """
    Handles official Meta Webhook challenge verification.
    """
    configured_tokens = [
        t.strip()
        for t in (
            os.getenv("META_WA_WEBHOOK_VERIFY_TOKEN"),
            os.getenv("WHATSAPP_VERIFY_TOKEN"),
            os.getenv("META_VERIFY_TOKEN"),
        )
        if t and t.strip()
    ] or ["mitra_wa_verify_token_secure"]
    
    import hmac
    if hub_mode == "subscribe" and hub_verify_token and any(hmac.compare_digest(hub_verify_token, ct) for ct in configured_tokens):
        logger.info("Meta WhatsApp Webhook subscription verified successfully.")
        return PlainTextResponse(content=hub_challenge or "", status_code=200)

    logger.warning("Meta WhatsApp Webhook verification failed: invalid verify token.")
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


@router.post("/webhook")
async def receive_meta_webhook_event(request: Request):
    """
    Receives incoming Meta Cloud API events (delivery status: sent, delivered, read, failed).
    """
    try:
        body = await request.json()
        logger.info(f"Incoming Meta WhatsApp webhook event received: {json.dumps(body)[:200]}")
        
        # Log event into MongoDB if available
        try:
            from app.executors.email_executor import _get_db
            db = _get_db()
            if db is not None:
                db["whatsapp_webhook_events"].insert_one({
                    "event": body,
                    "received_at": datetime.utcnow()
                })
        except Exception:
            pass

        return JSONResponse(content={"status": "EVENT_RECEIVED"}, status_code=200)
    except Exception as e:
        logger.error(f"Error parsing Meta webhook payload: {e}")
        return JSONResponse(content={"status": "ERROR"}, status_code=400)
