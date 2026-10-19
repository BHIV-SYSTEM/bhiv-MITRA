# MITRA EVIDENCE APPENDIX

**Date:** July 4, 2026
**Version:** 3.0.0
**Classification:** Constitutional Audit Deliverable

---

## EVIDENCE SOURCES

All evidence in this audit is based on direct source code analysis of the following files:

### Backend Core

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `app/main.py` | 268 | FastAPI app, CORS, middleware, route registration |
| `app/api/assistant.py` | 236 | Single assistant endpoint, V3 contract |
| `app/api/auth.py` | 113 | Auth routes, JWT creation |
| `app/api/mitra_api.py` | 131 | Mitra evaluate endpoint |
| `app/api/webhooks.py` | 182 | Webhook handlers for 5 platforms |
| `app/core/assistant_orchestrator.py` | 843 | Central orchestrator, spine wiring |
| `app/core/llm_bridge.py` | 120 | Multi-provider LLM, cache |
| `app/core/respond_service.py` | 192 | Generic response generation |
| `app/core/security.py` | 103 | JWT, API key, rate limiting |
| `app/core/database.py` | 35 | MongoDB connection |
| `app/core/mitra_entry_guard.py` | 41 | Entry guard, ContextVar |
| `evaluator_modules.py` | 191 | 4 evaluator modules |

### Services

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `app/services/mitra_control_plane_service.py` | 634 | Core decision authority |
| `app/services/enforcement_service.py` | 162 | Enforcement gate |
| `app/services/execution_service.py` | 677 | Universal execution gateway |
| `app/services/bucket_service.py` | 191 | MongoDB audit trail |
| `app/services/auth_service.py` | 197 | Auth with in-memory fallback |

### External

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `app/external/enforcement/enforcement_engine.py` | 154 | Enforcement engine |
| `app/external/enforcement/enforcement_verdict.py` | 60 | Verdict dataclass |
| `app/governance/policy_engine.py` | 244 | Policy engine |

### Executors

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `app/executors/whatsapp_executor.py` | 227 | Twilio + Cloud API |
| `app/executors/email_executor.py` | 469 | Brevo + SendGrid + SMTP |

### Inbound

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `app/inbound/inbound_gateway.py` | 171 | Unified inbound gateway |
| `app/inbound/whatsapp_inbound_handler.py` | 177 | WhatsApp webhook handler |

### Frontend

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `frontend/frontend/src/App.tsx` | 334 | Main app, auth gating |
| `frontend/frontend/src/services/api.ts` | 337 | Backend API service |
| `frontend/frontend/src/contexts/AuthContext.tsx` | 105 | Auth context |
| `frontend/frontend/src/types.ts` | 188 | TypeScript types |

### Documentation

| File | Lines Analyzed | Key Findings |
|------|----------------|--------------|
| `REVIEW_PACKET.md` | 162 | System claims |
| `TEST_RESULTS.md` | 90 | Test results |
| `INTEGRATION_DISCLOSURE_REPORT.md` | 309 | Integration findings |
| `MERGED_DEPLOYMENT_GUIDE.md` | 170 | Deployment guide |

---

## EVIDENCE BY FINDING

### FINDING: Two Entry Points Exist

**Evidence:**
- `main.py:226`: `app.include_router(assistant_router)` — `/api/assistant`
- `main.py:228`: `app.include_router(mitra_router)` — `/api/mitra/evaluate`
- `api.ts:79`: Frontend calls `/api/assistant`

**Classification:** PROVEN

---

### FINDING: Auth Has In-Memory Fallback

**Evidence:**
- `auth_service.py:21-22`: `_INMEMORY_USERS_BY_ID`, `_INMEMORY_USERS_BY_EMAIL`
- `auth_service.py:89`: `_use_inmemory()` checks mode
- `auth_service.py:93`: `_activate_fallback()` switches to in-memory
- `auth_service.py:141-147`: `_insert_user()` writes to dict

**Classification:** PROVEN

---

### FINDING: JWT Contract Mismatch

**Evidence:**
- `INTEGRATION_DISCLOSURE_REPORT.md:117-125`: Documents JWT mismatch
- `frontend/Signup/controllers/authController.js`: Express signs with `{ id: userId }`
- `app/core/security.py:59`: FastAPI expects `sub` claim
- `frontend/Signup/config/db.js`: Uses `JWT_SECRET`
- `app/core/security.py:15`: Uses `JWT_SECRET_KEY`

**Classification:** PROVEN

---

### FINDING: CORS Allows All Origins

**Evidence:**
- `main.py:155`: `allow_origins=["*"]`
- `main.py:156`: `allow_credentials=False`
- `main.py:158`: `allow_headers=["*"]`

**Classification:** PROVEN

---

### FINDING: Entry Guard Prevents Direct Enforcement

**Evidence:**
- `mitra_entry_guard.py:15`: `mitra_enforcement_scope()` — ContextVar
- `enforcement_service.py:103-117`: Checks scope, raises `PermissionError`
- `enforcement_service.py:108-116`: Logs bypass attempt

