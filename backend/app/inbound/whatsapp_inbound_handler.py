from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, Request

import threading
from pymongo import MongoClient

from app.inbound.inbound_gateway import process_message
from app.services.inbound_account_resolver import inbound_account_resolver
from app.services.webhook_dedup_service import webhook_dedup_service

logger = logging.getLogger(__name__)

# Bounded replay window (5 minutes max age, 1 minute future drift)
MAX_WEBHOOK_AGE_SECONDS = 300
FUTURE_DRIFT_TOLERANCE_SECONDS = 60

# Thread-safe in-memory delivery receipts registry for testing and fast lookup
_DELIVERY_RECEIPTS: Dict[str, Dict[str, Any]] = {}
_RECEIPTS_LOCK = threading.Lock()


def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.debug("MongoDB unavailable in whatsapp_inbound_handler: %s", exc)
        return None


def get_delivery_receipt(message_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve delivery receipt by WhatsApp provider message ID (wamid)."""
    with _RECEIPTS_LOCK:
        if message_id in _DELIVERY_RECEIPTS:
            return dict(_DELIVERY_RECEIPTS[message_id])
    db = _get_db()
    if db is not None:
        try:
            doc = db["whatsapp_delivery_receipts"].find_one({"message_id": message_id})
            if doc:
                doc.pop("_id", None)
                return doc
        except Exception:
            pass
    return None


def _verify_whatsapp_webhook(request: Request, raw_body: bytes) -> bool:
    """
    Verify WhatsApp/META webhook signatures.

    FAIL CLOSED INVARIANT:
    - If WHATSAPP_WEBHOOK_SECRET or META_APP_SECRET is missing/empty,
      verification FAILS IMMEDIATELY (returns False). NEVER returns True.
    - Requires valid X-Hub-Signature-256 computed as sha256=HMAC_SHA256(secret, raw_body).
    - Constant-time comparison using hmac.compare_digest.
    """
    secret = (os.getenv("WHATSAPP_WEBHOOK_SECRET") or os.getenv("META_APP_SECRET") or "").strip()
    if not secret:
        logger.warning(
            "WhatsApp webhook verification failed: WHATSAPP_WEBHOOK_SECRET not configured (fail closed)."
        )
        return False

    signature_header = request.headers.get("X-Hub-Signature-256") or request.headers.get(
        "x-hub-signature-256"
    )
    if not signature_header or not signature_header.startswith("sha256="):
        logger.warning("WhatsApp webhook missing or invalid X-Hub-Signature-256 header.")
        return False

    provided_sig = signature_header.split("=", 1)[1].strip()
    expected_sig = hmac.new(
        key=secret.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(provided_sig, expected_sig)


def _validate_event_timestamp(timestamp_val: Any) -> tuple[bool, Optional[str]]:
    """Validate event timestamp against bounded replay window."""
    if timestamp_val is None:
        return False, "missing_timestamp"
    try:
        ts = float(timestamp_val)
        if ts > 10**12:
            ts = ts / 1000.0
        now_ts = datetime.now(timezone.utc).timestamp()
        age = now_ts - ts
        if age > MAX_WEBHOOK_AGE_SECONDS:
            return False, "event_timestamp_expired"
        if age < -FUTURE_DRIFT_TOLERANCE_SECONDS:
            return False, "event_timestamp_future"
        return True, None
    except Exception:
        return False, "invalid_timestamp"


def _to_iso_timestamp(value: Any) -> str:
    if value is None:
        return datetime.utcnow().isoformat()
    try:
        ts = float(value)
        if ts > 10**12:
            ts = ts / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return datetime.utcnow().isoformat()


def _iter_whatsapp_messages(payload: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    entries = payload.get("entry", []) or []
    for entry in entries:
        # WhatsApp Cloud API shape
        for change in entry.get("changes", []) or []:
            field = change.get("field")
            value = change.get("value") or {}

            # Lifecycle / Coexistence account updates
            if field == "account_update":
                yield {
                    "source": "account_update",
                    "entry": entry,
                    "change": change,
                    "value": value,
                    "account_update": value,
                }
                continue

            # Human replies from WhatsApp Business mobile app (Coexistence echoes)
            if field == "smb_message_echoes":
                for echo in value.get("message_echoes", []) or []:
                    yield {
                        "source": "smb_echo",
                        "entry": entry,
                        "change": change,
                        "value": value,
                        "message": echo,
                    }
                continue

            # Status delivery receipts (sent, delivered, read, failed)
            for status in value.get("statuses", []) or []:
                yield {
                    "source": "status",
                    "entry": entry,
                    "change": change,
                    "value": value,
                    "status_item": status,
                }
            # Inbound messages
            for message in value.get("messages", []) or []:
                yield {
                    "source": "cloud",
                    "entry": entry,
                    "change": change,
                    "value": value,
                    "message": message,
                }

        # Legacy/compat Messenger-like shape
        for event in entry.get("messaging", []) or []:
            if event.get("message"):
                yield {
                    "source": "legacy",
                    "entry": entry,
                    "event": event,
                    "message": event.get("message") or {},
                }


async def handle_whatsapp_webhook(request: Request) -> Dict[str, Any]:
    """
    Receive WhatsApp webhook events and forward into the unified inbound gateway.

    SECURITY INVARIANTS:
    1. Authentication: Fail-closed signature verification against raw body.
    2. Replay Protection: Validates event timestamp within bounded 5-minute window.
    3. Deduplication: Rejects already-processed provider message IDs.
    4. Account Binding: Resolves external sender phone to a registered MITRA user_id.
       Unresolved events FAIL CLOSED and are quarantined; never triggers assistant.
    5. Delivery Statuses: Acknowledges delivery status receipts without triggering assistant.
    """
    try:
        raw_body = await request.body()
        if not _verify_whatsapp_webhook(request, raw_body):
            return {"status": "rejected", "reason": "webhook_verification_failed"}

        try:
            payload: Dict[str, Any] = json.loads(raw_body.decode("utf-8") or "{}")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {str(exc)}") from exc

        messages = list(_iter_whatsapp_messages(payload))
        if not messages:
            return {"status": "ignored", "reason": "no_message_events"}

        processed = []
        ignored = []

        for item in messages:
            source = item.get("source")

            # 1. Delivery Status Receipt Handling (Acknowledge and Track)
            if source == "status":
                status_item = item.get("status_item") or {}
                msg_id = status_item.get("id")
                deliv_status = status_item.get("status")
                recip_id = status_item.get("recipient_id")
                errors = status_item.get("errors")

                receipt_record = {
                    "message_id": msg_id,
                    "delivery_status": deliv_status,
                    "recipient_id": recip_id,
                    "timestamp": status_item.get("timestamp"),
                    "received_at": datetime.utcnow().isoformat(),
                    "errors": errors,
                    "raw": status_item,
                }

                if msg_id:
                    with _RECEIPTS_LOCK:
                        _DELIVERY_RECEIPTS[msg_id] = receipt_record

                try:
                    db = _get_db()
                    if db is not None and msg_id:
                        db["whatsapp_delivery_receipts"].update_one(
                            {"message_id": msg_id},
                            {"$set": receipt_record},
                            upsert=True
                        )
                        # Also update corresponding pending_action or communication record if found
                        db["pending_communication_actions"].update_one(
                            {"$or": [{"result.message_id": msg_id}, {"result.provider_message_id": msg_id}]},
                            {"$set": {"delivery_state": deliv_status, "delivery_updated_at": datetime.utcnow().isoformat()}}
                        )
                except Exception as db_exc:
                    logger.debug(f"Could not persist WhatsApp delivery receipt to DB: {db_exc}")

                ignored.append({
                    "reason": "status_update_acknowledged",
                    "status": deliv_status,
                    "recipient_id": recip_id,
                    "message_id": msg_id,
                })
                continue

            # Lifecycle / Coexistence account updates
            if source == "account_update":
                update_data = item.get("account_update") or {}
                event_name = update_data.get("event") or "UNKNOWN"
                phone_num = update_data.get("phone_number")
                logger.info("WhatsApp account_update event received: %s for %s", event_name, phone_num)
                ignored.append({
                    "reason": f"account_update_{event_name.lower()}",
                    "event": event_name,
                    "phone_number": phone_num,
                })
                continue

            message = item.get("message") or {}

            # 2. Extract and Validate Provider Message ID (Deduplication)
            event_id = message.get("id") or message.get("MessageSid")
            if not event_id and source == "legacy":
                event_id = (item.get("event") or {}).get("message", {}).get("mid")

            if not event_id:
                logger.warning("WhatsApp message rejected: missing provider event ID.")
                ignored.append({"reason": "missing_event_id"})
                continue

            # Atomic deduplication check
            if not webhook_dedup_service.check_and_record("whatsapp", event_id):
                logger.warning("WhatsApp duplicate event ignored: %s", event_id)
                ignored.append({"reason": "duplicate_event_ignored", "event_id": event_id})
                continue

            # 3. Timestamp Replay Window Validation
            raw_ts = message.get("timestamp")
            if not raw_ts and source == "legacy":
                raw_ts = (item.get("event") or {}).get("timestamp")

            is_valid_ts, ts_reason = _validate_event_timestamp(raw_ts)
            if not is_valid_ts:
                logger.warning("WhatsApp message timestamp invalid/expired: %s (%s)", raw_ts, ts_reason)
                ignored.append({"reason": ts_reason or "invalid_timestamp", "event_id": event_id})
                continue

            # 4. SMB Message Echo Handling (Human replies from mobile WhatsApp Business app)
            if source == "smb_echo":
                msg_type = message.get("type")
                if msg_type != "text":
                    ignored.append({"reason": f"unsupported_message_type:{msg_type}", "event_id": event_id})
                    continue
                text_body = (message.get("text") or {}).get("body")
                if not text_body:
                    ignored.append({"reason": "missing_text_body", "event_id": event_id})
                    continue

                value = item.get("value") or {}
                meta = value.get("metadata") or {}
                customer_phone = message.get("to")
                business_phone = message.get("from") or meta.get("display_phone_number")

                resolved_user_id = inbound_account_resolver.resolve_user_id(
                    platform="whatsapp",
                    sender_identity=business_phone,
                    recipient_identity=customer_phone,
                    metadata=meta,
                )

                # Persist to companion session / conversation history if account resolved
                if resolved_user_id:
                    try:
                        from app.companion.companion_session import session_manager
                        await session_manager.get_or_create(
                            user_id=resolved_user_id,
                            platform="whatsapp",
                            device="whatsapp_business_app"
                        )
                        await session_manager.add_turn(
                            user_id=resolved_user_id,
                            role="assistant",
                            content=text_body
                        )
                    except Exception as exc:
                        logger.warning("Failed appending smb_echo to session_manager: %s", exc)

                # Invariant: NEVER invoke assistant / process_message for smb_echo
                ignored.append({
                    "reason": "smb_echo_recorded",
                    "event_id": event_id,
                    "to": customer_phone,
                    "from": business_phone,
                    "resolved_user_id": resolved_user_id,
                })
                continue

            # 5. Message Content Extraction
            if source == "cloud":
                msg_type = message.get("type")
                if msg_type != "text":
                    ignored.append({"reason": f"unsupported_message_type:{msg_type}", "event_id": event_id})
                    continue
                text_body = (message.get("text") or {}).get("body")
                if not text_body:
                    ignored.append({"reason": "missing_text_body", "event_id": event_id})
                    continue

                value = item.get("value") or {}
                contacts = value.get("contacts") or []
                sender_phone = message.get("from") or (contacts[0].get("wa_id") if contacts else "")

                # 5. User / Account Binding (Zero Trust on External sender_id)
                resolved_user_id = inbound_account_resolver.resolve_user_id(
                    platform="whatsapp",
                    sender_identity=sender_phone,
                    metadata=value.get("metadata"),
                )
                if not resolved_user_id:
                    logger.warning(
                        "WhatsApp sender '%s' not associated with any MITRA user account (fail closed / quarantined).",
                        sender_phone,
                    )
                    ignored.append({
                        "reason": "unresolved_account",
                        "event_id": event_id,
                        "sender": sender_phone,
                        "message": "Sender is not bound to any registered MITRA user.",
                    })
                    continue

                result = await process_message(
                    platform="whatsapp",
                    user_id=resolved_user_id,
                    message=text_body,
                    timestamp=_to_iso_timestamp(raw_ts),
                    metadata={
                        "provider": "whatsapp",
                        "source": "cloud",
                        "message_id": event_id,
                        "sender_phone": sender_phone,
                        "resolved_user_id": resolved_user_id,
                        "contacts": contacts,
                        "metadata": value.get("metadata"),
                        "event": item,
                    },
                    device="mobile",
                    preferred_language="auto",
                    voice_input=False,
                )
                processed.append(result)
                continue

            # Legacy webhook payloads
            if source == "legacy":
                text_value = message.get("text")
                if isinstance(text_value, dict):
                    text_value = text_value.get("body")
                if not text_value:
                    ignored.append({"reason": "missing_text_body", "event_id": event_id})
                    continue

                event = item.get("event") or {}
                sender_phone = (event.get("sender") or {}).get("id", "")

                resolved_user_id = inbound_account_resolver.resolve_user_id(
                    platform="whatsapp",
                    sender_identity=sender_phone,
                    metadata=event,
                )
                if not resolved_user_id:
                    logger.warning(
                        "Legacy WhatsApp sender '%s' not associated with any MITRA user account (fail closed).",
                        sender_phone,
                    )
                    ignored.append({
                        "reason": "unresolved_account",
                        "event_id": event_id,
                        "sender": sender_phone,
                        "message": "Sender is not bound to any registered MITRA user.",
                    })
                    continue

                result = await process_message(
                    platform="whatsapp",
                    user_id=resolved_user_id,
                    message=str(text_value),
                    timestamp=_to_iso_timestamp(raw_ts),
                    metadata={
                        "provider": "whatsapp",
                        "source": "legacy",
                        "message_id": event_id,
                        "sender_phone": sender_phone,
                        "resolved_user_id": resolved_user_id,
                        "event": event,
                    },
                    device="mobile",
                    preferred_language="auto",
                    voice_input=False,
                )
                processed.append(result)

        if not processed:
            # Check reasons to return accurate non-execution status
            first_reason = ignored[0].get("reason") if ignored else "no_supported_messages"
            if first_reason == "unresolved_account":
                return {"status": "quarantined", "reason": "unresolved_account", "ignored": ignored}
            elif first_reason == "duplicate_event_ignored":
                return {"status": "duplicate", "reason": "duplicate_event_ignored", "ignored": ignored}
            elif first_reason in ("event_timestamp_expired", "event_timestamp_future"):
                return {"status": "rejected", "reason": first_reason, "ignored": ignored}
            elif first_reason == "status_update_acknowledged":
                return {"status": "acknowledged", "reason": "status_update_acknowledged", "ignored": ignored}
            elif first_reason == "smb_echo_recorded":
                return {"status": "acknowledged", "reason": "smb_echo_recorded", "ignored": ignored}
            elif first_reason.startswith("account_update_"):
                return {"status": "acknowledged", "reason": first_reason, "ignored": ignored}
            return {"status": "ignored", "reason": first_reason, "ignored": ignored}

        return {
            "status": "processed",
            "count": len(processed),
            "trace_id": processed[0].get("trace_id"),
            "processed_at": datetime.utcnow().isoformat(),
            "ignored": ignored,
        }
    except Exception as exc:
        logger.error("Error in handle_whatsapp_webhook: %s", exc)
        raise HTTPException(status_code=500, detail=f"Webhook processing error: {str(exc)}") from exc
