"""
whatsapp_capability.py — Mitra WhatsApp Capability
Handles natural-language WhatsApp, Telegram, and Instagram requests.
Enforces authorized contact resolution, ITU-T E.164 phone normalization,
Meta Business Cloud API mode selection, and strict HITL confirmation staging.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from app.capabilities.base_capability import BaseCapability, CapabilityResult
from app.services.authorized_contact_resolver import authorized_contact_resolver
from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor

logger = logging.getLogger(__name__)


def extract_messaging_entities(raw_message: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts (recipient, message_content) from natural language instructions.
    
    Supported formats:
    - "Send WhatsApp message to +91 91363 98133: Hello world" -> ("+91 91363 98133", "Hello world")
    - "Send WhatsApp message to Ashwini: Let's meet at 5" -> ("Ashwini", "Let's meet at 5")
    - "Send WhatsApp to Mom saying dinner is ready" -> ("Mom", "dinner is ready")
    - "Send WhatsApp to 9136398133 'Meeting confirmed'" -> ("9136398133", "Meeting confirmed")
    - "WhatsApp +91 91363 98133: Test message" -> ("+91 91363 98133", "Test message")
    """
    if not raw_message or not str(raw_message).strip():
        return None, None

    msg = raw_message.strip()

    # Pattern 1: Colon separator -> "to <recipient>: <message>" or "<platform> <recipient>: <message>"
    colon_match = re.search(
        r'(?:send\s+)?(?:a\s+)?(?:whatsapp|telegram|instagram|wa|tg)?(?:\s+message|\s+dm)?\s+to\s+([^:]+?):\s*(.+)$',
        msg,
        re.IGNORECASE
    )
    if colon_match:
        return colon_match.group(1).strip(), colon_match.group(2).strip()

    prefix_colon = re.search(
        r'^(?:whatsapp|telegram|instagram|wa|tg)\s+([^:]+?):\s*(.+)$',
        msg,
        re.IGNORECASE
    )
    if prefix_colon:
        return prefix_colon.group(1).strip(), prefix_colon.group(2).strip()

    # Pattern 2: "saying <message>"
    saying_match = re.search(
        r'(?:send\s+)?(?:a\s+)?(?:whatsapp|telegram|instagram|wa|tg)?(?:\s+message|\s+dm)?\s+to\s+(.+?)\s+saying\s+(.+)$',
        msg,
        re.IGNORECASE
    )
    if saying_match:
        return saying_match.group(1).strip(), saying_match.group(2).strip()

    # Pattern 3: Quotes -> "to <recipient> '<message>'"
    quotes_match = re.search(
        r'(?:send\s+)?(?:a\s+)?(?:whatsapp|telegram|instagram|wa|tg)?(?:\s+message|\s+dm)?\s+to\s+(.+?)\s+[\'"](.+)[\'"]$',
        msg,
        re.IGNORECASE
    )
    if quotes_match:
        return quotes_match.group(1).strip(), quotes_match.group(2).strip()

    # Pattern 4: "with message <message>"
    with_msg_match = re.search(
        r'(?:send\s+)?(?:a\s+)?(?:whatsapp|telegram|instagram|wa|tg)?(?:\s+message|\s+dm)?\s+to\s+(.+?)\s+(?:with\s+message|with\s+the\s+message|that)\s+(.+)$',
        msg,
        re.IGNORECASE
    )
    if with_msg_match:
        return with_msg_match.group(1).strip(), with_msg_match.group(2).strip()

    # Pattern 5: "to <recipient>" without body
    to_only = re.search(
        r'(?:send\s+)?(?:a\s+)?(?:whatsapp|telegram|instagram|wa|tg)?(?:\s+message|\s+dm)?\s+to\s+(.+)$',
        msg,
        re.IGNORECASE
    )
    if to_only:
        return to_only.group(1).strip(), None

    return None, None


