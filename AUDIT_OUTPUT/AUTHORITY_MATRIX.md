# MITRA AUTHORITY MATRIX

**Date:** July 4, 2026
**Version:** 3.0.0
**Classification:** Constitutional Audit Deliverable

---

## AUTHORITY OWNERSHIP MAP

### TIER 1: CONSTITUTIONAL AUTHORITY (Cannot be overridden)

| Authority | Owner | Location | Status |
|-----------|-------|----------|--------|
| Policy Decision (ALLOW/BLOCK/REWRITE) | `PolicyEngine` | `policy_engine.py:92` | OWNED |
| Enforcement Verdict (ALLOW/REWRITE/BLOCK/TERMINATE/DELAY) | `enforcement_engine.enforce()` | `enforcement_engine.py:53` | OWNED |
| Trace Identity (trace_id) | `generate_deterministic_trace_id()` | `deterministic_trace.py` | OWNED |
| Bucket Integrity (SHA-256) | `BucketService._integrity_hash()` | `bucket_service.py:39` | OWNED |
| Entry Guard Scope | `mitra_enforcement_scope()` | `mitra_entry_guard.py:15` | OWNED |

### TIER 2: OPERATIONAL AUTHORITY (Within constitutional bounds)

| Authority | Owner | Location | Bounded By |
|-----------|-------|----------|------------|
| RL Signal Interpretation | `MitraControlPlaneService._resolve_signal()` | `mitra_control_plane_service.py:375` | Cannot change policy decision |
| Conflict Guard | `MitraControlPlaneService._apply_conflict_guard()` | `mitra_control_plane_service.py:444` | RL adjusts confidence only |
| Behavior Validation | `validate_behavior()` | `behavior_validator.py` | Must return to policy engine |
| Language Detection | `MultilingualService.get_language_metadata()` | `multilingual_service.py` | Informational only |
| Response Generation | `generate_generic_response()` | `respond_service.py:178` | Post-enforcement only |

### TIER 3: EXECUTION AUTHORITY (Requires Tier 1 + Tier 2 approval)

| Authority | Owner | Location | Gate Required |
|-----------|-------|----------|---------------|
| WhatsApp Send | `WhatsAppExecutor.send_message()` | `whatsapp_executor.py:177` | Enforcement ALLOW + GatewayAuth |
| Email Send | `EmailExecutor.send_message()` | `email_executor.py:374` | Enforcement ALLOW + GatewayAuth |
| Telegram Send | `TelegramExecutor.send_message()` | `telegram_executor.py` | Enforcement ALLOW + GatewayAuth |
| Instagram Send | `InstagramExecutor.send_message()` | `instagram_executor.py` | Enforcement ALLOW + GatewayAuth |
| Calendar Create | `CalendarExecutor.create_event()` | `calendar_executor.py` | Enforcement ALLOW + GatewayAuth |
| Reminder Create | `ReminderExecutor.create_reminder()` | `reminder_executor.py` | Enforcement ALLOW + GatewayAuth |
| EMS Task Create | `EMSExecutor.create_task()` | `ems_executor.py` | Enforcement ALLOW + GatewayAuth |
| Device Command | `DeviceGatewayExecutor.send_command()` | `device_gateway_executor.py` | Enforcement ALLOW + GatewayAuth |

### TIER 4: INFRASTRUCTURE AUTHORITY

| Authority | Owner | Location | Status |
|-----------|-------|----------|--------|
| API Key Validation | `security_middleware` | `main.py:165` | OPERATIONAL |
| Rate Limiting | `rate_limit()` | `security.py:80` | OPERATIONAL |
| JWT Token Creation | `create_access_token()` | `security.py:42` | OPERATIONAL |
| JWT Token Verification | `verify_token_string()` | `security.py:57` | OPERATIONAL |
| CORS Policy | `CORSMiddleware` | `main.py:153` | OVERLY PERMISSIVE |
| User Authentication | `AuthService.authenticate()` | `auth_service.py:180` | OPERATIONAL |

---

## AUTHORITY NOT OWNED (External Dependencies)

