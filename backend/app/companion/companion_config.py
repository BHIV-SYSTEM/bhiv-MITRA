"""
companion_config.py — Mitra Companion Configuration

Defines the CompanionPersonality and CompanionConfig dataclasses.
All values configurable via environment variables or database.
No hardcoded personality values.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List, Literal, Optional


PersonalityTone = Literal["friendly", "formal", "concise", "educational", "empathetic"]
MemoryMode = Literal["full", "session_only", "minimal"]
LLMProvider = Literal["groq", "openai", "gemini", "mistral", "uniguru"]


@dataclass
class CompanionPersonality:
    name: str = "Mitra"
    tone: PersonalityTone = "friendly"
    response_style: str = "clear, warm, and direct"
    greeting_template: str = "Good {time_of_day}, {user_name}. How can I help you today?"
    thinking_message: str = "Let me look into that..."
    error_message: str = "I had a little trouble with that. Want to try again?"
    capability_confirm_template: str = "Done — {action_summary}."
    capability_fail_template: str = "I couldn't complete that. {reason}"
    max_response_length: int = 600  # words

    @classmethod
    def from_env(cls) -> "CompanionPersonality":
        return cls(
            name=os.getenv("COMPANION_NAME", "Mitra"),
            tone=os.getenv("COMPANION_TONE", "friendly"),  # type: ignore[arg-type]
            response_style=os.getenv("COMPANION_RESPONSE_STYLE", "clear, warm, and direct"),
            greeting_template=os.getenv(
                "COMPANION_GREETING",
                "Good {time_of_day}, {user_name}. How can I help you today?"
            ),
        )


@dataclass
class CompanionConfig:
    personality: CompanionPersonality = field(default_factory=CompanionPersonality)
    llm_provider: LLMProvider = "uniguru"
    fallback_providers: List[LLMProvider] = field(default_factory=lambda: ["openai", "gemini"])
    memory_mode: MemoryMode = "full"
    max_history_turns: int = 20       # turns injected into LLM context
    max_context_tokens: int = 4000    # rough token budget for context window
    enabled_capabilities: List[str] = field(default_factory=lambda: [
        "email", "calendar", "whatsapp", "reminder",
        "task", "notes", "contacts", "notification",
        "browser", "document", "uniguru", "samruddhi", "samachar", "setu"
    ])
    safety_gate_enabled: bool = True  # always True in production
    session_ttl_hours: int = 24       # session expires after this many hours

    @classmethod
    def from_env(cls) -> "CompanionConfig":
        enabled = os.getenv("COMPANION_CAPABILITIES", "")
        return cls(
            personality=CompanionPersonality.from_env(),
            llm_provider=os.getenv("COMPANION_LLM_PROVIDER", "uniguru"),  # type: ignore[arg-type]
            memory_mode=os.getenv("COMPANION_MEMORY_MODE", "full"),  # type: ignore[arg-type]
            max_history_turns=int(os.getenv("COMPANION_MAX_HISTORY", "20")),
            enabled_capabilities=enabled.split(",") if enabled else [
                "email", "calendar", "whatsapp", "reminder",
                "task", "notes", "contacts", "notification",
                "browser", "document", "uniguru", "samruddhi", "samachar", "setu"
            ],
        )



# Singleton config — loaded dynamically
_companion_config: Optional[CompanionConfig] = None


def get_companion_config() -> CompanionConfig:
    global _companion_config
    if _companion_config is None:
        _companion_config = CompanionConfig.from_env()
    return _companion_config


def reload_companion_config() -> CompanionConfig:
    """Hot-reload configuration from current environment variables."""
    global _companion_config
    _companion_config = CompanionConfig.from_env()
    return _companion_config
