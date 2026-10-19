import os
import re
import asyncio
import hashlib
import logging
import time
from collections import OrderedDict
from typing import Dict, List, Optional, Any

import dotenv
dotenv.load_dotenv()

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None
try:
    from groq import AsyncGroq
except ImportError:
    AsyncGroq = None
try:
    import google.generativeai as genai
except ImportError:
    genai = None
try:
    from mistralai.client import MistralClient
except ImportError:
    MistralClient = None

import httpx

logger = logging.getLogger(__name__)

# Bounded Enterprise LRU Cache to prevent memory leaks
MAX_CACHE_SIZE = 500
CACHE_TTL_SECONDS = 3600  # 1 hour


class LLMBridge:
    def __init__(self):
        openai_key = os.getenv("OPENAI_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        self.groq_model = (
            os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip()
            or "llama-3.1-8b-instant"
        )
        self.openai_client = AsyncOpenAI(api_key=openai_key) if AsyncOpenAI and openai_key else None
        self.groq_client = AsyncGroq(api_key=groq_key) if AsyncGroq and groq_key else None
        self.google_key = os.getenv("GOOGLE_API_KEY")
        mistral_key = os.getenv("MISTRAL_API_KEY")
        self.mistral_client = (
            MistralClient(api_key=mistral_key) if MistralClient and mistral_key else None
        )
        # UniGuru live endpoint
        self.uniguru_url = os.getenv("UNIGURU_URL", "https://uniguru-v2.onrender.com/new_query")
        self.uniguru_key = os.getenv("UNIGURU_API_KEY", "")

        if genai and self.google_key:
            genai.configure(api_key=self.google_key)

        # Bounded LRU Cache: key -> (timestamp, output)
        self._cache: OrderedDict[str, tuple[float, str]] = OrderedDict()
        
        # Shared persistent HTTP client pool for low-latency calls
        self._http_client: Optional[httpx.AsyncClient] = None

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=5.0),
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
                follow_redirects=True,
            )
        return self._http_client

    def _cache_get(self, key: str) -> Optional[str]:
        if key in self._cache:
            created_at, val = self._cache[key]
            if time.time() - created_at < CACHE_TTL_SECONDS:
                self._cache.move_to_end(key)
                return val
            else:
                del self._cache[key]
        return None

    def _cache_set(self, key: str, val: str) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = (time.time(), val)
        if len(self._cache) > MAX_CACHE_SIZE:
            self._cache.popitem(last=False)  # Evict oldest entry

    # ── backward-compatible single-prompt call ────────────────────
    async def call_llm(self, model: str, prompt: str) -> str:
        if not prompt or not isinstance(prompt, str):
            raise ValueError("Prompt must be a non-empty string")
        return await self.call_llm_with_messages(
            model, [{"role": "user", "content": prompt.strip()}]
        )

    def _sanitize_llm_output(self, text: str) -> str:
        """Centralized sanitizer to ensure output is clean, human-readable, and free of broken markdown symbols, hashtags, or orphan bullets."""
        if not text:
            return ""
        
        # 1. Strip debug prefixes & prompt leaks
        text = re.sub(r"^Based on live information for your query:\s*", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"INSTRUCTION TO LLM:.*", "", text, flags=re.DOTALL).strip()
        
        # 2. Clean raw web search headers if present
        if text.startswith("Live Web Search Context:") or text.startswith("Web Search Intelligence:") or text.startswith("Web Information Intelligence Summary:"):
            parts = re.split(r"\n\s*•\s+.*", text)
            synth = [p.strip() for p in parts if p.strip() and not p.strip().startswith("Live Web Search Context:") and not p.strip().startswith("Web Search Intelligence:") and not p.strip().startswith("Web Information Intelligence Summary:")]
            if synth:
                text = "\n\n".join(synth)

        # 3. Strip orphan bullet symbols sitting alone on lines (e.g. "•\n", "*\n", "- \n")
        text = re.sub(r"^\s*[•\*\-★]\s*$", "", text, flags=re.MULTILINE)

        # 4. Clean up social media hashtag clutter (e.g. "#science #tech")
        text = re.sub(r"\s+#(?:[^\s#]+)", "", text)
        text = re.sub(r"^\s*#{4,}\s*", "### ", text, flags=re.MULTILINE)

        # 5. Fix broken/double asterisks (e.g. "****" -> "")
        text = re.sub(r"\*{4,}", "**", text)
        
        # 6. Normalize linebreaks (max 2 consecutive newlines for clean paragraph flow)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()

        return text
    # ── full chat-history call (companion primary path) ───────────
    async def call_llm_with_messages(
        self,
        model: str,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 800,
        use_cache: bool = False,
    ) -> str:
        if not messages:
            raise ValueError("messages must be a non-empty list")
        cache_key = None
        if use_cache:
            cache_key = hashlib.sha256(
                f"{model}:{messages}:{temperature}".encode()
            ).hexdigest()
            cached = self._cache_get(cache_key)
            if cached:
                return cached

        output = await self._dispatch(model, messages, temperature, max_tokens)
        output = self._sanitize_llm_output(output) if hasattr(self, "_sanitize_llm_output") else output
        if output and use_cache and cache_key:
            self._cache_set(cache_key, output)
        return output

    async def stream_llm_with_messages(
        self,
        model: str,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 800,
    ):
        """
        High-Speed Server-Sent Events (SSE) token generator.
        Yields chunk strings character-by-character for sub-150ms TTFT latency.
        Conversational streams are never globally cached to preserve personal data isolation.
        """
        if not messages:
            raise ValueError("messages must be a non-empty list")

        full_response_parts = []
        try:
            if model in ("groq", "llama") and self.groq_client:
                stream = await self.groq_client.chat.completions.create(
                    model=self.groq_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                async for chunk in stream:
                    content = chunk.choices[0].delta.content or ""
                    if content:
                        full_response_parts.append(content)
                        yield content
                return
            elif model in ("chatgpt", "openai", "gpt") and self.openai_client:
                stream = await self.openai_client.chat.completions.create(
                    model=self.openai_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                async for chunk in stream:
                    content = chunk.choices[0].delta.content or ""
                    if content:
                        full_response_parts.append(content)
                        yield content
                return
        except Exception as exc:
            logger.warning("Streaming dispatch failed (%s) — falling back to fast batch", exc)

        # Fallback to fast batch dispatch if streaming provider is unavailable
        full_text = await self.call_llm_with_messages(model, messages, temperature, max_tokens)
        chunk_size = 12
        for i in range(0, len(full_text), chunk_size):
            yield full_text[i : i + chunk_size]
            await asyncio.sleep(0.008)
    async def _dispatch(self, model: str, messages: list, temperature: float, max_tokens: int) -> str:
        try:
            if model in ("groq", "llama"):
                return await asyncio.wait_for(self._call_groq(messages, temperature, max_tokens), timeout=12.0)
            if model in ("chatgpt", "openai", "gpt"):
                return await asyncio.wait_for(self._call_openai(messages, temperature, max_tokens), timeout=12.0)
            if model == "gemini":
                return await asyncio.wait_for(self._call_gemini(messages, temperature), timeout=12.0)
            if model == "mistral":
                return await asyncio.wait_for(self._call_mistral(messages, temperature), timeout=12.0)
            if model == "uniguru":
                return await asyncio.wait_for(self._call_uniguru(messages), timeout=15.0)
            raise ValueError(f"Unsupported model: {model}")
        except Exception as exc:
            logger.warning("LLM dispatch failed model=%s: %s — trying fallback chain", model, exc)
            return await self._fallback_chain(messages, temperature, max_tokens, failed=model)

    async def _fallback_chain(
        self, messages: list, temperature: float, max_tokens: int, failed: str
    ) -> str:
        # UniGuru is the canonical intelligence backend — try it FIRST.
        for provider in ("uniguru", "groq", "openai", "gemini"):
            if provider == failed:
                continue
            try:
                if provider == "uniguru":
                    return await asyncio.wait_for(self._call_uniguru(messages), timeout=12.0)
                if provider == "groq":
                    return await asyncio.wait_for(self._call_groq(messages, temperature, max_tokens), timeout=12.0)
                if provider == "openai":
                    return await asyncio.wait_for(self._call_openai(messages, temperature, max_tokens), timeout=12.0)
                if provider == "gemini":
                    return await asyncio.wait_for(self._call_gemini(messages, temperature), timeout=12.0)
            except Exception as exc:
                logger.warning("Fallback provider=%s failed: %s", provider, exc)
        # Final rule-based fallback — always gives a useful reply
        return await self._rule_based_response(messages)

    # ── providers ─────────────────────────────────────────────────
    async def _call_groq(self, messages: list, temperature: float, max_tokens: int, requested_model: str = None) -> str:
        if not self.groq_client:
            groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
            if groq_key and AsyncGroq:
                self.groq_client = AsyncGroq(api_key=groq_key)
            else:
                raise ValueError("GROQ_API_KEY not configured")
        # Try requested model first if provided, else configured model
        base_model = requested_model if (requested_model and requested_model not in ("groq", "llama")) else self.groq_model
        models_to_try = [base_model, "groq/compound", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        # Remove duplicates preserving order
        models_to_try = list(dict.fromkeys(models_to_try))
        
        last_exc = None
        for m in models_to_try:
            try:
                resp = await self.groq_client.chat.completions.create(
                    model=m,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                raw_text = resp.choices[0].message.content or ""
                return self._sanitize_llm_output(raw_text)
            except Exception as exc:
                last_exc = exc
                err_str = str(exc)
                if "401" in err_str or "invalid_api_key" in err_str.lower():
                    logger.error("GROQ_API_KEY is invalid or unauthorized — disabling Groq client fallback")
                    self.groq_client = None
                    raise exc
                if "404" in err_str or "model_not_found" in err_str.lower():
                    logger.info("Groq model '%s' not found on key tier — trying next model candidate", m)
                    continue
                logger.warning("Groq model '%s' failed (%s) — trying next candidate", m, exc)
                continue
        if last_exc:
            raise last_exc
        raise ValueError("Groq call failed on all candidate models")

    async def _call_openai(self, messages: list, temperature: float, max_tokens: int) -> str:
        if not self.openai_client:
            raise ValueError("OPENAI_API_KEY not configured")
        resp = await self.openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    async def _call_gemini(self, messages: list, temperature: float) -> str:
        if not genai:
            raise ImportError("google-generativeai not installed")
        prompt = "\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in messages
            if m["role"] != "system"
        )
        gem = genai.GenerativeModel("gemini-pro")
        result = await asyncio.to_thread(
            gem.generate_content, prompt,
            generation_config={"temperature": temperature},
        )
        return result.text or ""

    async def _call_mistral(self, messages: list, temperature: float) -> str:
        if not self.mistral_client:
            raise ImportError("mistralai not installed")
        result = await asyncio.to_thread(
            self.mistral_client.chat,
            model="mistral-medium",
            messages=messages,
            temperature=temperature,
        )
        return result.choices[0].message["content"] or ""

    async def _call_uniguru(self, messages: list) -> str:
        """Live UniGuru v2 API — POST /query or /new_query with full context preservation."""
        client = self._get_http_client()
        
        # Preserve full context (System prompt, active DOM map, and conversation turns)
        formatted_context_parts = []
        for m in messages:
            role = m.get("role", "user").upper()
            content = m.get("content", "")
            formatted_context_parts.append(f"[{role}]: {content}")
        
        full_context_query = "\n".join(formatted_context_parts)
        
        headers = {"Content-Type": "application/json"}
        if self.uniguru_key:
            headers["X-API-Key"] = self.uniguru_key
            headers["Authorization"] = f"Bearer {self.uniguru_key}"

        base_url = self.uniguru_url.rstrip('/')
        endpoints_to_try = [f"{base_url}/query", f"{base_url}/new_query", base_url]

        last_exc = None
        for ep in endpoints_to_try:
            try:
                resp = await client.post(
                    ep,
                    json={"query": full_context_query},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return (
                        data.get("answer")
                        or data.get("response")
                        or data.get("result")
                        or data.get("output")
                        or str(data)
                    )
                logger.info("UniGuru endpoint %s returned %s", ep, resp.status_code)
            except Exception as exc:
                last_exc = exc
                continue

        if last_exc:
            raise last_exc
        raise ValueError("UniGuru call failed on all candidate endpoints")

    async def _rule_based_response(self, messages: list) -> str:
        """Smart rule-based fallback — always returns something useful."""
        import re
        user_msg = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        ).lower().strip()

        # 1. How are you & variations / typos
        if re.search(r"how (are|r) (you|yoiu|yoo|u|ya|yall|y'all)|how('s| is) it going|what('s|s) up|wbu", user_msg):
            return "Hey there! I'm doing great, thank you for asking! I'm fully focused and ready to assist you. What can I help you with today?"

        # 2. Plain Greetings
        if re.search(r"\b(hi|hello|hey|good morning|good evening|good afternoon|namaste|hlo|helo)\b", user_msg):
            return "Hey there! I'm Mitra, your AI companion. I'm here and ready to help. What's on your mind?"

        # Capital city questions
        capitals = {
            "india": "New Delhi", "france": "Paris", "usa": "Washington D.C.",
            "united states": "Washington D.C.", "uk": "London", "japan": "Tokyo",
            "china": "Beijing", "russia": "Moscow", "germany": "Berlin",
            "australia": "Canberra", "canada": "Ottawa", "brazil": "Brasília",
        }
        if "capital" in user_msg:
            for country, capital in capitals.items():
                if country in user_msg:
                    return f"The capital of {country.title()} is **{capital}**."

        # Math
        math_match = re.search(r"(\d+)\s*([+\-*/])\s*(\d+)", user_msg)
        if math_match:
            try:
                a, op, b = int(math_match.group(1)), math_match.group(2), int(math_match.group(3))
                result = eval(f"{a}{op}{b}")  # safe: only digits and basic ops
                return f"That's **{result}**."
            except Exception:
                pass

        # Time/date (only trigger on direct time/date queries, not scheduling requests)
        planning_keywords = ("plan", "schedule", "meeting", "agenda", "organize", "routine", "todo", "task", "reminder", "event")
        is_planning = any(k in user_msg for k in planning_keywords)
        if not is_planning and re.search(r"\b(what time|current time|what is the time|what date|what day is it|current date)\b", user_msg):
            from datetime import datetime, timezone, timedelta
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            now = datetime.now(ist_tz)
            return f"It's currently **{now.strftime('%A, %d %B %Y')}** and the time is **{now.strftime('%I:%M %p IST')}**."

        # Help
        if re.search(r"\b(help|what can you do|capabilities|features)\b", user_msg):
            return (
                "I can help you with:\n\n"
                "• 📧 **Email** — draft, send, and read emails\n"
                "• 📅 **Calendar** — schedule and manage events\n"
                "• ✅ **Tasks** — create and track to-dos\n"
                "• 🔔 **Reminders** — set smart reminders\n"
                "• 📚 **Knowledge** — answer questions and explain concepts\n"
                "• 💬 **WhatsApp** — send messages to contacts\n\n"
                "What would you like to do?"
            )

        # Live web search fallback for factual queries (e.g. radius of earth, news, facts)
        try:
            from app.tools.search_tool import SearchTool
            search_res = await SearchTool().run(user_msg)
            if search_res:
                return self._synthesize_search_into_markdown(user_msg, search_res)
        except Exception as exc:
            logger.warning("Factual search fallback error: %s", exc)

        # Generic thoughtful reply
        return (
            "I'm listening and working on fetching the best information for you. "
            "Could you rephrase your question or ask about tasks, calendar, reminders, or market trends?"
        )

    def _synthesize_search_into_markdown(self, query: str, raw_search_text: str) -> str:
        """Converts raw web snippets into a clean, structured Markdown response with headlines and highlights."""
        if not raw_search_text:
            return f"No detailed results found for '{query}'."

        # Strip header prefixes
        clean_text = re.sub(r"^Web Information Intelligence Summary:\s*", "", raw_search_text, flags=re.IGNORECASE)

        lines = [line.strip().lstrip("•- ") for line in clean_text.split("\n") if line.strip()]

        cleaned_bullets = []
        for line in lines:
            # Strip website titles before colon if title contains site markers
            if ":" in line and any(marker in line for marker in ["SpinQ", "Science ABC", "Wikipedia", "Beginner's Guide", "Explained"]):
                parts = line.split(":", 1)
                line = parts[1] if len(parts) > 1 else line

            # Strip website meta noise (views, youtube tags, wikipedia boilerplates)
            line = re.sub(r"#(?:[^\s#]+)", "", line)
            line = re.sub(r"\[\.\.\.\]|\(?\d{4}\)?", "", line)
            line = re.sub(r"\d+\s+subscribers|\d+\s+views|WATCH NEXT:|Description\s+\d+|Posted:\s*[\d\w\s]+", "", line, flags=re.IGNORECASE)
            line = re.sub(r"Wikipedia\s+is\s+a\s+registered\s+trademark.*", "", line, flags=re.IGNORECASE)
            line = re.sub(r"##\s*Why it matters to you|##\s*Description|##\s*Quantum Computing Challenges", "", line, flags=re.IGNORECASE)
            line = re.sub(r"\s+", " ", line).strip()
            if len(line) > 30:
                cleaned_bullets.append(line)

        title = query.strip().rstrip("?.!").title()

        md = [
            f"### **{title}**",
        ]

        if cleaned_bullets:
            first_summary = cleaned_bullets[0]
            # Strip title fragment if present
            first_summary = re.sub(r"^.*?(What it is|Try to think|Quantum mechanics|Quantum theory)", r"\1", first_summary, flags=re.IGNORECASE)
            first_summary = re.sub(r"\b(qubits?|superposition|entanglement|quantum speedup|cryptography|classical computers?)\b", r"**\1**", first_summary, flags=re.IGNORECASE)

            md.append(f"**Overview**:\n{first_summary}")
            md.append("**Key Highlights**:")

            formatted_bullets = []
            for b in cleaned_bullets[1:4]:
                b_high = re.sub(r"\b(qubits?|superposition|entanglement|quantum speedup|cryptography|classical computers?)\b", r"**\1**", b, flags=re.IGNORECASE)
                formatted_bullets.append(f"• {b_high}")

            if not formatted_bullets and len(cleaned_bullets) > 0:
                formatted_bullets.append(f"• {first_summary}")

            md.append("\n".join(formatted_bullets))

        md.append("---")
        md.append("*Response formatted by Mitra Live Intelligence Engine.*")

        return "\n\n".join(md)


# Singleton
llm_bridge = LLMBridge()
