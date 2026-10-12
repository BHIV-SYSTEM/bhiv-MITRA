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
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, Depends, status
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field

from app.executors.meta_whatsapp_executor import (
    MetaWhatsAppExecutor,
    generate_personal_wa_link,
    normalize_e164_phone
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp Integration"])

# ── Pydantic Request Models ──

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
    message: str = Field(..., description="Text content to transmit via Meta Cloud API")
    template_name: Optional[str] = Field(None, description="Optional pre-approved template name")


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


# ── 2. BUSINESS WHATSAPP (META CLOUD API) ──

@router.get("/business/status")
async def get_business_whatsapp_status(user_id: Optional[str] = "user_default"):
    """
    Returns real-time connection status of Meta WhatsApp Business Platform.
    """
    client = MetaWhatsAppExecutor()
    creds = client.get_credentials(user_id=user_id)

    has_token = bool(creds.get("access_token"))
    has_phone_id = bool(creds.get("phone_number_id"))
    is_connected = has_token and has_phone_id

    # Mask token for security
    token = creds.get("access_token") or ""
    masked_token = f"{token[:6]}...{token[-4:]}" if len(token) > 12 else ("Set" if token else "None")

    return {
        "status": "connected" if is_connected else "disconnected",
        "mode": "business",
        "source": creds.get("source", "none"),
        "phone_number_id": creds.get("phone_number_id") or None,
        "waba_id": creds.get("waba_id") or None,
        "token_configured": has_token,
        "masked_token": masked_token,
        "api_version": client.api_version,
        "can_send": is_connected,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/business/connect")
async def connect_business_whatsapp(req: BusinessConnectRequest, user_id: Optional[str] = "user_default"):
    """
    Saves and encrypts Meta WhatsApp Business Cloud API credentials for the user.
    """
    if not req.phone_number_id.strip() or not req.access_token.strip():
        raise HTTPException(status_code=400, detail="phone_number_id and access_token are required.")

    clean_user = str(user_id).strip() if user_id else "user_default"

    try:
        from app.services.connected_account_service import connected_account_service
        connected_account_service.save_user_connection(
            user_id=clean_user,
            provider="whatsapp_business",
            access_token=req.access_token.strip(),
            provider_account_id=req.phone_number_id.strip(),
            email=req.phone_display_number or f"WABA-{req.waba_id}",
            extra_data={
                "phone_number_id": req.phone_number_id.strip(),
                "waba_id": req.waba_id.strip(),
                "connected_at": datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to persist WhatsApp Business credentials: {e}")
        # In non-DB environment, still allow local execution
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
async def disconnect_business_whatsapp(user_id: Optional[str] = "user_default"):
    """
    Disconnects and deletes saved Meta WhatsApp Business credentials.
    """
    clean_user = str(user_id).strip() if user_id else "user_default"
    try:
        from app.services.connected_account_service import connected_account_service
        connected_account_service.delete_user_connection(user_id=clean_user, provider="whatsapp_business")
    except Exception as e:
        logger.warning(f"Error removing connection: {e}")

    return {
        "status": "disconnected",
        "message": "Meta WhatsApp Business Account disconnected.",
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/business/send")
async def send_business_message(req: BusinessSendRequest, user_id: Optional[str] = "user_default"):
    """
    Executes backend transmission of WhatsApp message via official Meta Cloud API.
    """
    client = MetaWhatsAppExecutor()
    if req.template_name:
        res = client.send_template_message(
            to_phone=req.to_phone,
            template_name=req.template_name,
            user_id=user_id
        )
    else:
        res = client.send_text_message(
            to_phone=req.to_phone,
            message=req.message,
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
    configured_token = os.getenv("META_WA_WEBHOOK_VERIFY_TOKEN", "mitra_wa_verify_token_secure")
    
    if hub_mode == "subscribe" and hub_verify_token == configured_token:
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
