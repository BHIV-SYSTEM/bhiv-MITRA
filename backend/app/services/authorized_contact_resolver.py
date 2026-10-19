"""
authorized_contact_resolver.py — Authoritative Contact Resolution & Disambiguation Service

Resolves recipients for communication actions (WhatsApp, SMS, etc.) strictly against:
1. Explicit E.164 phone numbers.
2. Authorized contact sources (MongoDB `mitra_contacts` collection, user-scoped).
3. In-memory thread-safe fallback registry (for test environments and offline operation).

Security Invariant:
- NEVER guesses a recipient.
- If multiple contacts match, returns "ambiguous" requiring user disambiguation.
- If no contact matches, returns "not_found" and refuses to send.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional
from pymongo import MongoClient

from app.executors.meta_whatsapp_executor import normalize_e164_phone

logger = logging.getLogger(__name__)

# Thread-safe in-memory store for contacts (useful for tests and offline fallback)
_LOCK = threading.Lock()
_IN_MEMORY_CONTACTS: Dict[str, List[Dict[str, Any]]] = {}


def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.debug("MongoDB unavailable for AuthorizedContactResolver: %s", exc)
        return None


class AuthorizedContactResolver:
    """Authoritative contact resolution service enforcing zero-guessing policies."""

    def __init__(self):
        self.collection_name = "mitra_contacts"

    @staticmethod
    def register_test_contact(user_id: str, name: str, phone: str, email: str = "") -> None:
        """Register a contact in the in-memory store for testing or offline usage."""
        with _LOCK:
            if user_id not in _IN_MEMORY_CONTACTS:
                _IN_MEMORY_CONTACTS[user_id] = []
            # Check if contact already exists
            existing = [c for c in _IN_MEMORY_CONTACTS[user_id] if c["name"].lower() == name.lower()]
            if existing:
                existing[0]["phone"] = phone
                existing[0]["email"] = email
            else:
                _IN_MEMORY_CONTACTS[user_id].append({
                    "name": name,
                    "phone": phone,
                    "email": email,
                    "user_id": user_id
                })

    @staticmethod
    def clear_test_contacts(user_id: Optional[str] = None) -> None:
        """Clear test contacts."""
        with _LOCK:
            if user_id:
                _IN_MEMORY_CONTACTS.pop(user_id, None)
            else:
                _IN_MEMORY_CONTACTS.clear()

    def _looks_like_phone_number(self, text: str) -> bool:
        """Check if string appears to be a phone number rather than a person's name."""
        clean = text.strip()
        # If it starts with + or contains at least 7 digits and only phone punctuation
        digits = re.sub(r"[^\d]", "", clean)
        non_digits = re.sub(r"[\d\s\+\-\(\)\.]", "", clean)
        
        # If there are alphabet characters, it's a contact name
        if re.search(r"[a-zA-Z]", non_digits):
            return False
            
        return len(digits) >= 7

    def resolve_recipient(self, raw_recipient: str, user_id: str = "user_default") -> Dict[str, Any]:
        """
        Resolve a recipient string (phone number or contact name) strictly against authorized sources.
        
        Returns one of:
        - {"status": "resolved", "contact_type": "phone"|"contact", "phone": "+91...", "formatted_phone": "+91 91363 ...", "name": ..., "display_label": ...}
        - {"status": "ambiguous", "error_code": "AMBIGUOUS_CONTACT", "matches": [...], "message": ...}
        - {"status": "not_found", "error_code": "CONTACT_NOT_FOUND", "message": ...}
        - {"status": "error", "error_code": ..., "error": ...}
        """
        if not raw_recipient or not str(raw_recipient).strip():
            return {
                "status": "error",
                "error_code": "EMPTY_RECIPIENT",
                "error": "Recipient phone number or contact name is required."
            }

        cleaned = str(raw_recipient).strip()
        # Remove trailing colon if accidentally included from "to [name]:"
        if cleaned.endswith(":"):
            cleaned = cleaned[:-1].strip()

        # ── Case 1: Explicit phone number ──
        if self._looks_like_phone_number(cleaned):
            norm = normalize_e164_phone(cleaned)
            if not norm["valid"]:
                return {
                    "status": "error",
                    "error_code": "INVALID_PHONE_NUMBER",
                    "error": norm["error"]
                }
            
            # Check if this phone number matches a known contact name
            matched_name = self._find_name_for_phone(norm["e164"], user_id)
            display_label = f"{matched_name} ({norm['formatted']})" if matched_name else norm["formatted"]
            return {
                "status": "resolved",
                "contact_type": "phone",
                "phone": norm["e164"],
                "digits_only": norm["digits_only"],
                "formatted_phone": norm["formatted"],
                "name": matched_name or norm["formatted"],
                "display_label": display_label,
            }

        # ── Case 2: Contact name lookup in authorized sources ──
        matches = self._search_contacts(cleaned, user_id)
        
        if len(matches) == 0:
            return {
                "status": "not_found",
                "error_code": "CONTACT_NOT_FOUND",
                "name": cleaned,
                "message": (
                    f"No authorized contact found matching '{cleaned}'. "
                    "To prevent sending to the wrong person, MITRA never guesses recipients. "
                    "Please specify an explicit phone number with country code (e.g. +91 91363 98133) or add this contact first."
                )
            }
        
        if len(matches) > 1:
            match_list = []
            for m in matches:
                m_norm = normalize_e164_phone(m.get("phone", ""))
                formatted = m_norm["formatted"] if m_norm["valid"] else m.get("phone", "")
                match_list.append({
                    "name": m.get("name"),
                    "phone": m_norm["e164"] if m_norm["valid"] else m.get("phone"),
                    "formatted_phone": formatted
                })
            
            formatted_bullet_list = "\n".join([f"• {m['name']}: {m['formatted_phone']}" for m in match_list])
            return {
                "status": "ambiguous",
                "error_code": "AMBIGUOUS_CONTACT",
                "name": cleaned,
                "matches": match_list,
                "message": (
                    f"Multiple contacts found matching '{cleaned}'. Please choose which one you would like to message:\n"
                    f"{formatted_bullet_list}"
                )
            }

        # Exactly 1 match found
        single_match = matches[0]
        phone_val = single_match.get("phone", "")
        norm = normalize_e164_phone(phone_val)
        if not norm["valid"]:
            return {
                "status": "error",
                "error_code": "CONTACT_PHONE_INVALID",
                "error": f"Contact '{single_match.get('name')}' has an invalid phone number: {norm['error']}"
            }

        return {
            "status": "resolved",
            "contact_type": "contact",
            "phone": norm["e164"],
            "digits_only": norm["digits_only"],
            "formatted_phone": norm["formatted"],
            "name": single_match.get("name"),
            "display_label": f"{single_match.get('name')} ({norm['formatted']})",
        }

    def _search_contacts(self, query: str, user_id: str) -> List[Dict[str, Any]]:
        """Search across MongoDB collection and in-memory authorized contacts."""
        results: List[Dict[str, Any]] = []
        q_lower = query.lower()

        # 1. In-memory cache lookup
        with _LOCK:
            user_contacts = _IN_MEMORY_CONTACTS.get(user_id, [])
            default_contacts = _IN_MEMORY_CONTACTS.get("user_default", [])
            for c in user_contacts + default_contacts:
                c_name = c.get("name", "").lower()
                if q_lower == c_name or q_lower in c_name.split() or c_name.startswith(q_lower):
                    if not any(r.get("name") == c.get("name") and r.get("phone") == c.get("phone") for r in results):
                        results.append(c)

        # 2. MongoDB lookup
        db = _get_db()
        if db is not None:
            try:
                col = db[self.collection_name]
                regex_pat = re.compile(rf"^{re.escape(query)}", re.IGNORECASE)
                cursor = col.find({
                    "$or": [
                        {"user_id": user_id, "name": regex_pat},
                        {"user_id": "user_default", "name": regex_pat},
                        {"name": regex_pat}
                    ]
                }).limit(10)
                for doc in cursor:
                    if not any(r.get("name") == doc.get("name") and r.get("phone") == doc.get("phone") for r in results):
                        results.append({
                            "name": doc.get("name"),
                            "phone": doc.get("phone"),
                            "email": doc.get("email"),
                            "user_id": doc.get("user_id")
                        })
            except Exception as e:
                logger.warning(f"Error querying contacts in MongoDB: {e}")

        return results

    def _find_name_for_phone(self, phone_e164: str, user_id: str) -> Optional[str]:
        """Reverse lookup: find contact name for a normalized E.164 phone number."""
        clean_target = phone_e164.replace("+", "")

        # 1. In-memory
        with _LOCK:
            for c in _IN_MEMORY_CONTACTS.get(user_id, []) + _IN_MEMORY_CONTACTS.get("user_default", []):
                norm = normalize_e164_phone(c.get("phone", ""))
                if norm["valid"] and norm["digits_only"] == clean_target:
                    return c.get("name")

        # 2. MongoDB
        db = _get_db()
        if db is not None:
            try:
                col = db[self.collection_name]
                doc = col.find_one({
                    "$or": [
                        {"phone": phone_e164},
                        {"phone": f"+{clean_target}"},
                        {"phone": clean_target}
                    ]
                })
                if doc and doc.get("name"):
                    return doc.get("name")
            except Exception:
                pass

        return None


authorized_contact_resolver = AuthorizedContactResolver()
