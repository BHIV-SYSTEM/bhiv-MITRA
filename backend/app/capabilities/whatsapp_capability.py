"""
whatsapp_capability.py — Mitra WhatsApp Capability
"""
from __future__ import annotations
import re
from typing import Any, Dict, List, Optional
from app.capabilities.base_capability import BaseCapability, CapabilityResult
import logging
logger = logging.getLogger(__name__)

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
            contact = entities.get("contact", "") or params.get("contact", "")
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

            # Contact / Recipient extraction
            if not contact and raw_message:
                # Check for Telegram handle (@user), Instagram handle (@user), or phone number
                handle_match = re.search(r'to\s+(@[\w\+\-\.]+)', raw_message, re.IGNORECASE)
                phone_match = re.search(r'(\+?\d[\d\s\-]{7,15}\d)', raw_message)
                to_num_match = re.search(r'to\s+([\d\s\+\-]{7,16})', raw_message, re.IGNORECASE)
                if handle_match:
                    contact = handle_match.group(1)
                elif phone_match:
                    contact = re.sub(r'[^\d\+]', '', phone_match.group(1))
                elif to_num_match:
                    contact = re.sub(r'[^\d\+]', '', to_num_match.group(1))
                else:
                    handle_any = re.search(r'to\s+([^\s]+)', raw_message, re.IGNORECASE)
                    if handle_any:
                        contact = handle_any.group(1)

            # Message body extraction (strip "Send Telegram message to @user saying ")
            clean_message = raw_message
            saying_match = re.search(r'saying\s+(.+)$', raw_message, re.IGNORECASE)
            msg_prefix_match = re.search(r'message\s+(.+)$', raw_message, re.IGNORECASE)
            if saying_match:
                clean_message = saying_match.group(1).strip()
            elif msg_prefix_match:
                clean_message = msg_prefix_match.group(1).strip()

            # Check explicit recipient in params
            if not contact and params.get("recipient"):
                contact = params.get("recipient")
            elif not contact and params.get("to"):
                contact = params.get("to")

            action_params = {
                "intent": intent,
                "raw_message": raw_message,
                "message": clean_message,
                "content": clean_message,
                "to": contact,
                "recipient": contact,
                "contact": contact,
                "user_id": str(user_id).strip() if user_id else "user_default",
                "trace_id": trace_id,
                "account_id": params.get("account_id"),
                "idempotency_key": params.get("idempotency_key"),
                "confirmation_confirmed": bool(params.get("confirmation_confirmed", False)),
                "mode": params.get("mode", "personal"),
                "is_system_action": False,
                "is_system_otp": False,
            }

            result = execution_svc.execute_action(action_type, action_params, trace_id=trace_id or "auto")

            if result.get("status") == "confirmation_required":
                return CapabilityResult(
                    capability=action_type,
                    intent=intent,
                    status="pending",
                    summary=result.get("message") or f"Confirmation required before sending {action_type.capitalize()} message to {contact}.",
                    data=result,
                    actions=[
                        {"label": "Send Now", "action": f"Confirm send {action_type.capitalize()} to {contact}"},
                        {"label": "Cancel", "action": "Cancel"}
                    ],
                    trace_id=trace_id,
                )
            elif result.get("status") in ("success", "sent", "accepted", "ready"):
                summary = (
                    result.get("summary")
                    or result.get("note")
                    or result.get("message")
                    or f"{action_type.capitalize()} message prepared for {contact}"
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
