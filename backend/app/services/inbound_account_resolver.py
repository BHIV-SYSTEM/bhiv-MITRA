"""
backend/app/services/inbound_account_resolver.py — Inbound Account Resolution Service

Establishes an explicit security boundary between external provider identities
(phone numbers, email addresses, WhatsApp IDs) and internal MITRA user_ids.

SECURITY INVARIANTS:
1. FAIL CLOSED: If an external identity cannot be matched to a registered, verified
   user account, resolution returns None.
2. ZERO TRUST ON SENDER ID: External sender_id, phone number, or email MUST NEVER be
   used directly as a MITRA user_id.
3. UNRESOLVED EVENTS QUARANTINED: Unresolved webhook events must never trigger assistant
   orchestration or background execution.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from typing import Any, Dict, Optional
from pymongo import MongoClient

logger = logging.getLogger(__name__)

# Thread-safe in-memory cache/override for testing and mock environments
_TEST_ACCOUNT_MAPPINGS: Dict[str, str] = {}
_LOCK = threading.Lock()


def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.debug("MongoDB connection unavailable in InboundAccountResolver: %s", exc)
        return None


def normalize_phone_number(phone: Optional[str]) -> str:
    """Normalize phone numbers to E.164-compatible canonical string (+<digits>)."""
    if not phone or not isinstance(phone, str):
        return ""
    clean = phone.strip()
    if clean.lower().startswith("whatsapp:"):
        clean = clean[9:].strip()
    digits = re.sub(r"[^\d]", "", clean)
    if not digits:
        return ""
    return f"+{digits}"


def normalize_email_address(email: Optional[str]) -> str:
    """Normalize email address (lowercase, trimmed)."""
    if not email or not isinstance(email, str):
        return ""
    clean = email.strip().lower()
    # Extract email from format 'Name <user@domain.com>' if present
    match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", clean)
    if match:
        return match.group(0).lower()
    return clean


class InboundAccountResolver:
    """
    Authoritative account resolver for inbound communication events.
    Resolves external provider identities into verified MITRA user_ids.
    """

    def resolve_user_id(
        self,
        platform: str,
        sender_identity: Optional[str] = None,
        recipient_identity: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        """
        Resolve an external inbound event to an authenticated MITRA user_id.
        Returns None if no trusted binding exists (fail closed).
        """
        clean_platform = (platform or "").strip().lower()

        if clean_platform in ("whatsapp", "wa"):
            return self._resolve_whatsapp(sender_identity, recipient_identity, metadata)
        elif clean_platform in ("email", "mail"):
            return self._resolve_email(sender_identity, recipient_identity, metadata)
        elif clean_platform == "telegram":
            return self._resolve_telegram(sender_identity, metadata)

        logger.warning("InboundAccountResolver: unsupported platform '%s'", clean_platform)
        return None

    def _resolve_whatsapp(
        self,
        sender_phone: Optional[str],
        recipient_identity: Optional[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        norm_phone = normalize_phone_number(sender_phone)
        meta_dict = metadata or {}
        phone_number_id = str(meta_dict.get("phone_number_id") or "").strip()
        display_phone = normalize_phone_number(meta_dict.get("display_phone_number") or recipient_identity)

        # 1. Check in-memory test overrides (thread-safe)
        with _LOCK:
            if norm_phone:
                mem_key = f"whatsapp:{norm_phone}"
                if mem_key in _TEST_ACCOUNT_MAPPINGS:
                    return _TEST_ACCOUNT_MAPPINGS[mem_key]
                alt_key = f"whatsapp:{norm_phone.lstrip('+')}"
                if alt_key in _TEST_ACCOUNT_MAPPINGS:
                    return _TEST_ACCOUNT_MAPPINGS[alt_key]

            # Also check business phone_number_id and display_phone test overrides
            if phone_number_id:
                for k in (f"whatsapp_business:{phone_number_id}", f"whatsapp:{phone_number_id}"):
                    if k in _TEST_ACCOUNT_MAPPINGS:
                        return _TEST_ACCOUNT_MAPPINGS[k]
            if display_phone:
                for k in (f"whatsapp_business:{display_phone}", f"whatsapp:{display_phone}"):
                    if k in _TEST_ACCOUNT_MAPPINGS:
                        return _TEST_ACCOUNT_MAPPINGS[k]

        # 2. Check MongoDB connected_accounts
        db = _get_db()
        if db is not None:
            try:
                # Personal / direct sender match candidates
                candidates = []
                if norm_phone:
                    candidates.extend([norm_phone, norm_phone.lstrip("+")])
                if display_phone:
                    candidates.extend([display_phone, display_phone.lstrip("+")])

                or_clauses = []
                if candidates:
                    or_clauses.extend([
                        {"email": {"$in": candidates}},
                        {"provider_account_id": {"$in": candidates}},
                        {"phone_number": {"$in": candidates}},
                    ])
                if phone_number_id:
                    or_clauses.extend([
                        {"provider_account_id": phone_number_id},
                        {"extra_data.phone_number_id": phone_number_id},
                    ])

                if or_clauses:
                    record = db["connected_accounts"].find_one({
                        "provider": {"$in": ["whatsapp", "meta_whatsapp", "whatsapp_business"]},
                        "status": {"$in": ["connected", "active"]},
                        "$or": or_clauses
                    })
                    if record and record.get("user_id"):
                        uid = str(record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid

                # 3. Check user_integrations (verified WhatsApp number)
                if candidates:
                    ui_record = db["user_integrations"].find_one({
                        "$or": [
                            {"whatsapp.phone": {"$in": candidates}, "whatsapp.verified": True},
                            {"whatsapp.verified_phone": {"$in": candidates}},
                        ]
                    })
                    if ui_record and ui_record.get("user_id"):
                        uid = str(ui_record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid

                # 4. Check users collection
                if candidates:
                    u_record = db["users"].find_one({"phone": {"$in": candidates}})
                    if u_record and u_record.get("user_id"):
                        uid = str(u_record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid
            except Exception as exc:
                logger.error("Error querying database in InboundAccountResolver: %s", exc)

        # 5. Check environment fallback if configured
        env_phone_id = os.getenv("META_WA_PHONE_NUMBER_ID", "").strip()
        env_owner_uid = os.getenv("META_WA_OWNER_USER_ID", "").strip()
        if phone_number_id and env_phone_id and phone_number_id == env_phone_id and env_owner_uid:
            if env_owner_uid.lower() not in ("user_default", "default", "none", "null"):
                return env_owner_uid

        logger.info(
            "InboundAccountResolver: unresolved WhatsApp sender '%s' / phone_id '%s' (fail closed).",
            norm_phone or "none",
            phone_number_id or "none"
        )
        return None

    def _resolve_email(
        self,
        sender_email: Optional[str],
        recipient_email: Optional[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        norm_sender = normalize_email_address(sender_email)
        norm_recipient = normalize_email_address(recipient_email)

        # 1. Check in-memory test overrides
        with _LOCK:
            if norm_sender:
                mem_key = f"email:{norm_sender}"
                if mem_key in _TEST_ACCOUNT_MAPPINGS:
                    return _TEST_ACCOUNT_MAPPINGS[mem_key]
            if norm_recipient:
                recip_key = f"email:{norm_recipient}"
                if recip_key in _TEST_ACCOUNT_MAPPINGS:
                    return _TEST_ACCOUNT_MAPPINGS[recip_key]

        # 2. Check MongoDB connected_accounts (sender or recipient)
        db = _get_db()
        if db is not None:
            try:
                emails_to_check = [e for e in (norm_sender, norm_recipient) if e]
                if emails_to_check:
                    record = db["connected_accounts"].find_one({
                        "provider": {"$in": ["google", "microsoft", "gmail", "smtp", "email"]},
                        "status": {"$in": ["connected", "active"]},
                        "email": {"$in": emails_to_check}
                    })
                    if record and record.get("user_id"):
                        uid = str(record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid

                    # 3. Check user_integrations
                    ui_record = db["user_integrations"].find_one({
                        "$or": [
                            {"gmail.email": {"$in": emails_to_check}},
                            {"smtp.email": {"$in": emails_to_check}},
                        ]
                    })
                    if ui_record and ui_record.get("user_id"):
                        uid = str(ui_record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid

                    # 4. Check users collection
                    u_record = db["users"].find_one({"email": {"$in": emails_to_check}})
                    if u_record and u_record.get("user_id"):
                        uid = str(u_record["user_id"]).strip()
                        if uid and uid.lower() not in ("user_default", "default", "none", "null"):
                            return uid
            except Exception as exc:
                logger.error("Error querying database in InboundAccountResolver: %s", exc)

        logger.info(
            "InboundAccountResolver: unresolved email (sender='%s', recipient='%s') (fail closed).",
            norm_sender, norm_recipient
        )
        return None

    def _resolve_telegram(
        self,
        sender_id: Optional[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        clean_id = str(sender_id or "").strip()
        if not clean_id:
            return None
        with _LOCK:
            mem_key = f"telegram:{clean_id}"
            if mem_key in _TEST_ACCOUNT_MAPPINGS:
                return _TEST_ACCOUNT_MAPPINGS[mem_key]
        return None

    # Test & Mock Helpers
    def register_test_mapping(self, platform: str, external_id: str, user_id: str) -> None:
        """Register an in-memory mapping for testing."""
        clean_platform = platform.strip().lower()
        if clean_platform in ("whatsapp", "wa"):
            norm_id = normalize_phone_number(external_id)
        elif clean_platform == "whatsapp_business":
            norm_id = external_id.strip()
        elif clean_platform in ("email", "mail"):
            norm_id = normalize_email_address(external_id)
        else:
            norm_id = external_id.strip()

        with _LOCK:
            _TEST_ACCOUNT_MAPPINGS[f"{clean_platform}:{norm_id}"] = user_id.strip()

    def clear_test_mappings(self) -> None:
        """Clear all in-memory test mappings."""
        with _LOCK:
            _TEST_ACCOUNT_MAPPINGS.clear()


# Global singleton instance
inbound_account_resolver = InboundAccountResolver()
