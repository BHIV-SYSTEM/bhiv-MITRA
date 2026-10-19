"""
meta_whatsapp_executor.py — Official Meta WhatsApp Business Platform / Cloud API Executor
Production-grade integration for sending text & template messages via Meta Graph API v19.0+.
"""

import os
import re
import json
import logging
import requests
from typing import Dict, Any, Optional
from datetime import datetime
from urllib.parse import quote

logger = logging.getLogger(__name__)

# Standard E.164 phone normalization regex
PHONE_CLEAN_REGEX = re.compile(r"[^\d+]")


def normalize_e164_phone(phone: str, default_country_code: str = "91") -> Dict[str, Any]:
    """
    Validates and normalizes phone number to international E.164 format.
    Returns:
        dict: {"valid": bool, "e164": str, "formatted": str, "digits_only": str, "error": Optional[str]}
    """
    if not phone or not str(phone).strip():
        return {
            "valid": False,
            "e164": "",
            "formatted": "",
            "digits_only": "",
            "error": "Phone number is required."
        }

    cleaned = PHONE_CLEAN_REGEX.sub("", str(phone).strip())

    # Strip leading zeros
    if cleaned.startswith("0"):
        cleaned = cleaned.lstrip("0")

    # If starts with '+', remove for digits_only
    if cleaned.startswith("+"):
        digits = cleaned[1:]
    else:
        digits = cleaned

    # Auto-prefix default country code for standard 10-digit Indian numbers
    if len(digits) == 10 and digits[0] in "6789" and default_country_code == "91":
        digits = "91" + digits

    # E.164 length check: min 7 digits (small island territories), max 15 digits (ITU-T E.164 standard)
    if len(digits) < 7 or len(digits) > 15:
        return {
            "valid": False,
            "e164": "",
            "formatted": "",
            "digits_only": digits,
            "error": f"Invalid phone number length ({len(digits)} digits). Must be 7-15 digits with country code."
        }

    e164 = f"+{digits}"
    
    # User-friendly display format
    if digits.startswith("91") and len(digits) == 12:
        formatted = f"+91 {digits[2:7]} {digits[7:]}"
    elif digits.startswith("1") and len(digits) == 11:
        formatted = f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    else:
        formatted = e164

    return {
        "valid": True,
        "e164": e164,
        "formatted": formatted,
        "digits_only": digits,
        "clean_digits": digits,
        "error": None
    }


def generate_personal_wa_link(phone: str, message: str, default_country_code: str = "91") -> Dict[str, Any]:
    """
    Generates official WhatsApp Click to Chat URL:
    https://wa.me/<international_number>?text=<URL_encoded_message>
    
    Includes safety disclaimers regarding manual transmission.
    """
    norm = normalize_e164_phone(phone, default_country_code=default_country_code)
    if not norm["valid"]:
        return {
            "status": "error",
            "error": norm["error"],
            "url": None
        }

    clean_message = (message or "").strip()
    # RFC 3986 safe URL encoding
    encoded_text = quote(clean_message, safe="")

    wa_url = f"https://wa.me/{norm['digits_only']}?text={encoded_text}"

    return {
        "status": "ready",
        "phone_e164": norm["e164"],
        "formatted_phone": norm["formatted"],
        "digits_only": norm["digits_only"],
        "message": clean_message,
        "encoded_text": encoded_text,
        "url": wa_url,
        "notice": "Opening WhatsApp pre-fills your draft. You must manually review and tap 'Send' in WhatsApp. MITRA cannot verify personal delivery.",
        "mode": "personal",
        "manual_send_required": True,
        "delivery_verifiable": False
    }


class UnsafeCoexistenceOperationError(RuntimeError):
    """Raised when an API call attempts to execute registration or deregistration on a Coexistence number."""
    pass


FORBIDDEN_COEXISTENCE_PATTERNS = [
    re.compile(r"/(?:de)?register\b", re.IGNORECASE),
    re.compile(r"/(?:request_code|verify_code)\b", re.IGNORECASE),
]


def assert_safe_whatsapp_endpoint(endpoint_path_or_url: str) -> None:
    """
    Validates endpoint construction at the API boundary.
    Strictly forbids registration, deregistration, and 2FA migration calls
    that would terminate the active WhatsApp Business mobile app session.
    """
    clean_url = str(endpoint_path_or_url or "").strip()
    for pattern in FORBIDDEN_COEXISTENCE_PATTERNS:
        if pattern.search(clean_url):
            raise UnsafeCoexistenceOperationError(
                f"CRITICAL SAFEGUARD BLOCKED: Endpoint '{clean_url}' is strictly forbidden in Coexistence mode. "
                "Registration or deregistration calls sever the active WhatsApp Business mobile app session."
            )


