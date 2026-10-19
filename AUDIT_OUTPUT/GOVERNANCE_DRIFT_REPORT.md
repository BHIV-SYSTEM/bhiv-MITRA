# MITRA GOVERNANCE DRIFT REPORT

**Date:** July 4, 2026
**Version:** 3.0.0
**Classification:** Constitutional Audit Deliverable

---

## GOVERNANCE DRIFT TYPES EVALUATED

### 1. INTELLIGENCE → AUTHORITY DRIFT

| Finding | Evidence | Severity |
|---------|----------|----------|
| LLM fallback returns mock text | `llm_bridge.py:112-114` — `output = f"[{model.capitalize()} Mock] Response to: Context: {prompt[:50]}..."` | MEDIUM |
| Mock response passed through pipeline | `respond_service.py:186-189` — `_looks_unusable()` catches some but not all | MEDIUM |
| Intelligence output feeds policy | `assistant_orchestrator.py:488` — `mitra_control_plane_service.evaluate()` receives translated text | LOW |

**Analysis:** The LLM bridge can return mock text when no API key is configured. The `respond_service.py:155` `_looks_unusable()` function catches obvious mock patterns, but sophisticated mock responses could pass through. This creates intelligence → authority drift where mock intelligence could influence policy decisions.

**Risk Level:** MEDIUM
**Mitigation Present:** `_looks_unusable()` check, `build_fallback_response()` deterministic fallback
**Mitigation Gap:** Mock responses with non-obvious patterns could bypass detection

---

### 2. MEMORY → AUTHORITY DRIFT

| Finding | Evidence | Severity |
|---------|----------|----------|
| Auth in-memory fallback | `auth_service.py:93` — `_activate_fallback()` switches to dict store | HIGH |
| In-memory users not in MongoDB | `auth_service.py:141-147` — `_insert_user()` writes to dict | HIGH |
| No sync-back mechanism | `auth_service.py:89` — no code to sync in-memory to MongoDB | HIGH |
| LLM cache unbounded | `llm_bridge.py:41` — `self.cache = {}` | LOW |

**Analysis:** When MongoDB is unavailable, the auth service silently switches to in-memory storage. Users created during this period exist only in memory and are lost on restart. This creates memory → authority drift where authentication state is not persistent.

**Risk Level:** HIGH
**Mitigation Present:** `_can_fallback()` checks production mode
**Mitigation Gap:** In production with `ENV=production`, fallback is disabled, but in dev/staging it's active and users can be lost

---

### 3. TESTING → LEGITIMACY DRIFT

| Finding | Evidence | Severity |
|---------|----------|----------|
| Stale test files | `test_ground_level.py`, `test_hardening.py` — reference removed code | MEDIUM |
| Test claims "60 passed" | `TEST_RESULTS.md:19` | LOW |
| No end-to-end integration test | No test covers login → chat → response | HIGH |
| No replay test | No test replays a trace end-to-end | MEDIUM |
| No authority test | No test verifies authority boundaries | MEDIUM |

**Analysis:** The test suite validates individual components but lacks end-to-end integration tests. The "60 passed" claim is valid for the tests that exist, but doesn't cover the full production path. This creates testing → legitimacy drift where passing tests don't guarantee production correctness.

**Risk Level:** MEDIUM-HIGH
**Mitigation Present:** Individual component tests exist
**Mitigation Gap:** No integration test, no replay test, no authority boundary test

---

### 4. OBSERVABILITY → GOVERNANCE DRIFT

| Finding | Evidence | Severity |
|---------|----------|----------|
| No distributed tracing | No OpenTelemetry integration | MEDIUM |
| No per-user metrics | Only bucket audit trail | LOW |
| No alerting on blocks | No notification when enforcement blocks | MEDIUM |
| Health check is static | `/health` returns OK without checking MongoDB | LOW |
| No replay capability | No tool to reconstruct decision from trace_id | HIGH |

**Analysis:** The bucket audit trail is strong, but the lack of distributed tracing, alerting, and replay capability creates observability → governance drift. A governance auditor cannot easily reconstruct a decision or detect anomalies.

**Risk Level:** MEDIUM-HIGH
**Mitigation Present:** Bucket audit trail with SHA-256 integrity
**Mitigation Gap:** No distributed tracing, no alerting, no replay harness

---

### 5. EXECUTION → GOVERNANCE DRIFT

| Finding | Evidence | Severity |
|---------|----------|----------|
| Outbound safety gate not in main trace | `outbound_safety.py` — logged to bucket separately | MEDIUM |
| Inbound mediation not in main trace | `inbound_mediation_service.py` — logged to bucket separately | MEDIUM |
| GatewayAuth not traceable | `gateway_auth.py` — issued but not validated post-execution | LOW |
| Execution simulation mode | `email_executor.py:391` — `EXECUTION_SIMULATION` env var | LOW |

**Analysis:** The outbound safety gate and inbound mediation decisions are logged to bucket but not part of the main enforcement trace. This creates execution → governance drift where governance decisions are fragmented across multiple bucket entries.

**Risk Level:** MEDIUM
**Mitigation Present:** All decisions logged to bucket
**Mitigation Gap:** No unified trace view of all governance decisions

---

### 6. HIDDEN STATE ACCUMULATION

| State | Location | Bounded | Observable | Replayable |
|-------|----------|---------|------------|------------|
| LLM Response Cache | `llm_bridge.py:41` | NO | NO | NO |
| Auth In-Memory Store | `auth_service.py:21-22` | NO | PARTIAL | NO |
| Rate Limit Store | `security.py:25` | YES (time-based) | NO | NO |
| Frontend localStorage | `App.tsx:20-27` | NO | YES (browser) | NO |
| ContextVar Entry Guard | `mitra_entry_guard.py:8` | YES (request-scoped) | YES | NO |
| MongoDB Connection Pool | `database.py:11` | YES (Motor managed) | YES | NO |

**Analysis:** Three hidden state accumulators exist:
1. **LLM Cache:** Unbounded, no eviction, no observation
2. **Auth In-Memory:** Unbounded, activated on failure, no observation
3. **Rate Limit Store:** Time-bounded but not observable

**Risk Level:** MEDIUM
**Mitigation Present:** Rate limit has time-based eviction
**Mitigation Gap:** LLM cache and auth in-memory have no bounds

---

## GOVERNANCE DRIFT SCORECARD

| Drift Type | Score | Status |
|------------|-------|--------|
| Intelligence → Authority | 7/10 | PARTIAL (LLM fallback) |
| Memory → Authority | 5/10 | PRESENT (auth fallback) |
| Testing → Legitimacy | 6/10 | PARTIAL (no integration tests) |
| Observability → Governance | 5/10 | PARTIAL (no distributed tracing) |
| Execution → Governance | 7/10 | PARTIAL (fragmented traces) |
| Hidden State | 6/10 | PARTIAL (unbounded caches) |

**Overall Governance Drift Score: 36/60 (60%)**

**Confidence:** HIGH — based on direct source code analysis.

---

## RECOMMENDATIONS

1. **HIGH:** Remove or disable auth in-memory fallback in production
2. **HIGH:** Add end-to-end integration test (login → chat → response)
3. **HIGH:** Add replay test harness
4. **MEDIUM:** Bound LLM cache with eviction policy
5. **MEDIUM:** Add distributed tracing (OpenTelemetry)
6. **MEDIUM:** Add alerting on enforcement blocks
7. **MEDIUM:** Unify outbound safety and inbound mediation into main trace
8. **LOW:** Add per-user metrics
9. **LOW:** Make health check verify MongoDB connectivity
