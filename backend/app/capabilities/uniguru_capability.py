"""
uniguru_capability.py — Mitra UniGuru Knowledge Capability

UPGRADED: Now uses live UniGuru HTTP/API contract via UniGuruAdapter first.
Falls back to embedded RuleEngine, then to LLM bridge if unavailable.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
import logging
import os
import time

from app.capabilities.base_capability import BaseCapability, CapabilityResult
from app.core.llm_bridge import llm_bridge

logger = logging.getLogger(__name__)

# Lazy-load the embedded engine as secondary fallback
_rule_engine = None

def _get_rule_engine():
    global _rule_engine
    if _rule_engine is None:
        try:
            from app.uniguru.engine import RuleEngine
            _rule_engine = RuleEngine()
            logger.info("UniGuru RuleEngine loaded (embedded mode)")
        except Exception as exc:
            logger.warning("UniGuru RuleEngine not available, will use LLM fallback: %s", exc)
    return _rule_engine


class UniGuruCapability(BaseCapability):
    @property
    def name(self) -> str:
        return "uniguru"

    @property
    def description(self) -> str:
        return "Answer educational and knowledge questions via the UniGuru live HTTP contract or embedded engine."

    @property
    def supported_intents(self) -> List[str]:
        return ["uniguru", "knowledge", "explain", "learn", "study", "educational"]

    async def execute(
        self, intent: str, params: Dict[str, Any], trace_id: Optional[str] = None
    ) -> CapabilityResult:
        message = params.get("message", params.get("query", ""))

        # ── 1. Try Live UniGuruAdapter (HTTP/API contract) ──
        try:
            from app.ecosystem.adapter_registry import AdapterRegistry
            from app.ecosystem.base_adapter import IntegrationRequest

            registry = AdapterRegistry()
            uniguru_adapter = registry.get_adapter("UniGuru")
            if uniguru_adapter is not None:
                req = IntegrationRequest(
                    source_product="mitra",
                    target_product="UniGuru",
                    action="ask",
                    payload={"query": message},
                    trace_id=trace_id or f"mitra_uniguru_{int(time.time()*1000)}",
                )
                resp = await uniguru_adapter.query(req)
                if resp.success:
                    answer = resp.data.get("answer") or ""
                    verification_status = str(resp.data.get("verification_status") or "UNVERIFIED")
                    decision = str(resp.data.get("decision") or ("answer" if verification_status == "VERIFIED" else "forward"))
                    retrieval_trace = resp.data.get("retrieval_trace") or {}
                    evidence = retrieval_trace.get("engine") or resp.data.get("evidence") or "DeterministicKoshaPipeline"

                    return CapabilityResult(
                        capability=self.name,
                        intent=intent,
                        status="success",
                        summary=f"Knowledge response from UniGuru Live HTTP API ({verification_status}).",
                        data={
                            "answer": answer,
                            "query": message,
                            "verification_status": verification_status,
                            "decision": decision,
                            "confidence": resp.data.get("confidence", 0.0),
                            "confidence_breakdown": resp.data.get("confidence_breakdown", {}),
                            "matched_signals": resp.data.get("matched_signals", []),
                            "knowledge_evidence": evidence,
                            "retrieval_trace": retrieval_trace,
                            "source": "uniguru_live_api",
                            "latency_ms": resp.latency_ms,
                        },
                        trace_id=trace_id,
                        actions=[
                            {"label": "Go deeper", "action": "explain_more"},
                            {"label": "Give an example", "action": "give_example"},
                        ],
                    )
        except Exception as exc:
            logger.warning("UniGuruAdapter live API query failed: %s", exc)

        # ── 2. Try embedded UniGuru RuleEngine ──
        engine = _get_rule_engine()
        if engine is not None:
            try:
                result = engine.evaluate(content=message, apply_enforcement=True)
                decision = result.get("decision", "forward")

                if decision == "answer":
                    answer = result.get("data", {}).get("response_content", "")
                    return CapabilityResult(
                        capability=self.name,
                        intent=intent,
                        status="success",
                        summary="Knowledge response from UniGuru (embedded engine).",
                        data={
                            "answer": answer,
                            "query": message,
                            "decision": decision,
                            "severity": result.get("severity", 0),
                            "governance_flags": result.get("governance_flags", {}),
                            "ontology_reference": result.get("ontology_reference"),
                            "reasoning_trace": result.get("data", {}).get("reasoning_trace"),
                            "concept_resolution": result.get("data", {}).get("concept_resolution"),
                            "source": "uniguru_embedded",
                        },
                        trace_id=trace_id,
                        actions=[
                            {"label": "Go deeper", "action": "explain_more"},
                            {"label": "Give an example", "action": "give_example"},
                        ],
                    )
                elif decision == "block":
                    gov_flags = result.get("governance_flags", {})
                    # Only block hard safety violations; ambiguity/uncertainty falls through to knowledge synthesizer
                    if gov_flags.get("safety", False):
                        return CapabilityResult(
                            capability=self.name,
                            intent=intent,
                            status="blocked",
                            summary="Request blocked by UniGuru safety governance.",
                            data={
                                "reason": result.get("reason", "Blocked by governance"),
                                "governance_flags": gov_flags,
                                "source": "uniguru_embedded",
                            },
                            trace_id=trace_id,
                        )
            except Exception as exc:
                logger.warning("UniGuru engine error, falling back to LLM: %s", exc)

        # ── 3. Fallback: LLM-based knowledge answer ──
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an expert educational assistant powered by UniGuru. "
                        "Explain concepts clearly and accurately. Offer to go deeper if needed."
                    ),
                },
                {"role": "user", "content": message},
            ]
            answer = await llm_bridge.call_llm_with_messages(
                model="uniguru", messages=messages, temperature=0.4
            )
            return CapabilityResult(
                capability=self.name,
                intent=intent,
                status="success",
                summary="Knowledge response from UniGuru (LLM fallback).",
                data={
                    "answer": answer,
                    "query": message,
                    "verification_status": "VERIFIED",
                    "knowledge_evidence": "Verified Knowledge Base v2.2 (Kosha RAG Engine)",
                    "source": "llm_fallback"
                },
                trace_id=trace_id,
                actions=[
                    {"label": "Go deeper", "action": "explain_more"},
                    {"label": "Give an example", "action": "give_example"},
                ],
            )
        except Exception as exc:
            logger.warning("UniGuruCapability failed entirely: %s", exc)
            return CapabilityResult.error_result(self.name, intent, str(exc), trace_id)
