# MITRA AUDIT REPORT — PHASE 1: SYSTEM RECONSTRUCTION

**Date:** July 4, 2026
**Version:** 3.0.0
**Scope:** Full runtime reconstruction from source code analysis

---

## 1. ACTUAL ENTRY POINTS

| Entry Point | File | Status | Used By |
|-------------|------|--------|---------|
| `POST /api/assistant` | `app/api/assistant.py:197` | **ACTIVE** | Frontend React app |
| `POST /api/mitra/evaluate` | `app/api/mitra_api.py:77` | **ACTIVE** | External integrations |
| `POST /api/auth/signup` | `app/api/auth.py:81` | **ACTIVE** | Frontend auth |
| `POST /api/auth/login` | `app/api/auth.py:95` | **ACTIVE** | Frontend auth |
| `GET /api/auth/me` | `app/api/auth.py:106` | **ACTIVE** | Frontend session |
| `POST /api/tts` | `app/api/tts.py` | **ACTIVE** | Voice output |
| `POST /webhooks/whatsapp` | `app/api/webhooks.py:16` | **ACTIVE** | WhatsApp Cloud API |
| `POST /webhooks/telegram` | `app/api/webhooks.py:86` | **ACTIVE** | Telegram Bot API |
| `POST /webhooks/email` | `app/api/webhooks.py:37` | **ACTIVE** | Email inbound |
| `POST /webhooks/instagram` | `app/api/webhooks.py:115` | **ACTIVE** | Instagram Messenger |
| `POST /webhooks/telephony` | `app/api/webhooks.py:43` | **ACTIVE** | Telephony inbound |
| `GET /health` | `app/main.py:253` | **ACTIVE** | Render healthcheck |
| `GET /health/system` | `app/main.py:262` | **ACTIVE** | System status |

**Evidence:** `app/main.py:226-230` registers 5 routers: auth, assistant, mitra, webhooks, tts.

**Finding:** Two primary decision paths exist: `/api/assistant` (used by frontend) and `/api/mitra/evaluate` (used by external). Both converge to the same `MitraControlPlaneService.evaluate()`.

---

## 2. ACTUAL EXECUTION PATH

### Path A: Frontend → `/api/assistant`

```
Frontend (api.ts:79)
  → POST /api/assistant (v3.0.0 contract)
  → assistant.py:219 → model_to_dict(request)
  → assistant_orchestrator.py:401 → handle_assistant_request()
    → _normalize_request() — dict → SimpleNamespace
    → _build_authenticated_user_context() — extracts JWT if present
    → generate_trace_id() — SHA-256 canonical payload
    → MultilingualService — detect language, translate to English
    → MitraControlPlaneService.evaluate()
      → _run_policy_runtime() — policy_engine + behavior_validator
      → _resolve_signal() — RL interpretation
      → _apply_conflict_guard() — prevent RL override
      → EnforcementService.enforce_policy()
        → enforcement_engine.enforce() — evaluator modules
      → Build response contract
    → If BLOCK → return blocked response
    → If REWRITE → return safe_output
    → If ALLOW → continue orchestration
    → summary_flow → intent_flow → task_flow / generic_response
    → Platform detection → execution_service.execute_action()
    → Response translation back to user language
    → Return v3.0.0 response
```

### Path B: External → `/api/mitra/evaluate`

```
External caller
  → POST /api/mitra/evaluate (with X-API-Key)
  → mitra_api.py:81 → evaluate_mitra_event()
  → MitraControlPlaneService.evaluate() — SAME as Path A
  → Return response contract
```

**Evidence:** `app/api/assistant.py:219` calls `handle_assistant_request()` which is defined in `assistant_orchestrator.py:401`.

**Finding:** Both paths share the Mitra control plane. Path A adds orchestration (summary, intent, response generation, execution) on top. Path B is a pure decision evaluation.

---

## 3. ACTUAL AUTHORITY HOLDERS

| Authority | Owner | File:Line | Evidence |
|-----------|-------|-----------|----------|
| Policy Decision | `PolicyEngine.evaluate()` | `policy_engine.py:92` | Returns PolicyResult with ALLOW/BLOCK/REWRITE |
| Behavior Validation | `validate_behavior()` | `behavior_validator.py` | Returns decision + risk_category |
| RL Signal | `MitraControlPlaneService._resolve_signal()` | `mitra_control_plane_service.py:375` | Returns signal_type + adjusted_confidence |
| Conflict Guard | `MitraControlPlaneService._apply_conflict_guard()` | `mitra_control_plane_service.py:444` | RL can only adjust confidence, not decision |
| Enforcement Verdict | `enforcement_engine.enforce()` | `enforcement_engine.py:53` | Final ALLOW/REWRITE/BLOCK/TERMINATE |
| Execution Gate | `ExecutionService.execute_action()` | `execution_service.py:188` | Only ALLOW permits real execution |
| Bucket Persistence | `BucketService.log_event()` | `bucket_service.py:71` | Immutable audit trail |
| Entry Guard | `mitra_enforcement_scope()` | `mitra_entry_guard.py:15` | ContextVar-based scope control |

