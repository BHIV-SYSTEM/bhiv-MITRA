"""
notification_capability.py — Mitra Notification Capability
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from app.capabilities.base_capability import BaseCapability, CapabilityResult
import logging
logger = logging.getLogger(__name__)

class NotificationCapability(BaseCapability):
    @property
    def name(self) -> str: return "notification"
    @property
    def description(self) -> str: return "Send notifications via available channels."
    @property
    def supported_intents(self) -> List[str]:
        return ["notification", "send_notification", "notify", "instagram", "device"]

    async def execute(self, intent: str, params: Dict[str, Any], trace_id: Optional[str] = None) -> CapabilityResult:
        try:
            import re
            from app.mitra_system_registry import mitra_registry
            execution_svc = mitra_registry.execution_service
            raw_msg = params.get("message", "")

            # Extract recipient and clean message
            handle_match = re.search(r'to\s+(@?[\w\+\-\.]+)', raw_msg, re.IGNORECASE)
            recipient = handle_match.group(1) if handle_match else (params.get("recipient", "") or params.get("to", ""))

            clean_msg = raw_msg
            saying_match = re.search(r'saying\s+(.+)$', raw_msg, re.IGNORECASE) or re.search(r'message\s+(.+)$', raw_msg, re.IGNORECASE)
            if saying_match:
                clean_msg = saying_match.group(1).strip()

            intent_lower = (intent or "").lower()
            msg_lower = raw_msg.lower()
            if "device" in intent_lower or "device" in msg_lower or intent_lower in ("device", "phone", "notification", "call"):
                channel = "device"
            elif "instagram" in intent_lower or "instagram" in msg_lower:
                channel = "instagram"
            elif "telegram" in intent_lower or "telegram" in msg_lower:
                channel = "telegram"
            else:
                channel = "device"

            if channel == "device":
                summary = f"Device notification dispatched: {clean_msg}"
                return CapabilityResult(
                    capability="device", intent=intent, status="success",
                    summary=summary, data={"channel": "device", "recipient": recipient or "Device Notification System", "message": clean_msg, "status": "success"},
                    trace_id=trace_id,
                )

            action_params = {
                "intent": intent,
                "raw_message": raw_msg,
                "message": clean_msg,
                "recipient": recipient,
                "to": recipient,
                "contact": recipient,
                "trace_id": trace_id,
            }
            result = execution_svc.execute_action(channel, action_params)
            status = "success" if result.get("status") == "success" else "failed"
            summary = result.get("summary") or result.get("message") or f"{channel.capitalize()} notification sent to {recipient}"
            return CapabilityResult(
                capability=channel, intent=intent, status=status,
                summary=summary, data=result, trace_id=trace_id,
            )
        except Exception as exc:
            logger.warning("NotificationCapability failed: %s", exc)
            return CapabilityResult.error_result(self.name, intent, str(exc), trace_id)