**Classification:** PROVEN

---

### FINDING: Conflict Guard Prevents RL Override

**Evidence:**
- `mitra_control_plane_service.py:444-455`: `_apply_conflict_guard()`
- `mitra_control_plane_service.py:448`: `"decision_immutable": True`
- `mitra_control_plane_service.py:449`: `"rl_can_adjust_confidence_only": True`

**Classification:** PROVEN

---

### FINDING: Bucket Has SHA-256 Integrity

**Evidence:**
- `bucket_service.py:39-46`: `_integrity_hash()` — SHA-256
- `bucket_service.py:84`: `integrity_hash` in document
- `bucket_service.py:133-138`: `validate_artifact()` verifies hash

**Classification:** PROVEN

---

### FINDING: Trace Continuity Through All Stages

**Evidence:**
- `mitra_control_plane_service.py:517`: Request received
- `mitra_control_plane_service.py:540`: Policy runtime
- `mitra_control_plane_service.py:547`: RL interpretation
- `mitra_control_plane_service.py:550`: Conflict guard
- `enforcement_engine.py:131`: Enforcement
- `enforcement_service.py:80`: Enforcement telemetry
- `mitra_control_plane_service.py:606`: Response contract
- `mitra_control_plane_service.py:607`: Request log

**Classification:** PROVEN

---

### FINDING: LLM Cache Is Unbounded

**Evidence:**
- `llm_bridge.py:41`: `self.cache = {}` — dict, no size limit
- `llm_bridge.py:50`: `if key in self.cache: return self.cache[key]` — no eviction
- `llm_bridge.py:116`: `self.cache[key] = output` — always adds

**Classification:** PROVEN

---

### FINDING: No Distributed Tracing

**Evidence:**
- `requirements.txt`: No OpenTelemetry packages
- `app/main.py`: No tracing middleware
- `app/core/logging.py`: Standard logging only

**Classification:** PROVEN

---

### FINDING: No Replay Harness

**Evidence:**
- No replay endpoint in any router
- No replay test in `tests/`
- No replay tool in `app/`

**Classification:** PROVEN

---

### FINDING: Frontend Stores Token in localStorage

**Evidence:**
- `AuthContext.tsx:49`: `localStorage.setItem('authToken', token)`
- `api.ts:11`: `const getToken = (): string | null => localStorage.getItem('authToken')`
- `api.ts:19-23`: Token added to headers

**Classification:** PROVEN

---

### FINDING: Legacy Express Auth Service Exists

**Evidence:**
- `frontend/Signup/server.js`: Express server
- `frontend/Signup/controllers/authController.js`: Auth controller
- `frontend/Signup/models/User.js`: Mongoose user model
- `frontend/Signup/routes/authRoutes.js`: Auth routes

**Classification:** PROVEN

---

### FINDING: Inbound Mediation Not in Main Trace

**Evidence:**
- `inbound_gateway.py:76-83`: Mediation uses its own trace_id
- `inbound_gateway.py:84`: Logged to bucket with mediation trace_id
- `inbound_gateway.py:157`: Main event logged with assistant trace_id

**Classification:** PROVEN

---

### FINDING: Outbound Safety Gate Logged Separately

**Evidence:**
- `execution_service.py:139-144`: Safety gate logged to bucket
- Uses request trace_id (correct)
- But separate stage, not in main enforcement trace

**Classification:** PROVEN

---

## EVIDENCE CONFIDENCE LEVELS

| Finding | Confidence | Basis |
|---------|------------|-------|
| Two Entry Points | HIGH | Direct code analysis |
| Auth Fallback | HIGH | Direct code analysis |
| JWT Mismatch | HIGH | Documentation + code |
| CORS Permissive | HIGH | Direct code analysis |
| Entry Guard Works | HIGH | Direct code analysis |
| Conflict Guard Works | HIGH | Direct code analysis |
| SHA-256 Integrity | HIGH | Direct code analysis |
| Trace Continuity | HIGH | Direct code analysis |
| LLM Cache Unbounded | HIGH | Direct code analysis |
| No Distributed Tracing | HIGH | Direct code analysis |
| No Replay Harness | HIGH | Direct code analysis |
| localStorage Token | HIGH | Direct code analysis |
| Legacy Express Auth | HIGH | Direct code analysis |
| Inbound Mediation Gap | HIGH | Direct code analysis |
| Outbound Safety Gap | HIGH | Direct code analysis |

---

## EVIDENCE METHODOLOGY

1. **Source Code Analysis:** Direct reading of all critical files
2. **Documentation Review:** Comparison of claims vs implementation
3. **Cross-Reference:** Verification across multiple files
4. **Gap Analysis:** Identification of missing capabilities
5. **Risk Assessment:** Severity and likelihood evaluation

**Auditor:** Independent Constitutional, Architectural, Operational, Replay, Governance & Convergence Audit
**Date:** July 4, 2026
**Scope:** Full MITRA repository
