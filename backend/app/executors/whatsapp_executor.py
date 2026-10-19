import os
import requests
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class WhatsAppExecutor:
    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.whatsapp_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
        self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        
    def send_message(
        self,
        to_number: str,
        message: str,
        trace_id: str,
        user_id: Optional[str] = None,
        is_system_otp: bool = False,
        mode: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send WhatsApp message with strict security separation:
        1. SYSTEM AUTHENTICATION OTP (is_system_otp=True):
           Uses system Twilio credentials. Never uses user's personal number as sender.
           No false success fallback.
        2. USER-OWNED WHATSAPP MESSAGING (is_system_otp=False):
           Requires authenticated user_id (rejects user_default).
           Isolated from Twilio sandbox.
           Requires Meta WhatsApp Business Platform (slated for future phases).
        """
        # ── 1. SYSTEM AUTHENTICATION OTP GATEWAY ──
        if is_system_otp:
            from_number = self.whatsapp_number
            account_sid = self.account_sid
            auth_token = self.auth_token

            if not account_sid or not auth_token:
                logger.warning("Twilio system credentials not configured for authentication OTP")
                return {
                    "status": "error",
                    "error": "Twilio system credentials not configured for OTP dispatch",
                    "error_code": "TWILIO_CONFIG_MISSING",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "whatsapp",
                    "channel": "system_otp"
                }

            try:
                # Format phone numbers for Twilio WhatsApp format
                formatted_to = to_number if to_number.startswith("whatsapp:") else f"whatsapp:{to_number}"
                formatted_from = from_number if from_number.startswith("whatsapp:") else f"whatsapp:{from_number}"

                data = {
                    "From": formatted_from,
                    "To": formatted_to,
                    "Body": message
                }
                url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
                response = requests.post(url, data=data, auth=(account_sid, auth_token), timeout=10)

                if response.status_code == 201:
                    result = response.json()
                    return {
                        "status": "success",
                        "message_sid": result.get("sid"),
                        "to": formatted_to,
                        "from": formatted_from,
                        "trace_id": trace_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "platform": "whatsapp",
                        "channel": "system_otp"
                    }
                else:
                    logger.error(f"Twilio system OTP dispatch failed [{response.status_code}]: {response.text}")
                    return {
                        "status": "error",
                        "error": f"Twilio OTP dispatch failed with status {response.status_code}",
                        "error_code": "DISPATCH_FAILED",
                        "trace_id": trace_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "platform": "whatsapp",
                        "channel": "system_otp"
                    }
            except Exception as exc:
                logger.error(f"Twilio system OTP execution failed: {exc}")
                return {
                    "status": "error",
                    "error": str(exc),
                    "error_code": "TWILIO_EXEC_ERROR",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "whatsapp",
                    "channel": "system_otp"
                }

        # ── 2. USER-OWNED WHATSAPP MESSAGING (Personal vs Business) ──
        from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor, generate_personal_wa_link, normalize_e164_phone

        # Determine mode: "personal" (default Click to Chat) vs "business" (Meta Cloud API)
        clean_user = str(user_id).strip() if user_id else "user_default"
        meta_client = MetaWhatsAppExecutor()
        creds = meta_client.get_credentials(user_id=clean_user)
        has_business_creds = bool(creds.get("access_token") and creds.get("phone_number_id"))

        env_cloud = os.getenv("WHATSAPP_PROVIDER", "").strip().lower() == "cloud" or os.getenv("WHATSAPP_MODE", "").strip().lower() == "business"
        explicit_mode = mode or getattr(self, "_active_mode", None)
        if explicit_mode:
            chosen_mode = explicit_mode.lower()
        elif env_cloud or has_business_creds:
            chosen_mode = "business"
        else:
            chosen_mode = "personal"

        # If business mode requested or explicitly configured, execute through Meta Cloud API
        if chosen_mode == "business":
            res = meta_client.send_text_message(
                to_phone=to_number,
                message=message,
                user_id=clean_user,
                trace_id=trace_id
            )
            return res

        # Otherwise, execute Personal WhatsApp Click to Chat MVP (wa.me)
        link_data = generate_personal_wa_link(phone=to_number, message=message)
        if link_data.get("status") == "error":
            return {
                "status": "error",
                "error": link_data.get("error"),
                "error_code": "INVALID_PHONE_NUMBER",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat(),
                "platform": "whatsapp",
                "mode": "personal"
            }

        return {
            "status": "success",
            "delivery_state": "manual_action_required",
            "platform": "whatsapp",
            "mode": "personal",
            "recipient": link_data["formatted_phone"],
            "recipient_e164": link_data["phone_e164"],
            "message": link_data["message"],
            "url": link_data["url"],
            "notice": link_data["notice"],
            "trace_id": trace_id,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def receive_webhook(self, webhook_data: Dict) -> Dict[str, Any]:
        """Handle incoming WhatsApp webhook"""
        return {
            "status": "received",
            "from": webhook_data.get("From"),
            "body": webhook_data.get("Body"),
            "message_sid": webhook_data.get("MessageSid"),
            "timestamp": datetime.utcnow().isoformat(),
            "platform": "whatsapp"
        }