class MetaWhatsAppExecutor:
    """
    Official Meta WhatsApp Business Platform / Cloud API Client.
    Executes messages strictly from authorized Meta Business Accounts.
    """

    def __init__(self):
        self.api_version = os.getenv("META_WA_API_VERSION", "v19.0")
        self.graph_base_url = f"https://graph.facebook.com/{self.api_version}"
        self.system_access_token = (
            os.getenv("META_WA_ACCESS_TOKEN")
            or os.getenv("WHATSAPP_CLOUD_ACCESS_TOKEN")
            or os.getenv("WHATSAPP_ACCESS_TOKEN")
            or ""
        ).strip()
        self.system_phone_number_id = (
            os.getenv("META_WA_PHONE_NUMBER_ID")
            or os.getenv("WHATSAPP_CLOUD_PHONE_NUMBER_ID")
            or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
            or ""
        ).strip()
        self.system_waba_id = (
            os.getenv("META_WA_WABA_ID")
            or os.getenv("WHATSAPP_CLOUD_WABA_ID")
            or os.getenv("WHATSAPP_WABA_ID")
            or ""
        ).strip()

    def _execute_graph_post(
        self,
        phone_id: str,
        subpath: str,
        payload: Dict[str, Any],
        token: str
    ) -> requests.Response:
        """
        Shared API boundary for all Meta WhatsApp Graph API POST requests.
        Enforces safety assertions and strict endpoint validation before any network request.
        """
        endpoint = f"/{phone_id}/{subpath.lstrip('/')}"
        assert_safe_whatsapp_endpoint(endpoint)

        url = f"{self.graph_base_url}/{phone_id}/{subpath.lstrip('/')}"
        assert_safe_whatsapp_endpoint(url)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        return requests.post(url, json=payload, headers=headers, timeout=12)

    def get_credentials(self, user_id: Optional[str] = None) -> Dict[str, str]:
        """
        Retrieves credentials prioritizing connected user account, falling back to system environment.
        """
        if user_id and user_id.lower() not in ("user_default", "default", "none"):
            try:
                from app.services.connected_account_service import connected_account_service
                conn = connected_account_service.get_user_connection(
                    user_id=user_id,
                    provider="whatsapp_business",
                    include_decrypted_tokens=True
                )
                if conn and conn.get("status") in ("connected", "active"):
                    extra = conn.get("extra_data") or {}
                    return {
                        "access_token": conn.get("access_token") or self.system_access_token,
                        "phone_number_id": extra.get("phone_number_id") or conn.get("provider_account_id") or self.system_phone_number_id,
                        "waba_id": extra.get("waba_id") or self.system_waba_id,
                        "source": "user_connected_account"
                    }
            except Exception as e:
                logger.warning(f"Error reading user WhatsApp credentials: {e}")

        return {
            "access_token": self.system_access_token,
            "phone_number_id": self.system_phone_number_id,
            "waba_id": self.system_waba_id,
            "source": "system_env" if self.system_access_token else "none"
        }

    def send_text_message(
        self,
        to_phone: str,
        message: str,
        user_id: Optional[str] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends free-form text message via Meta Cloud API within 24-hour service window.
        """
        norm = normalize_e164_phone(to_phone)
        if not norm["valid"]:
            return {
                "status": "error",
                "error": norm["error"],
                "error_code": "INVALID_PHONE_NUMBER"
            }

        creds = self.get_credentials(user_id=user_id)
        token = creds["access_token"]
        phone_id = creds["phone_number_id"]

        if not token or not phone_id:
            return {
                "status": "error",
                "error": "Meta WhatsApp Cloud API credentials not configured. Please configure Phone Number ID and Access Token in Settings.",
                "error_code": "CREDENTIALS_MISSING",
                "mode": "business"
            }

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": norm["digits_only"],
            "type": "text",
            "text": {
                "preview_url": True,
                "body": message.strip()
            }
        }

        try:
            resp = self._execute_graph_post(phone_id, "messages", payload, token)
            res_json = resp.json()

            if resp.status_code in (200, 201):
                messages = res_json.get("messages", [])
                wamid = messages[0].get("id") if messages else None
                return {
                    "status": "success",
                    "delivery_state": "pending",
                    "platform": "whatsapp",
                    "mode": "business",
                    "message_id": wamid,
                    "recipient": norm["formatted"],
                    "recipient_e164": norm["e164"],
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "source": creds["source"]
                }
            else:
                error_info = res_json.get("error", {})
                raw_msg = error_info.get("message") or f"Meta Cloud API returned HTTP {resp.status_code}"
                code = error_info.get("code")
                error_subcode = error_info.get("error_subcode")
                fbtrace_id = error_info.get("fbtrace_id")
                
                # Specialized error classifications
                if code in (190, 102):
                    err_code = "META_AUTH_ERROR_190"
                    user_friendly_msg = (
                        "Meta WhatsApp Cloud API Authentication Error (Code 190): "
                        "Access token is expired, invalid, or revoked. "
                        "Please update META_WA_ACCESS_TOKEN in backend/.env or reconnect your Meta WhatsApp Business account in Settings."
                    )
                elif code == 131047:
                    err_code = "META_24H_WINDOW_EXPIRED"
                    user_friendly_msg = (
                        "24-Hour Customer Service Window Closed (Code 131047): "
                        "More than 24 hours have passed since this recipient last messaged your WhatsApp Business number. "
                        "Meta Cloud API policy prohibits free-form text outside the 24-hour window. "
                        "You must initiate the conversation using an approved Meta message template (e.g. 'hello_world')."
                    )
                elif code in (131030, 131026):
                    err_code = "META_RECIPIENT_INELIGIBLE"
                    user_friendly_msg = (
                        f"Recipient {norm['formatted']} is ineligible (Code {code}): "
                        "Phone number is not on WhatsApp or, if using a Meta Test number, recipient is not added to the To list in Meta App Dashboard."
                    )
                elif code in (80007, 130429):
                    err_code = "META_RATE_LIMITED"
                    user_friendly_msg = "Meta WhatsApp Cloud API rate limit reached. Please retry after a few minutes."
                else:
                    err_code = f"META_API_ERROR_{code}" if code else "META_API_ERROR"
                    user_friendly_msg = raw_msg

                return {
                    "status": "error",
                    "error": user_friendly_msg,
                    "raw_error": raw_msg,
                    "error_code": err_code,
                    "meta_code": code,
                    "meta_subcode": error_subcode,
                    "fbtrace_id": fbtrace_id,
                    "details": error_info,
                    "mode": "business"
                }

        except Exception as exc:
            logger.error(f"Meta Cloud API network failure: {exc}")
            return {
                "status": "error",
                "error": f"Network error contacting Meta Cloud API: {str(exc)}",
                "error_code": "NETWORK_FAILURE",
                "mode": "business"
            }

    def send_template_message(
        self,
        to_phone: str,
        template_name: str,
        language_code: str = "en_US",
        components: Optional[list] = None,
        user_id: Optional[str] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends approved Meta message template (required to initiate conversations outside 24h window).
        """
        norm = normalize_e164_phone(to_phone)
        if not norm["valid"]:
            return {"status": "error", "error": norm["error"], "error_code": "INVALID_PHONE_NUMBER"}

        creds = self.get_credentials(user_id=user_id)
        token = creds["access_token"]
        phone_id = creds["phone_number_id"]

        if not token or not phone_id:
            return {
                "status": "error",
                "error": "Meta credentials missing.",
                "error_code": "CREDENTIALS_MISSING"
            }

        payload = {
            "messaging_product": "whatsapp",
            "to": norm["digits_only"],
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": components or []
            }
        }

        try:
            resp = self._execute_graph_post(phone_id, "messages", payload, token)
            res_json = resp.json()
            if resp.status_code in (200, 201):
                messages = res_json.get("messages", [])
                wamid = messages[0].get("id") if messages else None
                return {
                    "status": "success",
                    "delivery_state": "pending",
                    "mode": "business",
                    "message_id": wamid,
                    "recipient": norm["formatted"],
                    "template": template_name,
                    "trace_id": trace_id
                }
            else:
                error_info = res_json.get("error", {})
                code = error_info.get("code")
                raw_msg = error_info.get("message") or "Meta template dispatch failed"
                if code in (190, 102):
                    err_code = "META_AUTH_ERROR_190"
                    user_msg = "Meta WhatsApp Cloud API Authentication Error (Code 190): Access token expired or invalid."
                else:
                    err_code = f"META_API_ERROR_{code}" if code else "META_API_ERROR"
                    user_msg = raw_msg
                return {
                    "status": "error",
                    "error": user_msg,
                    "raw_error": raw_msg,
                    "error_code": err_code,
                    "details": error_info
                }
        except Exception as exc:
            return {"status": "error", "error": str(exc), "error_code": "NETWORK_FAILURE"}
