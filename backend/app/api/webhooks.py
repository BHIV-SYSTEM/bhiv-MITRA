from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any
import os
import hmac
from datetime import datetime

from app.inbound.whatsapp_inbound_handler import handle_whatsapp_webhook
from app.inbound.email_inbound_handler import handle_email_webhook
from app.inbound.telegram_inbound_handler import handle_telegram_webhook
from app.inbound.inbound_gateway import process_message
from app.services.telegram_contact_service import TelegramContactService

router = APIRouter()


@router.post("/webhooks/whatsapp")
@router.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    """Inbound WhatsApp webhook -> unified inbound gateway."""
    return await handle_whatsapp_webhook(request)


@router.get("/webhooks/whatsapp")
@router.get("/webhook/whatsapp")
async def whatsapp_webhook_verify(request: Request):
    """WhatsApp/Meta webhook verification challenge."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    valid_tokens = [
        t.strip()
        for t in (
            os.getenv("META_WA_WEBHOOK_VERIFY_TOKEN"),
            os.getenv("WHATSAPP_VERIFY_TOKEN"),
            os.getenv("META_VERIFY_TOKEN"),
        )
        if t and t.strip()
    ]
    if mode == "subscribe" and token and any(hmac.compare_digest(token, vt) for vt in valid_tokens):
        return int(challenge) if challenge and challenge.isdigit() else (challenge or "ok")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/email")
@router.post("/webhook/email")
async def email_webhook(request: Request):
    """Inbound email webhook -> unified inbound gateway."""
    return await handle_email_webhook(request)


@router.post("/webhooks/call")
@router.post("/webhooks/telephony")
@router.post("/webhook/telephony")
async def telephony_webhook(request: Request):
    """
    Handle telephony inbound (call received -> transcription -> intent)
    This is a stub for telephony integration
    """
    try:
        payload = await request.json()

        # Extract call details and transcription
        caller_id = payload.get("caller_id", "")
        transcription = payload.get("transcription", "")

        if not transcription:
            return {"status": "ignored", "reason": "no_transcription"}

        result = await process_message(
            platform="telephony",
            user_id=str(caller_id or ""),
            message=transcription,
            timestamp=datetime.utcnow().isoformat(),
            metadata={"provider": "telephony", "payload": payload},
            device="phone",
            preferred_language="auto",
            voice_input=True,
        )

        # Log the processed call
        print(f"Telephony call from {caller_id} processed. Trace ID: {result.get('trace_id')}")

        return {
            "status": "processed",
            "trace_id": result.get("trace_id"),
            "processed_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        print(f"Error processing telephony webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing error: {str(e)}")


@router.post("/webhooks/telegram")
@router.post("/webhook/telegram")
async def telegram_webhook(request: Request):
    """Inbound Telegram webhook -> unified inbound gateway."""
    return await handle_telegram_webhook(request)


@router.get("/webhook/telegram")
async def telegram_webhook_verify(request: Request):
    """Telegram webhook verification - just returns OK."""
    return {"status": "ok", "service": "telegram_webhook"}


@router.get("/telegram/contacts")
async def list_telegram_contacts():
    """
    List known Telegram contacts that have messaged the bot.
    Enables the UI to show a contact picker without exposing chat IDs directly.
    """
    service = TelegramContactService()
    contacts = service.list_contacts()
    return {
        "status": "success",
        "count": len(contacts),
        "contacts": contacts,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/webhooks/instagram")
@router.post("/webhook/instagram")
async def instagram_webhook(request: Request):
    """
    Handle incoming Instagram Messenger API webhooks.
    Routes inbound messages through Safety -> Intelligence -> Enforcement -> Orchestration.
    """
    try:
        payload = await request.json()
        last_trace_id = None

        entries = payload.get("entry", [])
        if not entries:
            return {"status": "ignored", "reason": "no_entries"}

        for entry in entries:
            messaging_events = entry.get("messaging", [])
            for event in messaging_events:
                if event.get("message") and event["message"].get("text"):
                    sender_id = event.get("sender", {}).get("id", "")
                    text = event["message"]["text"]

                    result = await process_message(
                        platform="instagram",
                        user_id=str(sender_id or ""),
                        message=text,
                        timestamp=datetime.utcnow().isoformat(),
                        metadata={"provider": "instagram", "payload": payload},
                        device="mobile",
                        preferred_language="auto",
                        voice_input=False,
                    )
                    last_trace_id = result.get("trace_id")
                    print(f"Instagram message from {sender_id} processed. Trace: {result.get('trace_id')}")

        return {
            "status": "processed",
            "trace_id": last_trace_id,
            "processed_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        print(f"Error processing Instagram webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing error: {str(e)}")


@router.get("/webhook/instagram")
async def instagram_webhook_verify(request: Request):
    """Instagram/Meta webhook verification challenge."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    verify_token = os.getenv("META_VERIFY_TOKEN", "mitra_verify_token")
    if mode == "subscribe" and token and verify_token and hmac.compare_digest(token, verify_token):
        return int(challenge) if challenge and challenge.isdigit() else (challenge or "ok")
    raise HTTPException(status_code=403, detail="Verification failed")


# Health check for webhook endpoints
@router.get("/webhook/health")
async def webhook_health():
    return {
        "status": "healthy",
        "service": "webhook_handler",
        "platforms": ["whatsapp", "email", "telegram", "instagram", "telephony"],
        "timestamp": datetime.utcnow().isoformat(),
    }
