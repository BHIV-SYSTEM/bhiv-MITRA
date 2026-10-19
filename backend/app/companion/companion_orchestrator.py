"""
companion_orchestrator.py — Mitra Companion Brain

Main entry point for all companion interactions.
Unifies streaming and non-streaming requests into a single canonical pipeline:
message → context/session → normalize & coreference → store user turn (once)
        → intent classify → safety gate → capability route OR conversation
        → response synthesis → store assistant turn (once) → return/stream events
"""
from __future__ import annotations

import os
import re
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List, Optional

from app.companion.companion_config import get_companion_config
from app.companion.companion_memory import companion_memory
from app.companion.companion_session import session_manager
from app.companion.capability_registry import capability_registry
from app.companion.personality_engine import personality_engine
from app.core.llm_bridge import llm_bridge
from app.core.intentflow import intent_flow
from app.capabilities.base_capability import CapabilityResult

logger = logging.getLogger(__name__)

# Intent → capability name mapping (extends IntentFlow's patterns)
_CAPABILITY_INTENT_MAP: Dict[str, str] = {
    "email":         "email",
    "calendar":      "calendar",
    "whatsapp":      "whatsapp",
    "telegram":      "whatsapp",
    "instagram":     "whatsapp",
    "reminder":      "reminder",
    "ems":           "task",
    "task":          "task",
    "search":        "browser",
    "device":        "notification",
    "samruddhi":     "samruddhi",
    "portfolio":     "samruddhi",
    "balance":       "samruddhi",
    "trades":        "samruddhi",
    "transactions":  "samruddhi",
    "artha":         "samruddhi",
    "samachar":      "samachar",
    "news":          "samachar",
    "headlines":     "samachar",
    "setu":          "setu",
    "inventory":     "setu",
    "stock":         "setu",
    "orders":        "setu",
    "uniguru":       "uniguru",
    "knowledge":     "uniguru",
}

# Patterns for direct self-referential / identity questions
_SELF_IDENTITY_PATTERNS = [
    r"what(?:'s|\s+is)\s+your\s+name",
    r"what\s+are\s+you\s+called",
    r"what\s+should\s+i\s+call\s+you",
    r"tell\s+me\s+your\s+name",
    r"who\s+are\s+you",
    r"what\s+are\s+you",
    r"who\s+(?:created|made|built|programmed|developed|designed)\s+you",
    r"who\s+is\s+your\s+creator",
    r"what\s+can\s+you\s+do",
    r"what\s+do\s+you\s+do",
    r"what\s+are\s+your\s+capabilities",
    r"what\s+can\s+you\s+help\s+(?:me\s+)?with",
    r"how\s+can\s+you\s+help\s+me",
    r"are\s+you\s+(?:an?\s+)?ai\b",
    r"are\s+you\s+(?:an?\s+)?(?:chat)?bot\b",
    r"are\s+you\s+human\b",
    r"what\s+(?:ai\s+)?model\s+are\s+you",
    r"what\s+ai\s+are\s+you",
    r"which\s+(?:ai\s+)?model\s+are\s+you",
    r"are\s+you\s+(?:chatgpt|gpt|openai|claude|llama|gemini)",
]

_KNOWLEDGE_KEYWORDS = {
    "explain", "what is", "how does", "define", "teach",
    "learn", "study", "concept", "theory", "difference between",
    "why does", "how do", "what are", "meaning of",
}


@dataclass
class CompanionResponse:
    message: str
    capability_result: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    trace_id: Optional[str] = None
    intent: Optional[str] = None
    suggested_actions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message":           self.message,
            "capability_result": self.capability_result,
            "session_id":        self.session_id,
            "trace_id":          self.trace_id,
            "intent":            self.intent,
            "suggested_actions": self.suggested_actions,
        }


def is_internal_action_payload(obj: Any) -> bool:
    """
    Check if a parsed JSON object represents an internal capability/tool action payload
    that should never be emitted as ordinary assistant prose.
    """
    if not isinstance(obj, dict):
        return False
    keys = {str(k).lower() for k in obj.keys()}
    known_caps = {
        "email", "calendar", "whatsapp", "reminder", "task", "notes",
        "contacts", "notification", "browser", "document", "uniguru", "samachar", "search", "samruddhi"
    }
    if "action" in keys:
        action_val = str(obj.get("action", "")).lower()
        if any(k in keys for k in ("parameters", "params", "args", "arguments", "payload", "input")):
            return True
        if action_val in known_caps:
            return True
    if any(k in keys for k in ("tool", "tool_call", "tool_calls", "function_call")):
        return True
    if "function" in keys:
        func_val = obj.get("function")
        if isinstance(func_val, dict):
            return True
        if isinstance(func_val, str) and (func_val.lower() in known_caps or any(k in keys for k in ("arguments", "parameters", "args"))):
            return True
        if any(k in keys for k in ("arguments", "parameters", "name")):
            return True
    if "name" in keys and any(k in keys for k in ("parameters", "arguments", "params")):
        name_val = str(obj.get("name", "")).lower()
        if name_val in known_caps:
            return True
    if obj.get("type") in ("action", "tool_call", "function_call", "capability_call"):
        return True
    if obj.get("capability") in known_caps and any(k in keys for k in ("parameters", "params", "action")):
        return True
    return False


