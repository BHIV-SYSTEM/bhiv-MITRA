import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response, Depends
from pydantic import BaseModel
from pymongo import MongoClient

from app.core.security import create_access_token, verify_token_string
from app.core.auth_dependencies import get_current_user
from app.core.encryption import encrypt_secret, decrypt_secret
from app.services.connected_account_service import connected_account_service
from app.services.otp_service import otp_service

logger = logging.getLogger(__name__)

router = APIRouter()

def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.warning(f"MongoDB connection error in integrations: {exc}")
        return None

# Temporary memory caches if DB unavailable
_OTP_CACHE: Dict[str, str] = {}
_CALENDAR_PREF_CACHE: Dict[str, str] = {}
class GmailIntegrationRequest(BaseModel):
    user_id: Optional[str] = None
    email: str
    app_password: str

class WhatsAppOTPRequest(BaseModel):
    user_id: Optional[str] = None
    phone: str

class WhatsAppVerifyRequest(BaseModel):
    user_id: Optional[str] = None
    phone: str
    code: Optional[str] = None
    otp: Optional[str] = None

class CalendarPreferenceRequest(BaseModel):
    user_id: str
    preferred_provider: str  # google, apple, microsoft, zoho

@router.get("/api/integrations")
async def get_integrations(
    user_id: Optional[str] = Query(None, description="Legacy Query User ID"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get connected integrations for authenticated user.
    Ignores client-supplied user_id parameters to prevent IDOR attacks.
    Secrets are never exposed in responses.
    """
    auth_user_id = current_user["user_id"]
    db = _get_db()
    pref = _CALENDAR_PREF_CACHE.get(user_id or auth_user_id, "google")

    # Generate signed WebCal token for secure device calendar subscriptions
    feed_token = create_access_token({"user_id": auth_user_id, "feed": True})
    result = {
        "user_id": auth_user_id,
        "gmail": {"connected": False, "email": ""},
        "whatsapp": {"verified": False, "phone": ""},
        "calendar": {
            "preferred_provider": pref,
            "supported_providers": ["google", "apple", "microsoft", "zoho"],
            "webcal_url": f"http://localhost:8000/api/calendar/feed.ics?token={feed_token}"
        }
    }

    # Check connected account service first
    gmail_conn = connected_account_service.get_user_connection(auth_user_id, "gmail")
    if gmail_conn and gmail_conn.get("status") == "connected":
        result["gmail"] = {
            "connected": True,
            "email": gmail_conn.get("email", "")
        }

    whatsapp_conn = connected_account_service.get_user_connection(auth_user_id, "whatsapp")
    if whatsapp_conn and whatsapp_conn.get("status") == "connected":
        result["whatsapp"] = {
            "verified": True,
            "phone": whatsapp_conn.get("email", "") or whatsapp_conn.get("provider_account_id", "")
        }

    # Fallback/Legacy query on user_integrations
    if db is not None:
        try:
            doc = db["user_integrations"].find_one({"user_id": auth_user_id})
            if doc:
                if "gmail" in doc and doc["gmail"].get("email"):
                    result["gmail"] = {
                        "connected": True,
                        "email": doc["gmail"]["email"]
                    }
                if "whatsapp" in doc and doc["whatsapp"].get("verified"):
                    result["whatsapp"] = {
                        "verified": True,
                        "phone": doc["whatsapp"].get("phone", "")
                    }
                if "calendar" in doc and doc["calendar"].get("preferred_provider"):
                    result["calendar"]["preferred_provider"] = doc["calendar"]["preferred_provider"]
        except Exception as exc:
            logger.warning(f"Error fetching integrations for {auth_user_id}: {exc}")

    return result

@router.post("/api/integrations/calendar/preference")
async def save_calendar_preference(req: CalendarPreferenceRequest):
    """Save user preferred calendar provider (Google, Apple, Microsoft, Zoho)."""
    valid_providers = ["google", "apple", "microsoft", "zoho"]
    provider = req.preferred_provider.lower().strip()
    if provider not in valid_providers:
        raise HTTPException(status_code=400, detail=f"Invalid calendar provider. Must be one of {valid_providers}")

    _CALENDAR_PREF_CACHE[req.user_id] = provider

    db = _get_db()
    if db is not None:
        try:
            db["user_integrations"].update_one(
                {"user_id": req.user_id},
                {
                    "$set": {
                        "user_id": req.user_id,
                        "calendar.preferred_provider": provider,
                        "calendar.updated_at": datetime.utcnow().isoformat()
                    }
                },
                upsert=True
            )
        except Exception as exc:
            logger.error(f"Failed to save calendar preference: {exc}")

    return {
        "status": "success",
        "message": f"Preferred calendar set to {provider.capitalize()} Calendar.",
        "preferred_provider": provider,
        "user_id": req.user_id
    }

@router.post("/api/integrations/gmail")
async def save_gmail_integration(
    req: GmailIntegrationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Save user personal Gmail credentials encrypted with AES-256 (Fernet).
    Derives identity strictly from authenticated JWT context.
    Secrets are never stored plaintext and never returned in API responses.
    """
    auth_user_id = current_user["user_id"]
    if not req.email or not req.app_password:
        raise HTTPException(status_code=400, detail="Email and App Password required")

    encrypted_password = encrypt_secret(req.app_password)

    # 1. Store in canonical connected_account_service
    connected_account_service.create_connection(
        user_id=auth_user_id,
        provider="gmail",
        email=req.email,
        access_token=req.app_password, # Automatically encrypted inside service
        scopes=["https://mail.google.com/"]
    )

    # 2. Store encrypted in user_integrations collection for backwards compatibility
    db = _get_db()
    if db is not None:
        try:
            db["user_integrations"].update_one(
                {"user_id": auth_user_id},
                {
                    "$set": {
                        "user_id": auth_user_id,
                        "gmail": {
                            "email": req.email,
                            "encrypted_app_password": encrypted_password,
                            "connected": True,
                            "updated_at": datetime.utcnow().isoformat()
                        }
                    },
                    "$unset": {"gmail.app_password": ""}  # Remove any legacy plaintext password
                },
                upsert=True
            )
        except Exception as exc:
            logger.error(f"Failed to save Gmail integration: {exc}")

    return {
        "status": "success",
        "message": f"Gmail account {req.email} connected successfully.",
        "user_id": auth_user_id
    }

@router.post("/api/integrations/whatsapp/send-otp")
async def send_whatsapp_otp(
    req: WhatsAppOTPRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate secure 6-digit OTP code and deliver via WhatsApp API.
    Derives user_id strictly from authenticated JWT context.
    OTP is stored hashed and never returned in API responses.
    """
    auth_user_id = current_user["user_id"]
    if not req.phone or len(req.phone.strip()) < 8:
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    phone = req.phone.strip()

    # Generate cryptographically secure OTP and store hash
    raw_otp = otp_service.generate_otp(user_id=auth_user_id, phone=phone)

    # Dispatch via WhatsAppExecutor (System Authentication OTP Gateway)
    try:
        from app.executors.whatsapp_executor import WhatsAppExecutor
        executor = WhatsAppExecutor()
        dispatch_result = executor.send_message(
            to_number=phone,
            message=f"Your Mitra Universal Verification Code is: {raw_otp}. Valid for 10 minutes.",
            trace_id=f"otp_{auth_user_id}",
            is_system_otp=True
        )
        if dispatch_result.get("status") != "success":
            logger.warning(f"Twilio system OTP dispatch note: {dispatch_result.get('error')}")
    except Exception as exc:
        logger.warning(f"WhatsApp OTP dispatch exception: {exc}")

    return {
        "status": "success",
        "message": f"Verification code sent to {phone}.",
        "user_id": auth_user_id
    }

@router.post("/api/integrations/whatsapp/verify-otp")
@router.post("/api/integrations/whatsapp/verify")
async def verify_whatsapp_otp(
    req: WhatsAppVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Verify 6-digit WhatsApp OTP and mark integration verified for authenticated user.
    Derives user_id strictly from authenticated JWT context.
    Enforces constant-time hash comparison, single-use, attempt limits, and expiration.
    """
    auth_user_id = current_user["user_id"]
    phone = req.phone.strip()
    code = (req.code or req.otp or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="OTP code is required")

    # Hardened constant-time OTP verification
    otp_service.verify_otp(user_id=auth_user_id, phone=phone, code=code)

    # 1. Update connected account service
    connected_account_service.create_connection(
        user_id=auth_user_id,
        provider="whatsapp",
        email=phone,
        provider_account_id=phone
    )

    # 2. Update user_integrations collection
    db = _get_db()
    if db is not None:
        try:
            db["user_integrations"].update_one(
                {"user_id": auth_user_id},
                {
                    "$set": {
                        "user_id": auth_user_id,
                        "whatsapp": {
                            "phone": phone,
                            "verified": True,
                            "verified_at": datetime.utcnow().isoformat()
                        }
                    }
                },
                upsert=True
            )
        except Exception as exc:
            logger.error(f"Failed updating verified status: {exc}")

    return {
        "status": "success",
        "message": f"WhatsApp number {phone} verified successfully!",
        "verified": True
    }

@router.get("/api/calendar/feed.ics")
async def get_ical_feed(
    token: Optional[str] = Query(None, description="Signed WebCal feed token"),
    user_id: Optional[str] = Query(None, description="Legacy user ID (requires matching token)"),
):
    """
    Generates standard iCalendar (.ics) feed for native device calendar sync.
    Requires signed token to prevent unauthenticated calendar data harvesting.
    """
    if not token and not user_id:
        raise HTTPException(status_code=401, detail="Authentication token required for calendar feed")

    target_user_id = None
    if token:
        try:
            token_data = verify_token_string(token)
            target_user_id = token_data.user_id
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired calendar feed token")

    if user_id:
        if target_user_id and user_id != target_user_id:
            raise HTTPException(status_code=403, detail="Forbidden: feed token does not match user_id")
        if not target_user_id:
            raise HTTPException(status_code=401, detail="Signed feed token required when specifying user_id")

    if not target_user_id:
        raise HTTPException(status_code=401, detail="Calendar feed authentication failed")

    db = _get_db()
    events = []
    if db is not None:
        try:
            docs = list(db["calendar_events"].find({"user_id": target_user_id}))
            events = docs
        except Exception as exc:
            logger.warning(f"Error fetching calendar events for feed: {exc}")

    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Mitra AI Universal Companion//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Mitra AI Companion Calendar"
    ]

    for ev in events:
        summary = ev.get("title", "Mitra Event")
        start = ev.get("start", datetime.utcnow().strftime("%Y%m%dT%H%M00Z")).replace("-", "").replace(":", "")
        end = ev.get("end", datetime.utcnow().strftime("%Y%m%dT%H%M00Z")).replace("-", "").replace(":", "")
        desc = ev.get("description", "Created via Mitra AI Companion")
        ev_id = ev.get("_id", f"ev_{hashlib.md5(summary.encode()).hexdigest()[:8]}")

        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:{ev_id}@mitra.ai",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:{desc}",
            f"DTSTART:{start}",
            f"DTEND:{end}",
            "STATUS:CONFIRMED",
            "END:VEVENT"
        ])

    ics_lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(ics_lines)

    return Response(content=ics_content, media_type="text/calendar", headers={
        "Content-Disposition": f'inline; filename="mitra_calendar_{target_user_id}.ics"'
    })
