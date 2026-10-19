"""
backend/app/models/communication.py — Unified Communication Capability Contract

Defines the provider-independent canonical contract for all MITRA communication:
- Channels: EMAIL, WHATSAPP
- Intents: SEND_MESSAGE, DRAFT_MESSAGE, READ_MESSAGES, SEARCH_MESSAGES
- Centralized Approval Policy & Confirmation Payload
- Standardized Communication Result & Delivery State
- Normalized Error Categories
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, validator

# ── 1. UNIFIED COMMUNICATION INTENTS & CHANNELS ──────────────────────────────

class CommunicationIntent(str, Enum):
    SEND_MESSAGE = "SEND_MESSAGE"
    DRAFT_MESSAGE = "DRAFT_MESSAGE"
    READ_MESSAGES = "READ_MESSAGES"
    SEARCH_MESSAGES = "SEARCH_MESSAGES"


class CommunicationChannel(str, Enum):
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"


CommunicationStatus = Literal[
    "requested",
    "confirmation_required",
    "accepted",
    "sent",
    "delivered",
    "failed",
]

DeliveryState = Literal[
    "pending",
    "accepted",
    "sent",
    "delivered",
    "failed",
    "unknown",
]

PendingActionStatus = Literal[
    "PENDING",
    "CONFIRMING",
    "CONFIRMED",
    "CANCELLED",
    "EXPIRED",
    "EXECUTED",
    "FAILED",
]

CommunicationErrorCode = str


# Sensitive keys that must NEVER enter canonical contract or result
FORBIDDEN_CREDENTIAL_KEYS = {
    "password", "app_password", "access_token", "refresh_token",
    "auth_token", "token", "client_secret", "secret", "private_key",
    "api_key", "encrypted_access_token", "encrypted_refresh_token"
}


def compute_action_hash(
    user_id: str,
    channel: Any,
    intent: Any,
    account_id: Optional[str] = None,
    recipient: Optional[str] = None,
    subject: Optional[str] = None,
    content: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> str:
    """
    Computes a deterministic SHA-256 integrity hash over immutable outbound communication fields.
    Field order and formatting are strictly canonical to ensure byte-level stability.
    """
    ch_str = channel.value if hasattr(channel, "value") else str(channel or "")
    in_str = intent.value if hasattr(intent, "value") else str(intent or "")
    canonical_elements = [
        ("user_id", str(user_id or "").strip()),
        ("channel", ch_str.strip().upper()),
        ("intent", in_str.strip().upper()),
        ("account_id", str(account_id or "").strip()),
        ("recipient", str(recipient or "").strip()),
        ("subject", str(subject or "").strip()),
        ("content", str(content or "").strip()),
        ("idempotency_key", str(idempotency_key or "").strip()),
    ]
    canonical_repr = "\n".join(f"{k}:{v}" for k, v in canonical_elements)
    return hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()



# ── 2. CANONICAL COMMUNICATION ACTION CONTRACT ─────────────────────────────

class CommunicationAction(BaseModel):
    """
    Provider-independent canonical contract for communication actions.
    Never accepts client-supplied credentials, access tokens, or raw secrets.
    """
    intent: CommunicationIntent
    channel: CommunicationChannel
    user_id: str
    account_id: Optional[str] = None
    recipient: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    confirmation_confirmed: bool = False
    idempotency_key: Optional[str] = None
    query: Optional[str] = None
    limit: Optional[int] = Field(default=20, le=100)
    page_token: Optional[str] = None
    thread_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    @validator("user_id")
    def validate_user_id(cls, v: str) -> str:
        if not v or not str(v).strip() or str(v).strip().lower() in ("user_default", "default", "none", "null", "anonymous"):
            raise ValueError("Authentication required: user-owned communication actions must specify a valid, authenticated user_id.")
        return str(v).strip()

    @validator("channel", pre=True)
    def normalize_channel(cls, v: Any) -> CommunicationChannel:
        if isinstance(v, str):
            clean = v.strip().upper()
            if clean in ("EMAIL", "MAIL", "GMAIL", "OUTLOOK"):
                return CommunicationChannel.EMAIL
            elif clean in ("WHATSAPP", "WA"):
                return CommunicationChannel.WHATSAPP
        return v

    @validator("intent", pre=True)
    def normalize_intent(cls, v: Any) -> CommunicationIntent:
        if isinstance(v, str):
            clean = v.strip().upper()
            if clean in ("SEND_MESSAGE", "SEND_EMAIL", "SEND_WHATSAPP", "SEND", "EMAIL", "WHATSAPP"):
                return CommunicationIntent.SEND_MESSAGE
            elif clean in ("DRAFT_MESSAGE", "DRAFT_EMAIL", "DRAFT"):
                return CommunicationIntent.DRAFT_MESSAGE
            elif clean in ("READ_MESSAGES", "READ_EMAILS", "READ_INBOX", "READ"):
                return CommunicationIntent.READ_MESSAGES
            elif clean in ("SEARCH_MESSAGES", "SEARCH_EMAILS", "SEARCH"):
                return CommunicationIntent.SEARCH_MESSAGES
        return v

    @validator("metadata")
    def prevent_credential_leakage(cls, v: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not v:
            return {}
        cleaned = {}
        for key, val in v.items():
            if key.lower() in FORBIDDEN_CREDENTIAL_KEYS:
                raise ValueError(f"Security error: client-supplied credential '{key}' is forbidden in communication action.")
            cleaned[key] = val
        return cleaned

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent.value,
            "channel": self.channel.value,
            "user_id": self.user_id,
            "account_id": self.account_id,
            "recipient": self.recipient,
            "subject": self.subject,
            "content": self.content,
            "confirmation_confirmed": self.confirmation_confirmed,
            "idempotency_key": self.idempotency_key,
            "query": self.query,
            "limit": self.limit,
            "page_token": self.page_token,
            "thread_id": self.thread_id,
            "metadata": self.metadata or {},
        }


# ── 3. CONFIRMATION PAYLOAD MODEL ──────────────────────────────────────────

class CommunicationConfirmationPayload(BaseModel):
    """
    Provider-independent confirmation representation for the UI.
    Contains clear recipient, sender identity, subject, and content.
    Never exposes OAuth tokens, passwords, or provider secrets.
    """
    type: Literal["communication_confirmation"] = "communication_confirmation"
    channel: CommunicationChannel
    pending_action_id: Optional[str] = None
    sender_account: Optional[str] = None
    recipient: Optional[str] = None
    recipient_name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    action: Literal["SEND_MESSAGE"] = "SEND_MESSAGE"
    idempotency_key: Optional[str] = None
    expires_at: Optional[str] = None
    requires_confirmation: bool = True
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "channel": self.channel.value if isinstance(self.channel, Enum) else str(self.channel),
            "pending_action_id": self.pending_action_id,
            "sender_account": self.sender_account,
            "recipient": self.recipient,
            "recipient_name": self.recipient_name,
            "subject": self.subject,
            "content": self.content,
            "action": self.action,
            "idempotency_key": self.idempotency_key,
            "expires_at": self.expires_at,
            "requires_confirmation": self.requires_confirmation,
            "metadata": self.metadata or {},
        }


# ── 4. STANDARDIZED COMMUNICATION RESULT MODEL ─────────────────────────────

class CommunicationResult(BaseModel):
    """
    Normalized result model for all communication actions.
    Enforces delivery invariants:
    - HTTP 200 / provider API acceptance MUST NOT automatically be represented as DELIVERED.
    - Delivery confirmation is asynchronous: SENT/ACCEPTED -> pending delivery state.
    """
    status: CommunicationStatus
    delivery_state: DeliveryState = "unknown"
    channel: CommunicationChannel
    provider: Optional[str] = None
    pending_action_id: Optional[str] = None
    sender_account: Optional[str] = None
    recipient: Optional[str] = None
    provider_message_id: Optional[str] = None
    error_code: Optional[CommunicationErrorCode] = None
    error: Optional[str] = None
    message: Optional[str] = None
    confirmation: Optional[Dict[str, Any]] = None
    action: Optional[Dict[str, Any]] = None
    idempotency_key: Optional[str] = None
    expires_at: Optional[str] = None
    trace_id: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    draft_id: Optional[str] = None
    thread_id: Optional[str] = None
    next_page_token: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "delivery_state": self.delivery_state,
            "channel": self.channel.value if isinstance(self.channel, Enum) else str(self.channel),
            "provider": self.provider,
            "pending_action_id": self.pending_action_id,
            "sender_account": self.sender_account,
            "recipient": self.recipient,
            "provider_message_id": self.provider_message_id,
            "error_code": self.error_code,
            "error": self.error,
            "message": self.message,
            "confirmation": self.confirmation,
            "action": self.action,
            "idempotency_key": self.idempotency_key,
            "expires_at": self.expires_at,
            "trace_id": self.trace_id,
            "messages": self.messages,
            "draft_id": self.draft_id,
            "thread_id": self.thread_id,
            "next_page_token": self.next_page_token,
            "timestamp": self.timestamp,
        }


# ── 5. PENDING COMMUNICATION ACTION PERSISTENCE MODEL ──────────────────────

class PendingCommunicationAction(BaseModel):
    """
    Server-side pending communication action representation.
    Binds the exact immutable outbound fields with an integrity hash.
    Never stores provider credentials, access tokens, or secrets.
    """
    pending_action_id: str
    user_id: str
    intent: CommunicationIntent
    channel: CommunicationChannel
    account_id: Optional[str] = None
    sender_account: Optional[str] = None
    recipient: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    idempotency_key: str
    action_hash: str
    status: PendingActionStatus = "PENDING"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    expires_at: str
    confirmed_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    executed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pending_action_id": self.pending_action_id,
            "user_id": self.user_id,
            "intent": self.intent.value if isinstance(self.intent, Enum) else str(self.intent),
            "channel": self.channel.value if isinstance(self.channel, Enum) else str(self.channel),
            "account_id": self.account_id,
            "sender_account": self.sender_account,
            "recipient": self.recipient,
            "subject": self.subject,
            "content": self.content,
            "idempotency_key": self.idempotency_key,
            "action_hash": self.action_hash,
            "status": self.status,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "confirmed_at": self.confirmed_at,
            "cancelled_at": self.cancelled_at,
            "executed_at": self.executed_at,
            "result": self.result,
            "error": self.error,
            "error_code": self.error_code,
        }