async def filter_action_tokens(token_stream: AsyncIterator[str]) -> AsyncIterator[str]:
    """
    Buffer-aware streaming filter that recognizes and suppresses naked internal action/tool
    JSON envelopes before they reach the user, while preserving markdown code fences,
    legitimate user-requested JSON, and ordinary conversational text.
    """
    buffer: List[str] = []
    in_code_fence = False
    fence_backticks = 0
    in_potential_json = False
    brace_depth = 0
    in_string = False
    escape_next = False
    max_buffer_chars = 4000

    async for token in token_stream:
        i = 0
        while i < len(token):
            ch = token[i]
            if ch == '`':
                fence_backticks += 1
                if fence_backticks == 3:
                    in_code_fence = not in_code_fence
            else:
                fence_backticks = 0
            i += 1

        if in_code_fence:
            if buffer:
                for b in buffer:
                    yield b
                buffer = []
                in_potential_json = False
                brace_depth = 0
            yield token
            continue

        if not in_potential_json:
            brace_idx = token.find('{')
            if brace_idx == -1:
                yield token
            else:
                pre_brace = token[:brace_idx]
                if pre_brace:
                    yield pre_brace
                remainder = token[brace_idx:]
                in_potential_json = True
                brace_depth = 0
                in_string = False
                escape_next = False
                buffer = [remainder]
                for ch in remainder:
                    if escape_next:
                        escape_next = False
                        continue
                    if ch == '\\':
                        if in_string:
                            escape_next = True
                        continue
                    if ch == '"':
                        in_string = not in_string
                        continue
                    if not in_string:
                        if ch == '{':
                            brace_depth += 1
                        elif ch == '}':
                            brace_depth -= 1
                            if brace_depth == 0:
                                buffered_text = ''.join(buffer)
                                try:
                                    parsed = json.loads(buffered_text.strip())
                                    if is_internal_action_payload(parsed):
                                        buffer = []
                                        in_potential_json = False
                                        break
                                    else:
                                        for b in buffer:
                                            yield b
                                        buffer = []
                                        in_potential_json = False
                                        break
                                except Exception:
                                    pass
        else:
            buffer.append(token)
            for ch in token:
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\':
                    if in_string:
                        escape_next = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if not in_string:
                    if ch == '{':
                        brace_depth += 1
                    elif ch == '}':
                        brace_depth -= 1
                        if brace_depth == 0:
                            buffered_text = ''.join(buffer)
                            try:
                                parsed = json.loads(buffered_text.strip())
                                if is_internal_action_payload(parsed):
                                    buffer = []
                                    in_potential_json = False
                                    break
                                else:
                                    for b in buffer:
                                        yield b
                                    buffer = []
                                    in_potential_json = False
                                    break
                            except Exception:
                                pass

            if in_potential_json and sum(len(b) for b in buffer) > max_buffer_chars:
                for b in buffer:
                    yield b
                buffer = []
                in_potential_json = False
                brace_depth = 0

    if buffer:
        buffered_text = ''.join(buffer)
        try:
            parsed = json.loads(buffered_text.strip())
            if is_internal_action_payload(parsed):
                buffer = []
            else:
                for b in buffer:
                    yield b
        except Exception:
            for b in buffer:
                yield b


