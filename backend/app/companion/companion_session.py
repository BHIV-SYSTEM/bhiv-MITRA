"""
companion_session.py — Mitra Companion Session & Conversation Manager

Manages persistent multi-conversation sessions per user_id + platform.
ChatGPT-style conversations: list, create, switch, auto-title, and delete.
Sessions persist across devices via MongoDB.
Falls back to in-memory if MongoDB unavailable.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

_SESSION_COLLECTION = "mitra_companion_sessions"
_HISTORY_COLLECTION = "mitra_conversation_history"


@dataclass
class CompanionSession:
    session_id: str
    user_id: str
    title: str = "New Chat"
    platform: str = "web"
    device: str = "browser"
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_active: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    turn_count: int = 0
    capabilities_used: List[str] = field(default_factory=list)

    def touch(self) -> None:
        self.last_active = datetime.now(timezone.utc).isoformat()
        self.turn_count += 1

    def is_expired(self, ttl_hours: int = 24) -> bool:
        try:
            last = datetime.fromisoformat(self.last_active.replace("Z", "+00:00"))
            return datetime.now(timezone.utc) - last > timedelta(hours=ttl_hours)
        except Exception:
            return False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id":        self.session_id,
            "id":                self.session_id,
            "user_id":           self.user_id,
            "title":             self.title,
            "platform":          self.platform,
            "device":            self.device,
            "started_at":        self.started_at,
            "last_active":       self.last_active,
            "timestamp":         self.last_active,
            "turn_count":        self.turn_count,
            "capabilities_used": self.capabilities_used,
        }


@dataclass
class MessageTurn:
    role: str          # "user" | "assistant"
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    capability_result: Optional[Dict[str, Any]] = None   # attached if capability was invoked

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp,
            "capability_result": self.capability_result,
        }


class SessionManager:
    """
    Creates, retrieves, and updates companion conversations and sessions.
    Supports multi-conversation management like ChatGPT (New Chat, history list, rename, delete).
    Conversation history stored per session for LLM context injection.
    """

    def __init__(self) -> None:
        # user_id -> {session_id: CompanionSession}
        self._sessions: Dict[str, Dict[str, CompanionSession]] = {}
        # user_id -> active_session_id
        self._active_sessions: Dict[str, str] = {}
        # session_id -> List[MessageTurn]
        self._histories: Dict[str, List[MessageTurn]] = {}
        self._mongo_available = False
        self._session_col = None
        self._history_col = None
        self._init_mongo()

    def _init_mongo(self) -> None:
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            return
        try:
            from pymongo import MongoClient  # type: ignore
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
            db_name = os.getenv("MONGODB_DB", "mitra")
            self._session_col = client[db_name][_SESSION_COLLECTION]
            self._history_col = client[db_name][_HISTORY_COLLECTION]
            self._mongo_available = True
            logger.info("SessionManager: MongoDB connected")
        except Exception as exc:
            logger.warning("SessionManager: MongoDB unavailable (%s), using cache.", exc)

    async def get_or_create(
        self,
        user_id: str,
        session_id: Optional[str] = None,
        platform: str = "web",
        device: str = "browser",
        ttl_hours: int = 24,
    ) -> CompanionSession:
        """Get existing active session/conversation or create a new one."""
        user_sessions = self._sessions.setdefault(user_id, {})

        # If specific session_id requested
        if session_id:
            if session_id in user_sessions:
                s = user_sessions[session_id]
                self._active_sessions[user_id] = session_id
                return s

            # Check MongoDB for this specific session
            if self._mongo_available and self._session_col is not None:
                try:
                    import asyncio
                    doc = await asyncio.to_thread(
                        self._session_col.find_one,
                        {"user_id": user_id, "session_id": session_id}
                    )
                    if doc:
                        s = self._from_doc(doc)
                        user_sessions[session_id] = s
                        self._active_sessions[user_id] = session_id
                        return s
                except Exception as exc:
                    logger.warning("SessionManager.get_or_create specific failed: %s", exc)

            # Not found, create session with requested session_id
            new_session = CompanionSession(
                session_id=session_id,
                user_id=user_id,
                title="New Chat",
                platform=platform,
                device=device,
            )
            user_sessions[session_id] = new_session
            self._active_sessions[user_id] = session_id
            await self._save_session(new_session)
            return new_session

        # No specific session_id: check user's currently active session
        active_id = self._active_sessions.get(user_id)
        if active_id and active_id in user_sessions:
            active_s = user_sessions[active_id]
            if not active_s.is_expired(ttl_hours):
                return active_s

        # Check MongoDB for most recently active session
        if self._mongo_available and self._session_col is not None:
            try:
                import asyncio
                def _fetch_latest():
                    return self._session_col.find_one(
                        {"user_id": user_id},
                        sort=[("last_active", -1)]
                    )
                doc = await asyncio.to_thread(_fetch_latest)
                if doc:
                    s = self._from_doc(doc)
                    if not s.is_expired(ttl_hours):
                        user_sessions[s.session_id] = s
                        self._active_sessions[user_id] = s.session_id
                        return s
            except Exception as exc:
                logger.warning("SessionManager.get_or_create latest failed: %s", exc)

        # Create fresh new conversation
        fresh_id = f"sess_{uuid.uuid4().hex[:12]}"
        new_session = CompanionSession(
            session_id=fresh_id,
            user_id=user_id,
            title="New Chat",
            platform=platform,
            device=device,
        )
        user_sessions[fresh_id] = new_session
        self._active_sessions[user_id] = fresh_id
        await self._save_session(new_session)
        return new_session

    async def create_conversation(
        self,
        user_id: str,
        title: str = "New Chat",
        platform: str = "web",
        device: str = "browser",
    ) -> CompanionSession:
        """Explicitly create a new conversation for user (ChatGPT '+ New Chat')."""
        fresh_id = f"sess_{uuid.uuid4().hex[:12]}"
        session = CompanionSession(
            session_id=fresh_id,
            user_id=user_id,
            title=title.strip() or "New Chat",
            platform=platform,
            device=device,
        )
        user_sessions = self._sessions.setdefault(user_id, {})
        user_sessions[fresh_id] = session
        self._active_sessions[user_id] = fresh_id
        await self._save_session(session)
        return session

    async def list_conversations(self, user_id: str) -> List[Dict[str, Any]]:
        """List all conversations for user sorted by last active descending."""
        user_sessions = self._sessions.setdefault(user_id, {})

        # Fetch from MongoDB to populate all past conversations
        if self._mongo_available and self._session_col is not None:
            try:
                import asyncio
                def _fetch_all():
                    return list(
                        self._session_col.find({"user_id": user_id})
                        .sort("last_active", -1)
                        .limit(50)
                    )
                docs = await asyncio.to_thread(_fetch_all)
                for d in docs:
                    s = self._from_doc(d)
                    if s.session_id not in user_sessions:
                        user_sessions[s.session_id] = s
            except Exception as exc:
                logger.warning("SessionManager.list_conversations failed: %s", exc)

        # Sort in-memory sessions by last_active descending
        sorted_sessions = sorted(
            user_sessions.values(),
            key=lambda x: x.last_active,
            reverse=True,
        )
        return [s.to_dict() for s in sorted_sessions]

    async def get_conversation(self, user_id: str, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific conversation and all its message turns."""
        session = await self.get_or_create(user_id=user_id, session_id=session_id)
        if not session:
            return None

        # Fetch history turns for this session
        history = self._histories.get(session.session_id, [])
        if not history and self._mongo_available and self._history_col is not None:
            try:
                import asyncio
                def _fetch():
                    return list(
                        self._history_col.find({"session_id": session.session_id})
                        .sort("timestamp", 1)
                    )
                docs = await asyncio.to_thread(_fetch)
                history = [
                    MessageTurn(
                        role=d["role"],
                        content=d["content"],
                        timestamp=d.get("timestamp", ""),
                        capability_result=d.get("capability_result"),
                    )
                    for d in docs
                ]
                self._histories[session.session_id] = history
            except Exception as exc:
                logger.warning("SessionManager.get_conversation history failed: %s", exc)

        return {
            "conversation": session.to_dict(),
            "messages": [t.to_dict() for t in history],
        }

    async def rename_conversation(self, user_id: str, session_id: str, new_title: str) -> bool:
        """Rename a conversation."""
        clean_title = (new_title or "").strip()
        if not clean_title:
            return False

        user_sessions = self._sessions.get(user_id, {})
        session = user_sessions.get(session_id)
        if not session and self._mongo_available and self._session_col is not None:
            session = await self.get_or_create(user_id=user_id, session_id=session_id)

        if session:
            session.title = clean_title[:60]
            session.last_active = datetime.now(timezone.utc).isoformat()
            await self._save_session(session)
            return True
        return False

    async def delete_conversation(self, user_id: str, session_id: str) -> bool:
        """Delete a conversation and all its message history."""
        user_sessions = self._sessions.get(user_id, {})
        user_sessions.pop(session_id, None)
        self._histories.pop(session_id, None)

        if self._active_sessions.get(user_id) == session_id:
            # Pick next available session or clear active
            remaining = list(user_sessions.keys())
            self._active_sessions[user_id] = remaining[0] if remaining else None

        if self._mongo_available:
            try:
                import asyncio
                if self._session_col is not None:
                    await asyncio.to_thread(
                        self._session_col.delete_one,
                        {"user_id": user_id, "session_id": session_id}
                    )
                if self._history_col is not None:
                    await asyncio.to_thread(
                        self._history_col.delete_many,
                        {"session_id": session_id}
                    )
            except Exception as exc:
                logger.warning("SessionManager.delete_conversation failed: %s", exc)

        return True

    async def touch(self, user_id: str, capability: Optional[str] = None, session_id: Optional[str] = None) -> None:
        user_sessions = self._sessions.get(user_id, {})
        sid = session_id or self._active_sessions.get(user_id)
        session = user_sessions.get(sid) if sid else None
        if session:
            session.touch()
            if capability and capability not in session.capabilities_used:
                session.capabilities_used.append(capability)
            await self._save_session(session)

    async def add_turn(
        self,
        user_id: str,
        role: str,
        content: str,
        capability_result: Optional[Dict] = None,
        session_id: Optional[str] = None,
    ) -> None:
        """Add a turn to the conversation history and auto-title on first user turn."""
        session = await self.get_or_create(user_id=user_id, session_id=session_id)
        if not session:
            return

        turn = MessageTurn(role=role, content=content, capability_result=capability_result)
        history = self._histories.setdefault(session.session_id, [])
        history.append(turn)

        # ChatGPT auto-title generation on first user prompt if still default title
        if role == "user" and session.title in ("New Chat", "Untitled", "", "New Conversation"):
            clean_text = re.sub(r'[\r\n\t]+', ' ', content).strip()
            # Clean leading commands / polite fillers
            clean_text = re.sub(r'^(hey|hi|hello|please|can you|could you)\s+', '', clean_text, flags=re.IGNORECASE)
            words = clean_text.split()
            if words:
                joined = " ".join(words[:8])
                auto_title = joined[0].upper() + joined[1:] if joined else "New Chat"
                if len(auto_title) > 42:
                    auto_title = auto_title[:39].rstrip() + "..."
                session.title = auto_title

        session.touch()
        # Keep last 150 turns in memory
        if len(history) > 150:
            self._histories[session.session_id] = history[-150:]

        await self._save_turn(session.session_id, turn)
        await self._save_session(session)

    async def get_history(self, user_id: str, limit: int = 20, session_id: Optional[str] = None) -> List[Dict]:
        """
        Returns last N turns as OpenAI-compatible message dicts.
        [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]
        """
        user_sessions = self._sessions.get(user_id, {})
        sid = session_id or self._active_sessions.get(user_id)
        session = user_sessions.get(sid) if sid else None

        if not session:
            session = await self.get_or_create(user_id=user_id, session_id=session_id)

        if not session:
            return []

        history = self._histories.get(session.session_id, [])

        # Try MongoDB if cache empty
        if not history and self._mongo_available and self._history_col is not None:
            try:
                import asyncio
                def _fetch():
                    return list(
                        self._history_col.find({"session_id": session.session_id})
                        .sort("timestamp", -1)
                        .limit(limit)
                    )
                docs = await asyncio.to_thread(_fetch)
                history = [
                    MessageTurn(
                        role=d["role"],
                        content=d["content"],
                        timestamp=d.get("timestamp", ""),
                        capability_result=d.get("capability_result"),
                    )
                    for d in reversed(docs)
                ]
                self._histories[session.session_id] = history
            except Exception as exc:
                logger.warning("SessionManager.get_history failed: %s", exc)

        recent = history[-limit:]
        return [
            {"role": t.role, "content": t.content}
            for t in recent
        ]

    async def clear_session(self, user_id: str, session_id: Optional[str] = None) -> None:
        """Clear specific session or all user sessions."""
        if session_id:
            await self.delete_conversation(user_id, session_id)
            return

        self._sessions.pop(user_id, None)
        self._active_sessions.pop(user_id, None)

        if self._mongo_available and self._session_col is not None:
            try:
                import asyncio
                await asyncio.to_thread(self._session_col.delete_many, {"user_id": user_id})
            except Exception as exc:
                logger.warning("SessionManager.clear failed: %s", exc)

    # ── persistence ─────────────────────────────────────────────────

    async def _save_session(self, session: CompanionSession) -> None:
        if not self._mongo_available or self._session_col is None:
            return
        try:
            import asyncio
            await asyncio.to_thread(
                self._session_col.replace_one,
                {"user_id": session.user_id, "session_id": session.session_id},
                session.to_dict(),
                True,
            )
        except Exception as exc:
            logger.warning("SessionManager._save_session failed: %s", exc)

    async def _save_turn(self, session_id: str, turn: MessageTurn) -> None:
        if not self._mongo_available or self._history_col is None:
            return
        try:
            import asyncio
            doc = {
                "session_id": session_id,
                "role": turn.role,
                "content": turn.content,
                "timestamp": turn.timestamp,
                "capability_result": turn.capability_result,
            }
            await asyncio.to_thread(self._history_col.insert_one, doc)
        except Exception as exc:
            logger.warning("SessionManager._save_turn failed: %s", exc)

    @staticmethod
    def _from_doc(doc: Dict) -> CompanionSession:
        return CompanionSession(
            session_id=doc["session_id"],
            user_id=doc["user_id"],
            title=doc.get("title", "New Chat"),
            platform=doc.get("platform", "web"),
            device=doc.get("device", "browser"),
            started_at=doc.get("started_at", ""),
            last_active=doc.get("last_active", ""),
            turn_count=doc.get("turn_count", 0),
            capabilities_used=doc.get("capabilities_used", []),
        )


# Singleton
session_manager = SessionManager()