class WhatsAppCapability(BaseCapability):
    @property
    def name(self) -> str:
        return "whatsapp"

    @property
    def description(self) -> str:
        return "Send WhatsApp, Telegram, and Instagram messages to contacts."

    @property
    def supported_intents(self) -> List[str]:
        return [
            "telegram", "whatsapp", "send_whatsapp", "send_telegram", "send_message",
            "instagram", "send_instagram", "SEND_MESSAGE", "DRAFT_MESSAGE", "READ_MESSAGES", "SEARCH_MESSAGES",
        ]

    async def execute(self, intent: str, params: Dict[str, Any], trace_id: Optional[str] = None) -> CapabilityResult:
        try:
            from app.mitra_system_registry import mitra_registry
            execution_svc = mitra_registry.execution_service
            raw_message = params.get("message", "")
            entities = params.get("entities", {})
            user_id = params.get("user_id", "user_default")

            # Determine platform action_type
            intent_lower = (intent or "").lower()
            msg_lower = (raw_message or "").lower()
            if "telegram" in intent_lower or "telegram" in msg_lower:
                action_type = "telegram"
            elif "instagram" in intent_lower or "instagram" in msg_lower:
                action_type = "instagram"
            else:
                action_type = "whatsapp"

            # ── 1. Structured Entity Extraction ──
            extracted_recipient, extracted_body = extract_messaging_entities(raw_message)

            contact = (
                params.get("recipient")
                or params.get("to")
                or entities.get("contact")
                or params.get("contact")
                or extracted_recipient
                or ""
            )
            clean_message = (
                params.get("content")
                or params.get("body")
                or extracted_body
                or ""
            )

            # Fallback legacy extraction if still empty
            if not contact and raw_message:
                handle_match = re.search(r'to\s+(@[\w\+\-\.]+)', raw_message, re.IGNORECASE)
                phone_match = re.search(r'(\+?\d[\d\s\-]{7,15}\d)', raw_message)
                if handle_match:
                    contact = handle_match.group(1)
                elif phone_match:
                    contact = phone_match.group(1)

            if not clean_message and raw_message:
                saying_match = re.search(r'saying\s+(.+)$', raw_message, re.IGNORECASE)
                if saying_match:
                    clean_message = saying_match.group(1).strip()

            # ── 2. Authorized Contact Resolution (Zero Guessing) ──
            contact_name = None
            display_label = contact
            resolved_phone = contact

            if action_type == "whatsapp":
                if not contact:
                    return CapabilityResult(
                        capability=action_type,
                        intent=intent,
                        status="failed",
                        summary="Recipient phone number or contact name is required. Example: 'Send WhatsApp message to +91 91363 98133: Hello'",
                        error="Missing recipient.",
                        data={"status": "missing_recipient"},
                        trace_id=trace_id,
                    )

                resolver_res = authorized_contact_resolver.resolve_recipient(contact, user_id=user_id)

                if resolver_res["status"] == "ambiguous":
                    matches = resolver_res.get("matches", [])
                    actions = [
                        {
                            "label": f"Send to {m['name']}",
                            "action": f"Send WhatsApp message to {m['phone']}: {clean_message or 'Hello'}"
                        }
                        for m in matches
                    ]
                    return CapabilityResult(
                        capability=action_type,
                        intent=intent,
                        status="pending",
                        summary=resolver_res["message"],
                        data={
                            "status": "ambiguous_contact",
                            "query": contact,
                            "matches": matches,
                            "clean_message": clean_message,
                            "message": resolver_res["message"]
                        },
                        actions=actions,
                        trace_id=trace_id,
                    )

                elif resolver_res["status"] == "not_found":
                    return CapabilityResult(
                        capability=action_type,
                        intent=intent,
                        status="failed",
                        summary=resolver_res["message"],
                        error=resolver_res["message"],
                        data={"status": "contact_not_found", "query": contact},
                        trace_id=trace_id,
                    )

                elif resolver_res["status"] == "error":
                    return CapabilityResult(
                        capability=action_type,
                        intent=intent,
                        status="failed",
                        summary=resolver_res.get("error", "Invalid phone number."),
                        error=resolver_res.get("error", "Invalid phone number."),
                        data=resolver_res,
                        trace_id=trace_id,
                    )

                # Resolved successfully
                resolved_phone = resolver_res["phone"]
                display_label = resolver_res["display_label"]
                contact_name = resolver_res.get("name")

            if not clean_message:
                return CapabilityResult(
                    capability=action_type,
                    intent=intent,
                    status="failed",
                    summary=f"Please specify the message to send to {display_label}. Example: 'Send WhatsApp message to {display_label}: Hello'",
                    error="Message body is required.",
                    data={"status": "missing_message_body", "recipient": resolved_phone},
                    trace_id=trace_id,
                )

            # ── 3. Meta Business Cloud API Mode Selection ──
            meta_client = MetaWhatsAppExecutor()
            has_business_creds = bool(meta_client.get_credentials(user_id=user_id).get("access_token"))
            is_cloud_provider = (
                os.getenv("WHATSAPP_PROVIDER", "").strip().lower() == "cloud"
                or os.getenv("WHATSAPP_MODE", "").strip().lower() == "business"
            )

            preferred_mode = params.get("mode")
            if not preferred_mode:
                preferred_mode = "business" if (is_cloud_provider or has_business_creds) else "personal"

            action_params = {
                "intent": intent,
                "raw_message": raw_message,
                "message": clean_message,
                "content": clean_message,
                "to": resolved_phone,
                "recipient": resolved_phone,
                "contact": display_label,
                "contact_name": contact_name,
                "user_id": str(user_id).strip() if user_id else "user_default",
                "trace_id": trace_id,
                "account_id": params.get("account_id"),
                "idempotency_key": params.get("idempotency_key"),
                "confirmation_confirmed": bool(params.get("confirmation_confirmed", False)),
                "mode": preferred_mode,
                "metadata": {
                    "display_label": display_label,
                    "contact_name": contact_name,
                    "recipient_phone": resolved_phone,
                    "mode": preferred_mode,
                    "raw_message": raw_message,
                },
                "is_system_action": False,
                "is_system_otp": False,
            }

            result = execution_svc.execute_action(action_type, action_params, trace_id=trace_id or "auto")

            if result.get("status") == "confirmation_required":
                conf = result.get("confirmation") or {}
                pending_id = result.get("pending_action_id") or conf.get("pending_action_id")
                exact_msg = conf.get("content") or clean_message
                sender_acc = conf.get("sender_account") or meta_client.system_phone_number_id or "Meta WhatsApp Cloud API"

                summary = (
                    f"Confirmation required before sending WhatsApp message to {display_label}:\n"
                    f"\"{exact_msg}\""
                )

                # Enrich result for rich client rendering
                result["recipient_display"] = display_label
                result["recipient_phone"] = resolved_phone
                result["recipient_name"] = contact_name
                result["exact_message"] = exact_msg
                result["message"] = exact_msg
                result["content"] = exact_msg
                result["pending_action_id"] = pending_id
                result["sender_account"] = sender_acc
                result["mode"] = preferred_mode

                return CapabilityResult(
                    capability=action_type,
                    intent=intent,
                    status="pending",
                    summary=summary,
                    data=result,
                    actions=[
                        {"label": "Confirm & Send", "action": f"Confirm {pending_id}"},
                        {"label": "Cancel", "action": f"Cancel {pending_id}"}
                    ],
                    trace_id=trace_id,
                )
            elif result.get("status") in ("success", "sent", "accepted", "ready"):
                summary = (
                    result.get("summary")
                    or result.get("note")
                    or result.get("message")
                    or f"WhatsApp message dispatched to {display_label}."
                )
                wa_url = result.get("url") or (result.get("action") or {}).get("wa_url")
                card_actions = []
                if wa_url:
                    card_actions.append({"label": "Open in WhatsApp", "url": wa_url, "action": "open_wa"})
                return CapabilityResult(
                    capability=action_type,
                    intent=intent,
                    status="success",
                    summary=summary,
                    data=result,
                    actions=card_actions,
                    trace_id=trace_id,
                )
            else:
                err_msg = result.get("error") or result.get("message") or f"{action_type.capitalize()} execution failed"
                return CapabilityResult(
                    capability=action_type,
                    intent=intent,
                    status="failed",
                    summary=f"{action_type.capitalize()} failed: {err_msg}",
                    error=err_msg,
                    data=result,
                    trace_id=trace_id,
                )
        except Exception as exc:
            logger.warning("WhatsAppCapability failed: %s", exc)
            return CapabilityResult.error_result(self.name, intent, str(exc), trace_id)