class CompanionOrchestrator:
    """
    The Mitra companion brain.
    Unified canonical pipeline for streaming and non-streaming requests:
    Routes each user message to the right handler:
    - Capability invocation (email, calendar, tasks, etc.)
    - Knowledge query (UniGuru)
    - General companion conversation (LLM)
    All paths go through Mitra safety gate.
    """

    def __init__(self) -> None:
        self._config = get_companion_config()
        # Ensure capabilities are registered in registry if not yet populated
        if not capability_registry.get_capabilities():
            try:
                from app.capabilities import register_all_capabilities
                register_all_capabilities()
            except Exception as e:
                logger.warning("Could not auto-register capabilities in CompanionOrchestrator: %s", e)

    async def process_stream(
        self,
        user_id: str,
        message: str,
        platform: str = "web",
        device: str = "browser",
        trace_id: Optional[str] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Canonical streaming pipeline for all Mitra conversational interactions.
        Yields structured SSE events:
          - message_start
          - capability_started
          - approval_required (if pending confirmation card is needed)
          - capability_result
          - assistant_delta
          - message_complete
          - error
        """
        from app.runtime.canonical_context import create_canonical_context
        from app.runtime.runtime_event_bus import runtime_event_bus
        from app.core.text_normalizer import normalize_text_async, resolve_coreference_query_async

        # Store page_context if provided directly in request
        if page_context:
            try:
                await companion_memory.set_fact(
                    user_id=user_id,
                    key="active_ui_context",
                    value=json.dumps(page_context),
                    source="dom_scraper",
                )
            except Exception:
                pass

        # 0. Enforce Canonical Context (trace_id, correlation_id, execution_id)
        ctx = create_canonical_context(
            user_id=user_id,
            trace_id=trace_id,
            platform=platform,
            device=device,
        )

        await runtime_event_bus.publish(
            event_type="requested",
            user_id=user_id,
            trace_id=ctx.trace_id,
            execution_id=ctx.execution_id,
            data={"message": message, "platform": platform},
        )

        # 1. Get/create session
        session = await session_manager.get_or_create(
            user_id=user_id,
            platform=platform,
            device=device,
            ttl_hours=self._config.session_ttl_hours,
        )

        yield {
            "type": "message_start",
            "request_id": ctx.execution_id,
            "session_id": session.session_id,
        }

        # 2. Dynamic Zero-Shot LLM & Algorithmic Typo Correction + Coreference Resolution
        normalized_message = await normalize_text_async(message)
        recent_history = await session_manager.get_history(user_id, limit=6)
        resolved_message = await resolve_coreference_query_async(normalized_message, recent_history)

        # Store original user turn exactly once in session history
        await session_manager.add_turn(user_id, role="user", content=message)

        # 2.5. Check Conversational Confirmation / Cancellation of Pending Communication Actions (HITL B.COMM-3)
        from app.services.pending_action_service import pending_action_service
        from app.services.communication_service import communication_service

        msg_clean = message.strip()
        msg_lower = msg_clean.lower()
        pact_match = re.search(r'\b(pact_[a-f0-9]{12,32})\b', msg_clean, re.IGNORECASE)
        specific_pact_id = pact_match.group(1) if pact_match else None

        is_confirm_phrase = bool(re.match(r'^(?:yes|confirm|send|send it|confirm send|proceed|yes send it|ok send it|yes please|confirm it)\b', msg_lower)) or bool(specific_pact_id and "confirm" in msg_lower)
        is_cancel_phrase = bool(re.match(r'^(?:no|cancel|don\'t send|abort|stop)\b', msg_lower)) or bool(specific_pact_id and "cancel" in msg_lower)

        if is_confirm_phrase or is_cancel_phrase:
            pending_act = (
                pending_action_service.get_pending_action(specific_pact_id, user_id)
                if specific_pact_id
                else pending_action_service.get_latest_active_pending_action(user_id)
            )

            if pending_act and pending_act.status == "PENDING":
                if is_confirm_phrase:
                    comm_res = communication_service.confirm_pending_action(
                        pending_action_id=pending_act.pending_action_id,
                        user_id=user_id,
                        trace_id=ctx.trace_id,
                    )
                    cap_result_data = comm_res.to_dict()
                    if comm_res.status in ("sent", "ready", "success"):
                        response_text = (
                            f"✅ WhatsApp message successfully dispatched to {pending_act.recipient} via Meta Cloud API!\n"
                            f"(Status: Accepted by Meta, awaiting delivery confirmation receipt)."
                        )
                    else:
                        response_text = f"❌ WhatsApp dispatch failed: {comm_res.error or comm_res.message}"

                    yield {
                        "type": "capability_result",
                        "request_id": ctx.execution_id,
                        "capability": "whatsapp",
                        "status": "success" if comm_res.status in ("sent", "ready", "success") else "failed",
                        "summary": response_text,
                        "data": self._sanitize_client_data(cap_result_data),
                    }
                    yield {
                        "type": "assistant_delta",
                        "request_id": ctx.execution_id,
                        "delta": response_text,
                    }
                    yield {
                        "type": "message_complete",
                        "request_id": ctx.execution_id,
                        "message": response_text,
                        "intent": "whatsapp",
                        "capability_result": self._sanitize_client_data(cap_result_data),
                    }
                    await session_manager.add_turn(user_id, role="assistant", content=response_text)
                    return

                elif is_cancel_phrase:
                    success, err, data = pending_action_service.cancel_pending_action(
                        pending_action_id=pending_act.pending_action_id,
                        user_id=user_id,
                    )
                    response_text = f"🚫 WhatsApp message to {pending_act.recipient} has been cancelled."
                    yield {
                        "type": "capability_result",
                        "request_id": ctx.execution_id,
                        "capability": "whatsapp",
                        "status": "cancelled",
                        "summary": response_text,
                        "data": {"status": "cancelled", "pending_action_id": pending_act.pending_action_id},
                    }
                    yield {
                        "type": "assistant_delta",
                        "request_id": ctx.execution_id,
                        "delta": response_text,
                    }
                    yield {
                        "type": "message_complete",
                        "request_id": ctx.execution_id,
                        "message": response_text,
                        "intent": "whatsapp",
                    }
                    await session_manager.add_turn(user_id, role="assistant", content=response_text)
                    return

        # 3. Classify intent
        intent_data = intent_flow.process_text(message)
        intent = intent_data.get("intent", "general")

        await runtime_event_bus.publish(
            event_type="running",
            user_id=user_id,
            trace_id=ctx.trace_id,
            execution_id=ctx.execution_id,
            data={"intent": intent},
        )

        # 4. Mitra safety gate
        if self._config.safety_gate_enabled:
            blocked, block_reason = await self._safety_check(message, user_id, ctx.trace_id)
            if blocked:
                response_text = personality_engine.build_capability_fail(
                    "I can't help with that particular request."
                )
                await session_manager.add_turn(user_id, role="assistant", content=response_text)
                await runtime_event_bus.publish(
                    event_type="failed",
                    user_id=user_id,
                    trace_id=ctx.trace_id,
                    execution_id=ctx.execution_id,
                    data={"reason": block_reason or "safety_gate_blocked"},
                )
                yield {
                    "type": "assistant_delta",
                    "request_id": ctx.execution_id,
                    "delta": response_text,
                }
                yield {
                    "type": "message_complete",
                    "request_id": ctx.execution_id,
                    "message": response_text,
                    "intent": intent,
                }
                return

        # 5. Route: capability / knowledge / conversation
        capability_result: Optional[CapabilityResult] = None
        response_text: str = ""

        # Check active UI context from request page_context
        active_host_app = (page_context or {}).get("host_app", "")

        is_self_identity = self._is_self_identity_query(message) or self._is_self_identity_query(resolved_message)
        if is_self_identity:
            capability_name = None
            is_knowledge = False
        elif intent in ("setu", "inventory", "stock", "orders") or any(kw in message.lower() for kw in ["inventory", "stock", "tea leaves", "setu", "sku"]):
            capability_name = "setu"
            intent = "setu"
            is_knowledge = False
        elif active_host_app == "uniguru":
            is_knowledge = True
            capability_name = None
            intent = "knowledge"
        elif active_host_app == "setu":
            capability_name = "setu"
            intent = "setu"
            is_knowledge = False
        elif active_host_app == "artha":
            capability_name = "samruddhi"
            intent = "portfolio"
            is_knowledge = False
        else:
            capability_name = _CAPABILITY_INTENT_MAP.get(intent)
            is_knowledge = self._is_knowledge_query(resolved_message, intent)

        if capability_name and capability_name in self._config.enabled_capabilities:
            # ── Capability path ───────────────────────────────────────
            yield {
                "type": "capability_started",
                "request_id": ctx.execution_id,
                "capability": capability_name,
                "intent": intent,
            }
            await runtime_event_bus.publish(
                event_type="capability_running",
                user_id=user_id,
                trace_id=ctx.trace_id,
                execution_id=ctx.execution_id,
                capability=capability_name,
                data={"intent": intent},
            )
            params = {
                "message":      resolved_message,
                "entities":     intent_data.get("entities", {}),
                "dates":        intent_data.get("dates_times", {}),
                "context":      intent_data.get("context", {}),
                "user_id":      user_id,
                "trace_id":     ctx.trace_id,
                "execution_id": ctx.execution_id,
            }
            capability_result = await capability_registry.execute(
                intent=intent, params=params, trace_id=ctx.trace_id
            )
            if capability_result and capability_result.status == "success":
                if capability_result.capability == "samachar":
                    # Generate a conversational news response using LLM with returned data
                    cap_data = capability_result.data or {}
                    scraped_info = cap_data.get("scraped_data", {})
                    vetting_info = cap_data.get("vetting_results", {})
                    summary_info = cap_data.get("summary", {})
                    article_title = scraped_info.get("title") or "News Intelligence Update"
                    article_author = scraped_info.get("author")
                    if isinstance(article_author, dict):
                        article_author = article_author.get("name")
                    article_author = article_author or "News Desk"
                    article_summary = summary_info.get("text") or cap_data.get("result") or "No summary."
                    credibility_rating = vetting_info.get("credibility_rating") or "High"
                    authenticity_score = vetting_info.get("authenticity_score")
                    score_str = f"{authenticity_score}/100" if authenticity_score is not None else "95/100"

                    system_prompt = (
                        "You are Mitra, a real-time AI companion. "
                        "A news retrieval tool (Samachar) was invoked to answer the user's query.\n"
                        "Use the following scraped data and summary to formulate a thoughtful, conversational answer "
                        "summarizing the news for the user. Mention the article title/source and credibility context briefly if relevant.\n\n"
                        f"[SAMACHAR RETRIEVED DATA]:\n"
                        f"- Article Title: {article_title}\n"
                        f"- Author/Source: {article_author}\n"
                        f"- Credibility Rating: {credibility_rating} (Score: {score_str})\n"
                        f"- Summary/Content: {article_summary}\n"
                    )
                    
                    # Patterns that indicate LLM synthesis failed and returned a fallback template or raw search output
                    _TEMPLATE_PATTERNS = (
                        "Real-time search completed for:",
                        "Here is what I found for your query:",
                        "I'm listening and working on fetching",
                        "MITRA intelligence service is currently unavailable",
                        "Web Information Intelligence Summary:",
                    )

                    def _is_template(text: str) -> bool:
                        return any(p in text for p in _TEMPLATE_PATTERNS)

                    # Clean deterministic fallback formatted cleanly when LLM synthesis is unavailable
                    clean_summary = article_summary
                    if "Web Information Intelligence Summary:" in clean_summary:
                        clean_summary = clean_summary.replace("Web Information Intelligence Summary:", "").strip()
                        lines = [l.strip() for l in clean_summary.split("\n") if l.strip()]
                        cleaned_bullets = []
                        for line in lines:
                            line_str = line[2:].strip() if line.startswith("- ") else line
                            cleaned_bullets.append(f"• {line_str}")
                        clean_summary = "\n\n".join(cleaned_bullets[:3])

                    _deterministic_report = (
                        f"Here's what I found regarding **{message}**:\n\n"
                        f"**{article_title}**\n\n"
                        f"{clean_summary}\n\n"
                        f"• **Source / Author:** {article_author}\n"
                        f"• **Source Credibility:** {credibility_rating}\n"
                        f"• **Authenticity Score:** {score_str}"
                    )

                    try:
                        messages = [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": message}
                        ]
                        response_text = await llm_bridge.call_llm_with_messages(
                            model=self._config.llm_provider,
                            messages=messages,
                            temperature=0.7,
                        )
                        # If LLM returned a template/raw search fallback, use the clean deterministic report
                        if _is_template(response_text):
                            logger.info("LLM returned template response for samachar — using clean deterministic Samachar report")
                            response_text = _deterministic_report
                    except Exception as llm_exc:
                        logger.warning("Failed to synthesize news with LLM: %s — using clean deterministic Samachar report", llm_exc)
                        response_text = _deterministic_report

            # Check if action requires structured approval confirmation (B.COMM-3)
            is_approval = False
            pending_action_id = None
            confirmation_data = None
            if capability_result and capability_result.data:
                res_status = capability_result.data.get("status")
                if capability_result.status == "pending" or res_status in ("confirmation_required", "pending"):
                    is_approval = True
                    confirmation_data = capability_result.data.get("confirmation")
                    pending_action_id = capability_result.data.get("pending_action_id") or (
                        confirmation_data.get("pending_action_id") if isinstance(confirmation_data, dict) else None
                    )

            if is_approval:
                yield {
                    "type": "approval_required",
                    "request_id": ctx.execution_id,
                    "capability": capability_name,
                    "intent": capability_result.intent or intent,
                    "pending_action_id": pending_action_id,
                    "confirmation": self._sanitize_client_data(confirmation_data),
                    "summary": capability_result.summary,
                }

            if capability_result:
                yield {
                    "type": "capability_result",
                    "request_id": ctx.execution_id,
                    "capability": capability_name,
                    "status": capability_result.status,
                    "summary": capability_result.summary,
                    "data": self._sanitize_client_data(capability_result.data),
                }

            # Response synthesis
            if capability_result and (capability_result.status in ("success", "pending") or is_approval):
                if capability_name in ("browser", "samachar"):
                    async for token in self._stream_conversation(
                        message=resolved_message,
                        user_id=user_id,
                        extra_context=f"[REAL-TIME LIVE DATA CONTEXT]:\n{capability_result.summary}",
                        raw_message=message,
                    ):
                        response_text += token
                        yield {
                            "type": "assistant_delta",
                            "request_id": ctx.execution_id,
                            "delta": token,
                        }
                elif capability_name == "uniguru":
                    # When a successful UniGuru result contains user-facing data["answer"], deliver the answer directly
                    ug_data = capability_result.data or {}
                    ug_answer = ug_data.get("answer")
                    if isinstance(ug_answer, str) and ug_answer.strip():
                        response_text = ug_answer.strip()
                    elif isinstance(ug_answer, dict) and ug_answer.get("response_content"):
                        response_text = str(ug_answer.get("response_content")).strip()
                    else:
                        response_text = personality_engine.build_capability_confirm(
                            capability_result.summary
                        )
                    yield {
                        "type": "assistant_delta",
                        "request_id": ctx.execution_id,
                        "delta": response_text,
                    }
                else:
                    response_text = personality_engine.build_capability_confirm(
                        capability_result.summary
                    )
                    yield {
                        "type": "assistant_delta",
                        "request_id": ctx.execution_id,
                        "delta": response_text,
                    }

                await companion_memory.log_capability_use(
                    user_id, capability_result.capability, intent, success=True
                )
                await session_manager.touch(user_id, capability=capability_name)
                await runtime_event_bus.publish(
                    event_type="completed",
                    user_id=user_id,
                    trace_id=ctx.trace_id,
                    execution_id=ctx.execution_id,
                    capability=capability_name,
                    data={"status": capability_result.status},
                )
            else:
                err = capability_result.error if capability_result else "Unknown error"
                response_text = personality_engine.build_capability_fail(err)
                yield {
                    "type": "assistant_delta",
                    "request_id": ctx.execution_id,
                    "delta": response_text,
                }
                if capability_result:
                    await companion_memory.log_capability_use(
                        user_id, capability_result.capability, intent, success=False
                    )
                await runtime_event_bus.publish(
                    event_type="failed",
                    user_id=user_id,
                    trace_id=ctx.trace_id,
                    execution_id=ctx.execution_id,
                    capability=capability_name,
                    data={"error": err},
                )

        elif is_knowledge and "uniguru" in self._config.enabled_capabilities:
            # ── UniGuru knowledge path ────────────────────────────────
            yield {
                "type": "capability_started",
                "request_id": ctx.execution_id,
                "capability": "uniguru",
                "intent": "knowledge",
            }
            await runtime_event_bus.publish(
                event_type="capability_running",
                user_id=user_id,
                trace_id=ctx.trace_id,
                execution_id=ctx.execution_id,
                capability="uniguru",
            )
            async for token in self._stream_knowledge(resolved_message, user_id, raw_message=message):
                response_text += token
                yield {
                    "type": "assistant_delta",
                    "request_id": ctx.execution_id,
                    "delta": token,
                }
            await runtime_event_bus.publish(
                event_type="completed",
                user_id=user_id,
                trace_id=ctx.trace_id,
                execution_id=ctx.execution_id,
                capability="uniguru",
            )

        else:
            # ── General conversation path ─────────────────────────────
            yield {
                "type": "capability_started",
                "request_id": ctx.execution_id,
                "capability": "conversation",
                "intent": intent,
            }
            await runtime_event_bus.publish(
                event_type="capability_running",
                user_id=user_id,
                trace_id=ctx.trace_id,
                execution_id=ctx.execution_id,
                capability="conversation",
            )
            async for token in self._stream_conversation(resolved_message, user_id, raw_message=message):
                response_text += token
                yield {
                    "type": "assistant_delta",
                    "request_id": ctx.execution_id,
                    "delta": token,
                }
            if not response_text.strip():
                fallback_msg = "I've processed your request."
                response_text = fallback_msg
                yield {
                    "type": "assistant_delta",
                    "request_id": ctx.execution_id,
                    "delta": fallback_msg,
                }
            await runtime_event_bus.publish(
                event_type="completed",
                user_id=user_id,
                trace_id=ctx.trace_id,
                execution_id=ctx.execution_id,
                capability="conversation",
            )

        # 6. Store assistant turn exactly once in session history
        await session_manager.add_turn(
            user_id,
            role="assistant",
            content=response_text,
            capability_result=capability_result.to_dict() if capability_result else None,
        )

        # 7. Auto-extract facts from message (name, preferences)
        await self._extract_facts(user_id, message, intent_data)

        # 8. Emit final complete event
        yield {
            "type": "message_complete",
            "request_id": ctx.execution_id,
            "message": response_text,
            "capability_result": self._sanitize_client_data(capability_result.to_dict()) if capability_result else None,
            "intent": intent,
            "suggested_actions": self._suggest_actions(intent, capability_result),
        }

    async def process(
        self,
        user_id: str,
        message: str,
        platform: str = "web",
        device: str = "browser",
        trace_id: Optional[str] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> CompanionResponse:
        """
        Non-streaming response wrapper delegating to canonical process_stream pipeline.
        Guarantees exact parity between streaming and REST responses.
        """
        final_message = ""
        cap_result_dict = None
        session_id = None
        intent = None
        suggested_actions: List[str] = []

        async for event in self.process_stream(
            user_id=user_id,
            message=message,
            platform=platform,
            device=device,
            trace_id=trace_id,
            page_context=page_context,
        ):
            etype = event.get("type")
            if etype == "message_start":
                session_id = event.get("session_id")
            elif etype == "assistant_delta":
                final_message += event.get("delta", "")
            elif etype == "message_complete":
                final_message = event.get("message", final_message)
                cap_result_dict = event.get("capability_result")
                intent = event.get("intent")
                suggested_actions = event.get("suggested_actions", [])

        return CompanionResponse(
            message=final_message,
            capability_result=cap_result_dict,
            session_id=session_id,
            trace_id=trace_id,
            intent=intent,
            suggested_actions=suggested_actions,
        )

    async def stream_conversation_tokens(self, message: str, user_id: str) -> AsyncIterator[str]:
        """
        Token generator delegating to canonical process_stream pipeline.
        Maintains backwards compatibility for callers expecting a stream of delta strings.
        """
        async for event in self.process_stream(user_id=user_id, message=message):
            if event.get("type") == "assistant_delta":
                yield event.get("delta", "")

    async def get_greeting(self, user_id: str) -> str:
        """Return a personalized greeting for the user."""
        facts = await companion_memory.get_user_facts(user_id)
        raw_name = facts.get("name") or "User"
        user_name = "User" if raw_name.lower() in ("there", "user_default", "using", "anonymous") else raw_name
        return personality_engine.build_greeting(user_name=user_name)

    # ── private helpers ───────────────────────────────────────────

    def _build_llm_messages(
        self,
        system_prompt: str,
        history: List[Dict[str, Any]],
        current_user_message: str,
        raw_message: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """
        Construct LLM messages array ensuring the current user message appears exactly once.
        Strips any trailing user turn from history that matches raw_message or current_user_message
        to prevent duplicate user messages when history is retrieved after add_turn().
        """
        clean_history = []
        for h in history:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role == "assistant" and content:
                stripped = content.strip()
                if stripped.startswith("{") and stripped.endswith("}"):
                    try:
                        parsed = json.loads(stripped)
                        if is_internal_action_payload(parsed):
                            continue
                    except Exception:
                        pass
            clean_history.append({"role": role, "content": content})

        if clean_history and clean_history[-1].get("role") == "user":
            last_content = clean_history[-1].get("content", "")
            if (raw_message and last_content == raw_message) or last_content == current_user_message:
                clean_history.pop()

        return (
            [{"role": "system", "content": system_prompt}]
            + clean_history
            + [{"role": "user", "content": current_user_message}]
        )

    def _sanitize_client_data(self, data: Any) -> Any:
        """Strip sensitive credentials, token hashes, and internal keys before emitting to client."""
        if not isinstance(data, dict):
            return data
        sensitive_keys = {
            "access_token", "refresh_token", "token", "credentials",
            "secret", "token_hash", "encryption_key", "internal_trace_id",
            "_debug", "client_secret",
        }
        sanitized = {}
        for k, v in data.items():
            if str(k).lower() in sensitive_keys:
                continue
            if isinstance(v, dict):
                sanitized[k] = self._sanitize_client_data(v)
            elif isinstance(v, list):
                sanitized[k] = [self._sanitize_client_data(i) if isinstance(i, dict) else i for i in v]
            else:
                sanitized[k] = v
        return sanitized

    async def _safety_check(
        self, message: str, user_id: str, trace_id: Optional[str]
    ) -> tuple[bool, str]:
        """Run message through Mitra safety gate. Returns (blocked, reason)."""
        try:
            from app.services.mitra_control_plane_service import (
                MitraControlPlaneService,
                MitraAuthorityInput,
            )
            svc = MitraControlPlaneService()
            result = svc.evaluate(
                MitraAuthorityInput(
                    input_text=message,
                    raw_input={"message": message},
                    user_id=user_id,
                    source="companion",
                )
            )
            status = result.get("response_contract", {}).get("status", "ALLOW")
            if status == "BLOCK":
                return True, result.get("response_contract", {}).get("reason", "Blocked")
            return False, ""
        except Exception as exc:
            logger.warning("Safety gate error: %s — failing open for conversation", exc)
            return False, ""

    async def _stream_conversation(
        self,
        message: str,
        user_id: str,
        extra_context: Optional[str] = None,
        raw_message: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Stream general LLM conversation tokens with full context & live web/market integration."""
        facts = await companion_memory.get_user_facts(user_id)
        user_name = facts.get("name") or "there"
        system_prompt = personality_engine.build_system_prompt(
            user_name=user_name,
            user_facts=facts,
            enabled_capabilities=self._config.enabled_capabilities,
        )

        if "active_ui_context" in facts:
            try:
                ctx_obj = json.loads(facts["active_ui_context"])
                buttons_str = ", ".join(ctx_obj.get("buttons", [])) or "None detected"
                headings_str = ", ".join(ctx_obj.get("headings", [])) or "None detected"
                fields_str = ", ".join(ctx_obj.get("fields", [])) or "None detected"
                snippet = (ctx_obj.get("snippet") or "")[:400]

                system_prompt += (
                    f"\n\n[ACTIVE HOST APP SCREEN CONTEXT (DOM SCRAPED)]:\n"
                    f"- Page Title: {ctx_obj.get('title', 'Unknown Page')}\n"
                    f"- URL: {ctx_obj.get('url', 'Unknown URL')}\n"
                    f"- Visible Buttons: {buttons_str}\n"
                    f"- Visible Headings/Sections: {headings_str}\n"
                    f"- Visible Form Fields: {fields_str}\n"
                    f"- Visible Content Snippet: {snippet}\n\n"
                    "INSTRUCTION: The user is currently looking at this active application screen. "
                    "Use this exact screen context to answer questions about buttons, settings, options, and actions available to them."
                )
            except Exception as e:
                logger.warning(f"UI Context injection error: {e}")

        msg_lower = message.lower()
        live_keywords = [
            "news", "finance", "stock", "share", "market", "sensex", "nifty", "bse", "nse",
            "price", "today", "weather", "crypto", "bitcoin", "btc", "eth", "ethereum",
            "hdfc", "reliance", "tcs", "infosys", "sbi", "icici", "tata", "apple", "tesla",
            "gold", "silver", "commodity", "mutual fund", "sip", "bond", "inflation", "rbi",
            "rate", "currency", "rupee", "dollar", "inr", "usd", "latest", "update", "headline",
            "gain", "loss", "ups", "downs", "up", "down", "rally", "crash"
        ]
        if any(kw in msg_lower for kw in live_keywords):

            try:
                from app.tools.search_tool import SearchTool
                search_tool = SearchTool()
                live_info = await search_tool.run(message)
                if live_info:
                    system_prompt += (
                        f"\n\n[REAL-TIME LIVE DATA INJECTED FOR USER QUERY]:\n{live_info}\n"
                        "Instruction: Use the exact live numbers and news snippet provided above. "
                        "Do NOT guess or hallucinate stock prices or news headlines."
                    )
            except Exception as e:
                logger.warning(f"Live search context enrichment failed: {e}")

        history = await session_manager.get_history(
            user_id, limit=self._config.max_history_turns
        )
        messages = self._build_llm_messages(
            system_prompt=system_prompt,
            history=history,
            current_user_message=message,
            raw_message=raw_message,
        )

        raw_token_stream = llm_bridge.stream_llm_with_messages(
            model=self._config.llm_provider,
            messages=messages,
            temperature=0.7,
        )
        async for token in filter_action_tokens(raw_token_stream):
            yield token

    async def _call_conversation(
        self,
        message: str,
        user_id: str,
        extra_context: Optional[str] = None,
        raw_message: Optional[str] = None,
    ) -> str:
        """Non-streaming general LLM conversation."""
        tokens = []
        async for token in self._stream_conversation(
            message=message,
            user_id=user_id,
            extra_context=extra_context,
            raw_message=raw_message,
        ):
            tokens.append(token)
        return "".join(tokens)

    def _is_self_identity_query(self, message: str) -> bool:
        """Check if message is asking about Mitra's self-identity or capabilities."""
        if not message:
            return False
        cleaned = re.sub(r"[^\w\s']", " ", message.lower()).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        return any(bool(re.search(pat, cleaned)) for pat in _SELF_IDENTITY_PATTERNS)

    def _is_knowledge_query(self, message: str, intent: str) -> bool:
        if self._is_self_identity_query(message):
            return False
        msg_lower = message.lower()
        return any(kw in msg_lower for kw in _KNOWLEDGE_KEYWORDS)

    async def _stream_knowledge(
        self,
        message: str,
        user_id: str,
        raw_message: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Stream primary LLM for knowledge queries, preserving Mitra identity with educational depth."""
        facts = await companion_memory.get_user_facts(user_id)
        user_name = facts.get("name") or "there"
        knowledge_instruction = (
            "Knowledge & Explanation Guidelines:\n"
            "- Explain concepts clearly, accurately, and with structured depth for the user.\n"
            "- Use clean Markdown headings, bullet points, and tables where helpful.\n"
            "- For mathematical or scientific formulas, use standard LaTeX formatting (e.g., \\[ ... \\] for display equations, \\( ... \\) or $...$ for inline expressions).\n"
            "- Keep explanations engaging, maintain your identity as Mitra, and offer to go deeper or give examples."
        )
        system_prompt = personality_engine.build_system_prompt(
            user_name=user_name,
            user_facts=facts,
            enabled_capabilities=self._config.enabled_capabilities,
            extra_context=knowledge_instruction,
        )
        history = await session_manager.get_history(user_id, limit=6)
        messages = self._build_llm_messages(
            system_prompt=system_prompt,
            history=history,
            current_user_message=message,
            raw_message=raw_message,
        )
        primary = os.getenv("COMPANION_LLM_PROVIDER", self._config.llm_provider)
        async for token in llm_bridge.stream_llm_with_messages(
            model=primary,
            messages=messages,
            temperature=0.5,
        ):
            yield token

    async def _call_knowledge(
        self,
        message: str,
        user_id: str,
        raw_message: Optional[str] = None,
    ) -> str:
        """Route to primary LLM for knowledge queries."""
        tokens = []
        async for token in self._stream_knowledge(
            message=message,
            user_id=user_id,
            raw_message=raw_message,
        ):
            tokens.append(token)
        return "".join(tokens)

    async def _extract_facts(
        self, user_id: str, message: str, intent_data: Dict
    ) -> None:
        """Auto-extract user facts (name, preferences) from message."""
        msg_lower = message.lower()
        for phrase in ("my name is ", "i am ", "i'm ", "call me "):
            if phrase in msg_lower:
                idx = msg_lower.index(phrase) + len(phrase)
                candidate = message[idx:].split()[0].strip(".,!?").capitalize()
                if len(candidate) >= 2:
                    await companion_memory.set_fact(user_id, "name", candidate, source="user")
                    break

    def _suggest_actions(
        self,
        intent: str,
        cap_result: Optional[CapabilityResult],
    ) -> List[str]:
        if not cap_result or cap_result.status not in ("success", "pending"):
            return []
        suggestions = {
            "email":    ["View full draft", "Edit before sending"],
            "calendar": ["Add to calendar", "Set a reminder"],
            "reminder": ["View all reminders"],
            "task":     ["View task board"],
        }
        return suggestions.get(intent, [])


# Singleton
companion_orchestrator = CompanionOrchestrator()
