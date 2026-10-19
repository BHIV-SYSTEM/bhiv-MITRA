"""
backend/app/services/pending_action_service.py — Pending Communication Action Persistence

Provides server-side staging and atomic state management for communication approval:
- Indexes pending_action_id (unique) and user_id
- Enforces TTL-based action expiration (default: 900s / 15 min)
- Atomic state transitions: PENDING -> CONFIRMING -> EXECUTED / FAILED, PENDING -> CANCELLED
- Prevents cross-user access (always queries user_id + pending_action_id)
- In-memory store fallback with threading lock for mock/test environments
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from pymongo import ASCENDING, MongoClient

from app.models.communication import (
    CommunicationAction,
    PendingActionStatus,
    PendingCommunicationAction,
    compute_action_hash,
)

logger = logging.getLogger(__name__)

# Centralized TTL for pending actions: 15 minutes
DEFAULT_PENDING_ACTION_TTL_SECONDS = 900

# In-memory store fallback for testing environments without MongoDB
_IN_MEMORY_PENDING_ACTIONS: Dict[str, Dict[str, Any]] = {}
_IN_MEMORY_LOCK = threading.Lock()


def _get_db():
    try:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception as exc:
        logger.warning("MongoDB connection error in pending_action_service: %s", exc)
        return None


class PendingActionService:
    """
    Manages persistent staging, integrity hashing, and lifecycle of
    pending communication actions awaiting explicit user approval.
    """

    def __init__(self):
        self.collection_name = "pending_communication_actions"
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        db = _get_db()
        if db is not None:
            try:
                coll = db[self.collection_name]
                coll.create_index([("pending_action_id", ASCENDING)], unique=True)
                coll.create_index([("user_id", ASCENDING)])
                coll.create_index([("expires_at", ASCENDING)])
            except Exception as exc:
                logger.debug("Failed to create mongo indexes for pending actions: %s", exc)

    def create_pending_action(
        self,
        action: CommunicationAction,
        sender_account: Optional[str] = None,
        ttl_seconds: int = DEFAULT_PENDING_ACTION_TTL_SECONDS,
    ) -> PendingCommunicationAction:
        """
        Create and persist a new pending communication action.
        Computes deterministic integrity hash over immutable outbound fields.
        """
        pending_action_id = f"pact_{uuid.uuid4().hex[:16]}"
        idempotency_key = action.idempotency_key or f"idem_{uuid.uuid4().hex[:16]}"
        action.idempotency_key = idempotency_key

        now = datetime.utcnow()
        expires_at = (now + timedelta(seconds=ttl_seconds)).isoformat()
        created_at = now.isoformat()

        # Compute deterministic integrity hash
        action_hash = compute_action_hash(
            user_id=action.user_id,
            channel=action.channel,
            intent=action.intent,
            account_id=action.account_id,
            recipient=action.recipient,
            subject=action.subject,
            content=action.content,
            idempotency_key=idempotency_key,
        )

        pending_model = PendingCommunicationAction(
            pending_action_id=pending_action_id,
            user_id=action.user_id,
            intent=action.intent,
            channel=action.channel,
            account_id=action.account_id,
            sender_account=sender_account,
            recipient=action.recipient,
            subject=action.subject,
            content=action.content,
            idempotency_key=idempotency_key,
            action_hash=action_hash,
            status="PENDING",
            created_at=created_at,
            expires_at=expires_at,
        )

        doc = pending_model.to_dict()

        db = _get_db()
        if db is not None:
            try:
                db[self.collection_name].insert_one(doc)
            except Exception as exc:
                logger.warning("Failed to insert pending action into MongoDB: %s", exc)

        # Maintain thread-safe in-memory cache as well
        with _IN_MEMORY_LOCK:
            _IN_MEMORY_PENDING_ACTIONS[pending_action_id] = dict(doc)

        return pending_model

    def get_pending_action(
        self, pending_action_id: str, user_id: str
    ) -> Optional[PendingCommunicationAction]:
        """
        Retrieve a pending communication action by pending_action_id and user_id.
        Enforces user ownership — will return None if pending_action_id belongs to another user.
        """
        if not pending_action_id or not user_id:
            return None

        clean_uid = str(user_id).strip()
        doc = None

        db = _get_db()
        if db is not None:
            try:
                doc = db[self.collection_name].find_one(
                    {"pending_action_id": pending_action_id, "user_id": clean_uid}
                )
            except Exception as exc:
                logger.warning("Failed to find pending action in MongoDB: %s", exc)

        if doc is None:
            with _IN_MEMORY_LOCK:
                mem_doc = _IN_MEMORY_PENDING_ACTIONS.get(pending_action_id)
                if mem_doc and mem_doc.get("user_id") == clean_uid:
                    doc = dict(mem_doc)

        if not doc:
            return None

        # Strip internal mongo _id if present
        doc_copy = dict(doc)
        doc_copy.pop("_id", None)
        try:
            return PendingCommunicationAction(**doc_copy)
        except Exception as exc:
            logger.error("Failed to parse PendingCommunicationAction from doc: %s", exc)
            return None

    def transition_to_confirming(
        self, pending_action_id: str, user_id: str
    ) -> Tuple[Optional[PendingCommunicationAction], Optional[str]]:
        """
        Atomically transition action status from PENDING to CONFIRMING.
        Enforces ownership, expiration check, and replay protection:
        Returns (PendingCommunicationAction, None) on success.
        Returns (None, error_code) on failure:
        - "ACTION_NOT_FOUND"
        - "ACTION_EXPIRED"
        - "ACTION_ALREADY_CONFIRMED"
        - "ACTION_ALREADY_EXECUTED"
        - "ACTION_CANCELLED"
        - "CONCURRENT_EXECUTION_BLOCKED"
        """
        clean_uid = str(user_id).strip()
        now_iso = datetime.utcnow().isoformat()

        # Check existing state first to give exact error category
        existing = self.get_pending_action(pending_action_id, clean_uid)
        if not existing:
            # Check if exists under another user to prevent leaking data
            return None, "ACTION_NOT_FOUND"

        if existing.status == "CANCELLED":
            return None, "ACTION_CANCELLED"
        if existing.status in ("EXECUTED", "CONFIRMED"):
            return existing, "ACTION_ALREADY_EXECUTED"
        if existing.status == "CONFIRMING":
            return None, "CONCURRENT_EXECUTION_BLOCKED"
        if existing.status == "EXPIRED" or existing.expires_at <= now_iso:
            # Mark expired if not already marked
            self._update_status(pending_action_id, clean_uid, "EXPIRED")
            return None, "ACTION_EXPIRED"

        # Attempt atomic transition PENDING -> CONFIRMING
        db = _get_db()
        if db is not None:
            try:
                updated_doc = db[self.collection_name].find_one_and_update(
                    {
                        "pending_action_id": pending_action_id,
                        "user_id": clean_uid,
                        "status": "PENDING",
                        "expires_at": {"$gt": now_iso},
                    },
                    {"$set": {"status": "CONFIRMING", "confirmed_at": now_iso}},
                    return_document=True,
                )
                if updated_doc:
                    updated_doc.pop("_id", None)
                    return PendingCommunicationAction(**updated_doc), None
                else:
                    # Race condition lost or expired concurrently
                    return None, "CONCURRENT_EXECUTION_BLOCKED"
            except Exception as exc:
                logger.warning("MongoDB atomic update failed, falling back to memory: %s", exc)

        # In-memory atomic transition with lock
        with _IN_MEMORY_LOCK:
            mem_doc = _IN_MEMORY_PENDING_ACTIONS.get(pending_action_id)
            if not mem_doc or mem_doc.get("user_id") != clean_uid:
                return None, "ACTION_NOT_FOUND"

            if mem_doc.get("status") != "PENDING":
                if mem_doc.get("status") == "CONFIRMING":
                    return None, "CONCURRENT_EXECUTION_BLOCKED"
                elif mem_doc.get("status") == "CANCELLED":
                    return None, "ACTION_CANCELLED"
                elif mem_doc.get("status") in ("EXECUTED", "CONFIRMED"):
                    return PendingCommunicationAction(**mem_doc), "ACTION_ALREADY_EXECUTED"
                elif mem_doc.get("status") == "EXPIRED":
                    return None, "ACTION_EXPIRED"
                return None, "CONCURRENT_EXECUTION_BLOCKED"

            if mem_doc.get("expires_at", "") <= now_iso:
                mem_doc["status"] = "EXPIRED"
                return None, "ACTION_EXPIRED"

            mem_doc["status"] = "CONFIRMING"
            mem_doc["confirmed_at"] = now_iso
            return PendingCommunicationAction(**mem_doc), None

    def mark_executed(
        self, pending_action_id: str, user_id: str, result: Dict[str, Any]
    ) -> None:
        """Mark action as EXECUTED with its normalized execution result."""
        clean_uid = str(user_id).strip()
        now_iso = datetime.utcnow().isoformat()
        update_data = {
            "status": "EXECUTED",
            "executed_at": now_iso,
            "result": result,
        }
        self._update_fields(pending_action_id, clean_uid, update_data)

    def mark_failed(
        self,
        pending_action_id: str,
        user_id: str,
        error: str,
        error_code: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Mark action as FAILED with error details."""
        clean_uid = str(user_id).strip()
        now_iso = datetime.utcnow().isoformat()
        update_data = {
            "status": "FAILED",
            "executed_at": now_iso,
            "error": error,
            "error_code": error_code,
            "result": result,
        }
        self._update_fields(pending_action_id, clean_uid, update_data)

    def cancel_pending_action(
        self, pending_action_id: str, user_id: str
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Atomically transition action status from PENDING to CANCELLED.
        Returns (success: bool, error_code: Optional[str], data: Optional[Dict]).
        Only PENDING actions may be cancelled.
        """
        clean_uid = str(user_id).strip()
        now_iso = datetime.utcnow().isoformat()

        existing = self.get_pending_action(pending_action_id, clean_uid)
        if not existing:
            return False, "ACTION_NOT_FOUND", None

        if existing.status == "CANCELLED":
            return False, "ACTION_ALREADY_CANCELLED", existing.to_dict()
        if existing.status in ("CONFIRMING", "CONFIRMED", "EXECUTED"):
            return False, "ACTION_CANNOT_BE_CANCELLED", existing.to_dict()
        if existing.status == "EXPIRED" or existing.expires_at <= now_iso:
            return False, "ACTION_EXPIRED", existing.to_dict()

        # Atomic transition to CANCELLED
        db = _get_db()
        if db is not None:
            try:
                res = db[self.collection_name].find_one_and_update(
                    {
                        "pending_action_id": pending_action_id,
                        "user_id": clean_uid,
                        "status": "PENDING",
                    },
                    {"$set": {"status": "CANCELLED", "cancelled_at": now_iso}},
                    return_document=True,
                )
                if res:
                    res.pop("_id", None)
                    return True, None, res
                return False, "ACTION_CANNOT_BE_CANCELLED", None
            except Exception as exc:
                logger.warning("MongoDB cancel update failed: %s", exc)

        with _IN_MEMORY_LOCK:
            mem_doc = _IN_MEMORY_PENDING_ACTIONS.get(pending_action_id)
            if not mem_doc or mem_doc.get("user_id") != clean_uid:
                return False, "ACTION_NOT_FOUND", None

            if mem_doc.get("status") != "PENDING":
                return False, "ACTION_CANNOT_BE_CANCELLED", mem_doc

            mem_doc["status"] = "CANCELLED"
            mem_doc["cancelled_at"] = now_iso
            return True, None, dict(mem_doc)

    def _update_status(self, pending_action_id: str, user_id: str, status: str) -> None:
        self._update_fields(pending_action_id, user_id, {"status": status})

    def _update_fields(
        self, pending_action_id: str, user_id: Optional[str], fields: Dict[str, Any]
    ) -> None:
        db = _get_db()
        if db is not None:
            try:
                query: Dict[str, Any] = {"pending_action_id": pending_action_id}
                if user_id:
                    query["user_id"] = user_id
                db[self.collection_name].update_one(
                    query,
                    {"$set": fields},
                )
            except Exception as exc:
                logger.warning("MongoDB update_fields failed: %s", exc)

        with _IN_MEMORY_LOCK:
            if pending_action_id in _IN_MEMORY_PENDING_ACTIONS:
                _IN_MEMORY_PENDING_ACTIONS[pending_action_id].update(fields)

    def get_latest_active_pending_action(self, user_id: str) -> Optional[PendingCommunicationAction]:
        """Retrieve the most recent unexpired pending action awaiting confirmation for a user."""
        clean_uid = str(user_id).strip()
        now_iso = datetime.utcnow().isoformat()

        # Check in MongoDB
        db = _get_db()
        if db is not None:
            try:
                coll = db[self.collection_name]
                doc = coll.find_one(
                    {
                        "$or": [{"user_id": clean_uid}, {"user_id": "user_default"}],
                        "status": "PENDING",
                        "expires_at": {"$gt": now_iso}
                    },
                    sort=[("created_at", -1)]
                )
                if doc:
                    doc.pop("_id", None)
                    return PendingCommunicationAction(**doc)
            except Exception as e:
                logger.debug(f"Failed to query latest pending action in MongoDB: {e}")

        # Check in-memory store
        with _IN_MEMORY_LOCK:
            active = []
            for doc in _IN_MEMORY_PENDING_ACTIONS.values():
                if doc.get("user_id") in (clean_uid, "user_default") and doc.get("status") == "PENDING":
                    if doc.get("expires_at", "") > now_iso:
                        active.append(doc)
            if active:
                active.sort(key=lambda d: d.get("created_at", ""), reverse=True)
                return PendingCommunicationAction(**active[0])

        return None

    def _tamper_action_for_testing(
        self, pending_action_id: str, fields: Dict[str, Any]
    ) -> None:
        """Testing helper to simulate database tampering."""
        self._update_fields(pending_action_id, None, fields)


# Global singleton
pending_action_service = PendingActionService()