**Evidence:** `enforcement_service.py:103-117` — enforcement rejects calls outside Mitra scope with `PermissionError`.

**Finding:** Authority is well-layered. No single component holds override authority. The conflict guard at `mitra_control_plane_service.py:444` explicitly prevents RL from changing policy decisions.

---

## 4. ACTUAL OUTPUTS

| Output Type | Consumer | Format |
|-------------|----------|--------|
| Mitra Response Contract | `/api/assistant` frontend | v3.0.0 JSON |
| Mitra Evaluate Response | External callers | `{status, risk_level, reason, confidence, trace_id, ...}` |
| Bucket Logs | MongoDB `audit_logs` collection | Immutable documents with SHA-256 integrity |
| Enforcement Telemetry | MongoDB (via bucket) | Per-request enforcement decisions |
| TTS Audio | Frontend / API consumers | Base64 encoded audio |

**Evidence:** `assistant_orchestrator.py:760-805` — `success_response()` builds the v3.0.0 contract.

---

## 5. ACTUAL STORAGE SYSTEMS

| System | Purpose | Fallback | Evidence |
|--------|---------|----------|----------|
| MongoDB (primary) | Users, tasks, audit logs, bucket | In-memory for auth only | `database.py:11-16` |
| MongoDB (Motor async) | All async operations | None — fail-closed | `database.py:11` |
| In-Memory (auth only) | User store when MongoDB fails | Activated at runtime | `auth_service.py:93` |
| LLM Response Cache | SHA-256 keyed prompt→response | None | `llm_bridge.py:41` |
| Frontend localStorage | Chat history, auth token | None | `App.tsx:20-27` |

**Finding:** `auth_service.py:93` — `_activate_fallback()` switches to in-memory store when MongoDB is unavailable. This is a hidden state risk. The claim "no fallback" in REVIEW_PACKET.md is FALSE for the auth path.

---

## 6. ACTUAL OBSERVABILITY SYSTEMS

| System | Scope | Evidence |
|--------|-------|----------|
| Structured Logging | All modules via `get_logger()` | `app/core/logging.py` |
| Bucket Audit Trail | All pipeline stages | `bucket_service.py:71` |
| Enforcement Telemetry | Enforcement decisions | `enforcement_service.py:69` |
| Sentry (optional) | Error tracking | `main.py:28-34` |
| Trace IDs | Every request | `assistant_orchestrator.py:249` |

**Finding:** Observability is STRONG. Every pipeline stage logs to bucket with trace_id. However, no distributed tracing (OpenTelemetry) exists.

---

## 7. MISSING SYSTEMS

1. **Distributed Tracing:** No OpenTelemetry or equivalent
2. **Metrics Collection:** No Prometheus/Grafana integration
3. **Health Check Deep Probe:** `/health` returns static OK, doesn't check MongoDB connectivity
4. **Request Rate Metrics:** No per-user or per-endpoint metrics
5. **Replay Test Harness:** No tool to replay a trace end-to-end
6. **Authority Matrix Documentation:** No document mapping who owns what
7. **Convergence Scorecard:** No formal convergence measurement

---

## 8. RECONSTRUCTION SUMMARY

**Mitra Runtime Reconstruction:**

Mitra is a FastAPI-based AI assistant with:
- Two public decision entry points converging to one control plane
- A 5-stage pipeline: Safety → Intelligence → Enforcement → Orchestration → Execution
- MongoDB-backed bucket persistence with SHA-256 integrity
- Deterministic trace IDs propagated through all stages
- Entry guard preventing unauthorized enforcement access
- 8 platform executors (WhatsApp, Email, Telegram, Instagram, Calendar, Reminder, EMS, Device Gateway)
- Multilingual support with translation
- LLM bridge supporting 4 providers

**Critical Gap:** The `/api/assistant` path (production) adds orchestration complexity that partially breaks the clean trace continuity claimed in REVIEW_PACKET.md.

**Confidence:** HIGH — based on direct source code analysis of all critical files.
