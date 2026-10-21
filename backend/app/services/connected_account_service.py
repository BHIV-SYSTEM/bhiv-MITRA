import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from pymongo import MongoClient

from app.core.encryption import encrypt_secret, decrypt_secret, is_encrypted

logger = logging.getLogger(__name__)

# Fallback in-memory store for environments without MongoDB
_IN_MEMORY_CONNECTED_ACCOUNTS: Dict[str, Dict[str, Any]] = {}

def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.warning(f"MongoDB connection error in connected_account_service: {exc}")
        return None

class ConnectedAccountService:
    """
    Canonical service for managing user connected accounts and OAuth tokens.
    Guarantees token encryption at rest and sanitizes returned API models.
    """
    def __init__(self):
        self.collection_name = "connected_accounts"

    def _sanitize_record(self, record: Dict[str, Any], include_tokens: bool = False) -> Dict[str, Any]:
        """Strip internal encryption fields and plaintext tokens unless explicitly requested."""
        if not record:
            return {}
        
        sanitized = dict(record)
        sanitized.pop("_id", None)
        
        # Internal ciphertext fields
        encrypted_access = sanitized.pop("encrypted_access_token", None)
        encrypted_refresh = sanitized.pop("encrypted_refresh_token", None)
        
        if include_tokens:
            try:
                sanitized["access_token"] = decrypt_secret(encrypted_access) if encrypted_access else None
            except Exception:
                sanitized["access_token"] = None
            try:
                sanitized["refresh_token"] = decrypt_secret(encrypted_refresh) if encrypted_refresh else None
            except Exception:
                sanitized["refresh_token"] = None
        else:
            sanitized.pop("access_token", None)
            sanitized.pop("refresh_token", None)
            sanitized.pop("app_password", None)
            sanitized.pop("encrypted_app_password", None)

        if sanitized.get("provider") == "google":
            scopes = sanitized.get("scopes") or []
            has_read = "https://www.googleapis.com/auth/gmail.readonly" in scopes
            has_compose = "https://www.googleapis.com/auth/gmail.compose" in scopes
            has_send = "https://www.googleapis.com/auth/gmail.send" in scopes

            if has_read and has_compose and has_send:
                access_level = "full"
                upgrade_req = False
            elif has_send:
                access_level = "send_only"
                upgrade_req = True
            else:
                access_level = "none"
                upgrade_req = True

            sanitized["gmail_read_enabled"] = has_read
            sanitized["gmail_compose_enabled"] = has_compose
            sanitized["gmail_send_enabled"] = has_send
            sanitized["gmail_access_level"] = access_level
            sanitized["gmail_upgrade_required"] = upgrade_req
            
        return sanitized

    def create_connection(
        self,
        user_id: str,
        provider: str,
        email: str,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        provider_account_id: Optional[str] = None,
        scopes: Optional[List[str]] = None,
        expires_at: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        if not user_id or not provider:
            raise ValueError("user_id and provider are required to create a connection.")

        now_iso = datetime.utcnow().isoformat()
        encrypted_access = encrypt_secret(access_token) if access_token else None
        encrypted_refresh = encrypt_secret(refresh_token) if refresh_token else None

        record = {
            "user_id": user_id,
            "provider": provider.lower(),
            "provider_account_id": provider_account_id or email,
            "email": email,
            "scopes": scopes or [],
            "encrypted_access_token": encrypted_access,
            "encrypted_refresh_token": encrypted_refresh,
            "expires_at": expires_at,
            "status": "connected",
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_used_at": now_iso,
            "extra_data": extra_data or {}
        }

        db = _get_db()
        if db is not None:
            try:
                db[self.collection_name].update_one(
                    {"user_id": user_id, "provider": provider.lower()},
                    {"$set": record},
                    upsert=True
                )
            except Exception as exc:
                logger.error(f"Failed to persist connected account to DB: {exc}")
                _IN_MEMORY_CONNECTED_ACCOUNTS[f"{user_id}_{provider.lower()}"] = record
        else:
            _IN_MEMORY_CONNECTED_ACCOUNTS[f"{user_id}_{provider.lower()}"] = record

        return self._sanitize_record(record, include_tokens=False)

    def update_connection(
        self,
        user_id: str,
        provider: str,
        email: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        scopes: Optional[List[str]] = None,
        expires_at: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        now_iso = datetime.utcnow().isoformat()
        updates: Dict[str, Any] = {"updated_at": now_iso}

        if email:
            updates["email"] = email
        if access_token:
            updates["encrypted_access_token"] = encrypt_secret(access_token)
        if refresh_token:
            updates["encrypted_refresh_token"] = encrypt_secret(refresh_token)
        if scopes is not None:
            updates["scopes"] = scopes
        if expires_at:
            updates["expires_at"] = expires_at
        if status:
            updates["status"] = status

        db = _get_db()
        key = f"{user_id}_{provider.lower()}"
        if db is not None:
            try:
                db[self.collection_name].update_one(
                    {"user_id": user_id, "provider": provider.lower()},
                    {"$set": updates},
                    upsert=True
                )
            except Exception as exc:
                logger.error(f"Failed updating connected account: {exc}")
                if key in _IN_MEMORY_CONNECTED_ACCOUNTS:
                    _IN_MEMORY_CONNECTED_ACCOUNTS[key].update(updates)
        else:
            if key in _IN_MEMORY_CONNECTED_ACCOUNTS:
                _IN_MEMORY_CONNECTED_ACCOUNTS[key].update(updates)

        return self.get_user_connection(user_id, provider, include_decrypted_tokens=False) or {}

    def get_user_connection(
        self,
        user_id: str,
        provider: str,
        include_decrypted_tokens: bool = False
    ) -> Optional[Dict[str, Any]]:
        if not user_id or not provider:
            return None

        db = _get_db()
        record = None
        if db is not None:
            try:
                record = db[self.collection_name].find_one({"user_id": user_id, "provider": provider.lower()})
            except Exception as exc:
                logger.warning(f"Error fetching connected account: {exc}")

        if not record:
            key = f"{user_id}_{provider.lower()}"
            record = _IN_MEMORY_CONNECTED_ACCOUNTS.get(key)

        if not record:
            return None

        return self._sanitize_record(record, include_tokens=include_decrypted_tokens)

    def list_user_connections(self, user_id: str) -> List[Dict[str, Any]]:
        if not user_id:
            return []

        db = _get_db()
        records = []
        if db is not None:
            try:
                cursor = db[self.collection_name].find({"user_id": user_id})
                records = list(cursor)
            except Exception as exc:
                logger.warning(f"Error listing connected accounts: {exc}")

        if not records:
            prefix = f"{user_id}_"
            records = [v for k, v in _IN_MEMORY_CONNECTED_ACCOUNTS.items() if k.startswith(prefix)]

        return [self._sanitize_record(r, include_tokens=False) for r in records]

    def delete_connection(self, user_id: str, provider: str) -> bool:
        if not user_id or not provider:
            return False

        db = _get_db()
        deleted = False
        if db is not None:
            try:
                res = db[self.collection_name].delete_one({"user_id": user_id, "provider": provider.lower()})
                deleted = res.deleted_count > 0
            except Exception as exc:
                logger.error(f"Failed deleting connected account: {exc}")

        key = f"{user_id}_{provider.lower()}"
        if key in _IN_MEMORY_CONNECTED_ACCOUNTS:
            del _IN_MEMORY_CONNECTED_ACCOUNTS[key]
            deleted = True

        return deleted

    def update_tokens(
        self,
        user_id: str,
        provider: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        expires_at: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.update_connection(
            user_id=user_id,
            provider=provider,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at
        )

    def mark_status(self, user_id: str, provider: str, status: str) -> Dict[str, Any]:
        return self.update_connection(user_id=user_id, provider=provider, status=status)

    def update_last_used_at(self, user_id: str, provider: str) -> None:
        now_iso = datetime.utcnow().isoformat()
        db = _get_db()
        key = f"{user_id}_{provider.lower()}"
        if db is not None:
            try:
                db[self.collection_name].update_one(
                    {"user_id": user_id, "provider": provider.lower()},
                    {"$set": {"last_used_at": now_iso}}
                )
            except Exception:
                pass
        if key in _IN_MEMORY_CONNECTED_ACCOUNTS:
            _IN_MEMORY_CONNECTED_ACCOUNTS[key]["last_used_at"] = now_iso

    def get_gmail_access_state(self, user_id: str) -> Dict[str, Any]:
        """
        Determines current Gmail access state for the user's connected Google account.
        """
        conn = self.get_user_connection(user_id, "google", include_decrypted_tokens=False)
        if not conn or conn.get("status") != "connected":
            return {
                "connected": False,
                "email": None,
                "gmail_read_enabled": False,
                "gmail_compose_enabled": False,
                "gmail_send_enabled": False,
                "gmail_access_level": "not_connected",
                "gmail_upgrade_required": True,
                "scopes": []
            }
        scopes = conn.get("scopes") or []
        has_read = "https://www.googleapis.com/auth/gmail.readonly" in scopes
        has_compose = "https://www.googleapis.com/auth/gmail.compose" in scopes
        has_send = "https://www.googleapis.com/auth/gmail.send" in scopes
        access_level = "full" if (has_read and has_compose and has_send) else ("send_only" if has_send else "none")
        upgrade_req = access_level != "full"
        return {
            "connected": True,
            "email": conn.get("email"),
            "gmail_read_enabled": has_read,
            "gmail_compose_enabled": has_compose,
            "gmail_send_enabled": has_send,
            "gmail_access_level": access_level,
            "gmail_upgrade_required": upgrade_req,
            "scopes": scopes
        }

    def has_gmail_read_access(self, user_id: str) -> bool:
        state = self.get_gmail_access_state(user_id)
        return bool(state.get("connected") and state.get("gmail_read_enabled"))

    def has_gmail_compose_access(self, user_id: str) -> bool:
        state = self.get_gmail_access_state(user_id)
        return bool(state.get("connected") and state.get("gmail_compose_enabled"))

    # Backward-compatible convenience aliases
    save_user_connection = create_connection
    delete_user_connection = delete_connection

connected_account_service = ConnectedAccountService()