| Authority | External Owner | Risk Level |
|-----------|---------------|------------|
| LLM Response Content | OpenAI/Groq/Gemini/Mistral | HIGH |
| WhatsApp Cloud API Delivery | Meta | MEDIUM |
| Telegram Bot Delivery | Telegram | MEDIUM |
| Email Delivery (Brevo) | Brevo | MEDIUM |
| Email Delivery (SendGrid) | SendGrid | MEDIUM |
| Email Delivery (SMTP) | Gmail/SMTP provider | MEDIUM |
| MongoDB Availability | MongoDB Atlas / self-hosted | HIGH |
| User Password Hashing | PBKDF2-SHA256 (local) | LOW |

---

## AUTHORITY ASSUMED (Not explicitly documented)

| Assumption | Evidence | Risk |
|------------|----------|------|
| RL cannot override policy | `_apply_conflict_guard()` at `mitra_control_plane_service.py:444` | LOW — implemented |
| Enforcement requires Mitra scope | `_coerce_enforcement_verdict()` at `enforcement_service.py:101` | LOW — implemented |
| Bucket is required | `enforcement_artifact_required()` at `bucket_service.py:68` | LOW — hardcoded True |
| Trace IDs are deterministic | `generate_deterministic_trace_id()` | LOW — SHA-256 based |
| No in-memory bucket fallback | `bucket_service.py:19` | FALSE — auth has fallback |

---

## AUTHORITY LEAKING

| Leak Point | Evidence | Severity |
|------------|----------|----------|
| LLM Bridge returns raw model output | `llm_bridge.py:112-114` — fallback returns mock text | MEDIUM |
| Auth in-memory fallback | `auth_service.py:93` — activates on MongoDB failure | HIGH |
| Frontend localStorage stores token | `AuthContext.tsx:49` — `localStorage.setItem('authToken', token)` | MEDIUM |
| CORS allows all origins | `main.py:155` — `allow_origins=["*"]` | HIGH |
| OPTIONS handler has hardcoded origins | `assistant.py:143-163` — includes old Render domains | LOW |

---

## AUTHORITY AMBIGUOUS

| Ambiguity | Location | Impact |
|-----------|----------|--------|
| Who owns "general" intent? | `intentflow.py` — intent classification | Response generation authority unclear |
| Who owns multilingual translation? | `multilingual_service.py` — translate_to_english | Translation errors propagate as policy input |
| Who owns the LLM model selection? | `respond_service.py:37` — `_preferred_model()` | Model fallback order not documented |
| Who owns outbound safety gate? | `outbound_safety.py` — evaluate() | Safety gate decision not part of main trace |
| Who owns inbound mediation? | `inbound_mediation_service.py` — evaluate() | Mediation decision logged but not traceable |

---

## AUTHORITY FLOW SUMMARY

```
User Request
  ↓
API Key / JWT Validation (Tier 4)
  ↓
Entry Guard (Tier 1 — Constitutional)
  ↓
Policy Engine (Tier 1 — Constitutional)
  ↓
Behavior Validator (Tier 2 — Operational)
  ↓
RL Signal (Tier 2 — Operational, bounded by Conflict Guard)
  ↓
Conflict Guard (Tier 1 — Constitutional, immutability enforced)
  ↓
Enforcement Engine (Tier 1 — Constitutional, final verdict)
  ↓
Execution Gate (Tier 3 — Execution, requires ALLOW)
  ↓
Platform Executor (Tier 3 — Execution, requires GatewayAuth)
  ↓
Bucket Logging (Tier 1 — Constitutional, immutable)
```

---

## CRITICAL AUTHORITY DISCIPLINE FINDINGS

1. **PASS:** No component can override the enforcement verdict
2. **PASS:** RL cannot change policy decisions, only adjust confidence
3. **PASS:** Entry guard prevents direct enforcement access
4. **PASS:** Bucket persistence is required (hardcoded True)
5. **FAIL:** Auth service has in-memory fallback — hidden state risk
6. **FAIL:** CORS allows all origins — authority leak
7. **FAIL:** LLM bridge fallback returns mock text — authority leak
8. **PARTIAL:** Outbound safety gate decision not in main trace
9. **PARTIAL:** Inbound mediation decision not fully traceable

**Overall Authority Discipline Score: 6/10**

**Confidence:** HIGH — based on direct source code analysis.
