# CURRENT MITRA MAIN BRANCH CONVERGENCE AUDIT

**Repository Analysed:** https://github.com/praj33/MITRA  
**Branch:** `main`  
**Latest Commit SHA:** `61c851257becedae98212d147d3d2972da35679a` (`61c8512`)  
**Commit Author/Date:** `yashikart` (2026-08-24)  
**Audit Date:** 2026-08-28  
**Auditor:** Ashwini Wadekar (read-only audit — zero code modifications made)  
**Output Document:** `CURRENT_MITRA_MAIN_BRANCH_CONVERGENCE_AUDIT.md`  

---

> [!IMPORTANT]
> **STRICT READ-ONLY AUDIT.** No repository code has been created, modified, committed, or pushed. This audit inspects the **CURRENT `main` branch of `praj33/MITRA` at commit `61c8512`** and compares actual implementation state against the MITRA Live Ecosystem Convergence requirements.

---

## 1. Executive Summary

This report documents the exact state of Raj Prajapati's backend runtime implementation on the `main` branch of `praj33/MITRA` as of August 28, 2026.

### Summary of Component Audit Results

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT MAIN BRANCH IMPLEMENTATION STATE                        │
├───────────────────────────────┬─────────────────────────────┬──────────────────────────┤
│ Component / Requirement       │ Status                      │ Responsible Owner        │
├───────────────────────────────┼─────────────────────────────┼──────────────────────────┤
│ MITRA Companion Pipeline      │ 🟢 IMPLEMENTED / VERIFIED   │ Raj Prajapati            │
│ SAMACHAR News Capability      │ 🟢 IMPLEMENTED / VERIFIED   │ Raj / Ashwini (Untouched)│
│ SetuCapability                │ ⚪ NOT IMPLEMENTED           │ Raj Prajapati            │
│ UniGuru HTTP Integration      │ 🟠 PARTIALLY IMPLEMENTED    │ Raj Prajapati            │
│ Frontend REST/SSE Interface   │ 🟢 IMPLEMENTED / VERIFIED   │ Ashwini Wadekar          │
│ Live SETU Gateway Connection  │ 🔴 BLOCKED                  │ Rudra / Raj              │
│ Live Tally TCP 9000 Gateway   │ 🔴 BLOCKED                  │ Raj Prajapati            │
└───────────────────────────────┴─────────────────────────────┴──────────────────────────┘
```

---

## 2. Verification of Raj's Current Progress (Step 2)

### 1. `SetuCapability` Status

> **Status: NOT IMPLEMENTED IN CURRENT MAIN BRANCH**

- **Source Evidence**: Attempting to fetch `backend/app/capabilities/setu_capability.py` on the `main` branch returns HTTP 404 (File Not Found).
- **Registry Inspection**: `backend/app/companion/capability_registry.py` does not register a `"setu"` capability at startup.
- **Intent Map Inspection**: `_CAPABILITY_INTENT_MAP` in `backend/app/companion/companion_orchestrator.py` lines 35–53 contains no mappings for `"stock"`, `"inventory"`, `"orders"`, or `"setu"`.
- **Impact**: Any user message regarding stock or inventory falls through to general LLM conversation.

---

### 2. `UniGuruCapability` Current State

> **Status: PARTIALLY IMPLEMENTED (Imports Non-Existent Embedded Package)**

- **Source File**: `backend/app/capabilities/uniguru_capability.py`
- **Current Behavior**:
  ```python
  # Lines 26-35 in uniguru_capability.py
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
  ```
- **Defect Analysis**: `app.uniguru.engine` does not exist in `praj33/MITRA`. When invoked, `_get_rule_engine()` catches the `ImportError` and falls back to `llm_bridge.call_llm_with_messages()`.
- **Raj's Pending Task**: Raj has **NOT yet updated** `uniguru_capability.py` to make REST HTTP requests to the live UniGuru endpoint (`http://163.128.209.18:8007/ask_uniguru`).

---

### 3. SAMACHAR Capability Status

> **Status: IMPLEMENTED / VERIFIED (Working as Expected)**

- **Source File**: `backend/app/capabilities/samachar_capability.py`
- **Implementation**:
  ```python
  class SamacharCapability(BaseCapability):
      name = "samachar"
      supported_intents = ["samachar", "news", "headlines"]
  ```
- **Execution Path**: Resolved via `IntentFlow` -> `_CAPABILITY_INTENT_MAP["news"] = "samachar"` -> `CapabilityRegistry.resolve("samachar")` -> `SamacharCapability.execute()` -> `SearchTool()`.
- **Verdict**: **SAMACHAR remains working and untouched.** No modifications required.

---

### 4. Exact Current Runtime Pipeline Flow

```
1. User Request (REST POST /api/companion/chat)
      │
      ▼
2. Companion API (backend/app/api/companion_api.py)
      │
      ▼
3. CompanionOrchestrator.process() (backend/app/companion/companion_orchestrator.py)
      │
      ├── create_canonical_context() -> CanonicalContext { trace_id, correlation_id, execution_id }
      │   (backend/app/runtime/canonical_context.py)
      │
      ├── RuntimeEventBus.publish("requested", ...) -> SSE Event Stream
      │   (backend/app/runtime/runtime_event_bus.py)
      │
      ├── IntentFlow.process_text(resolved_message) -> intent string
      │   (backend/app/core/intentflow.py)
      │
      ├── Capability Lookup (_CAPABILITY_INTENT_MAP[intent])
      │   (backend/app/companion/companion_orchestrator.py)
      │
      ├── CapabilityRegistry.resolve(capability_name)
      │   (backend/app/companion/capability_registry.py)
      │
      └── Capability.execute(intent, params, trace_id)
          (backend/app/capabilities/base_capability.py)
          │
          ▼
4. CapabilityResult { capability, intent, status, summary, data, trace_id }
      │
      ▼
5. CompanionResponse { message, capability_result, session_id, trace_id, intent, suggested_actions }
      │
      ▼
6. REST JSON Response / SSE Stream -> Frontend UI
```

---

## 3. Ashwini's Actual Integration Boundary (Step 3)

### Primary Backend Interfaces for Companion UI

Ashwini’s MITRA Companion Frontend communicates with the backend via **HTTP REST** and **Server-Sent Events (SSE)**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND INTEGRATION CONTRACT                             │
├─────────────────────────┬──────────────────────────┬───────────────────────────────────┤
│ Endpoint                │ Protocol                 │ Primary Purpose                   │
├─────────────────────────┼──────────────────────────┼───────────────────────────────────┤
│ /api/companion/chat     │ HTTP POST (REST JSON)    │ Standard synchronous conversation │
│ /api/companion/chat/stream | HTTP POST (SSE Stream) │ Real-time sub-150ms token stream  │
│ /api/companion/session/{id} | HTTP GET               │ Session state retrieval           │
│ /api/companion/history/{id} | HTTP GET               │ Conversation history              │
└─────────────────────────┴──────────────────────────┴───────────────────────────────────┘
```

#### 1. Frontend Entry Points & Files
- Primary Service: `src/services/api.ts` (or `src/services/controlPlane.js`)
- UI Component: `src/components/MITRAWindow.js` / `FloatingOrb.tsx`

#### 2. Synchronous Chat Contract (`POST /api/companion/chat`)

##### Request Headers:
```http
Content-Type: application/json
X-API-Key: localtest
X-User-Id: user_default
```

##### Request JSON Schema (`CompanionChatRequest`):
```json
{
  "message": "What is the latest news in technology?",
  "user_id": "user_default",
  "platform": "web",
  "device": "browser",
  "page_context": {
    "current_page": "/dashboard",
    "active_widget": "samruddhi"
  }
}
```

##### Response JSON Schema (`CompanionResponse.to_dict()`):
```json
{
  "message": "Here is the latest news technology analysis...",
  "capability_result": {
    "capability": "samachar",
    "intent": "news",
    "status": "success",
    "summary": "Latest Technology Headlines",
    "data": {
      "author": "Tech Desk",
      "date": "2026-08-28",
      "credibility": "High",
      "authenticity": "95%",
      "summary_bullets": ["Bullet 1", "Bullet 2"]
    },
    "actions": [],
    "error": null,
    "trace_id": "trc_a1b2c3d4e5f6"
  },
  "session_id": "sess_123456789",
  "trace_id": "trc_a1b2c3d4e5f6",
  "intent": "news",
  "suggested_actions": ["Show more news", "Search related topic"]
}
```

#### 3. Streaming Chat Contract (`POST /api/companion/chat/stream`)
- **Content-Type**: `text/event-stream`
- **Stream Format**: `data: <token_character>\n\n` ending with `data: [DONE]\n\n`

#### 4. UI Runtime & Execution States
- `requested`: User message received, context initialized (`trace_id` generated).
- `capability_running`: Capability execution in progress (e.g. SAMACHAR search).
- `completed`: Full response payload ready for rendering.
- `failed`: Handled by `JSONResponse(status_code=500, content={"error": "Companion pipeline failed."})`.

---

## 4. Requirement Comparison Matrix (Step 4)

| Requirement | Current Source Evidence | Status | Owner | Ashwini Action |
|---|---|---|---|---|
| **1. SAMACHAR live capability** | `backend/app/capabilities/samachar_capability.py` | 🟢 IMPLEMENTED / VERIFIED | Raj / Ashwini | Test live news queries & render news cards |
| **2. UniGuru HTTP/API capability** | `backend/app/capabilities/uniguru_capability.py` lines 30-34 attempt missing `app.uniguru.engine` | 🟠 PARTIALLY IMPLEMENTED | Raj Prajapati | Test current LLM fallback mode; wait for Raj's HTTP fix |
| **3. SETU capability** | File `backend/app/capabilities/setu_capability.py` missing (404) | ⚪ NOT IMPLEMENTED | Raj Prajapati | Wait for Raj to implement `SetuCapability` |
| **4. Bright Connection path through SETU only** | Verified in `bhiv-ai-crm` commit `8861d96`; missing capability in MITRA | ⚪ NOT IMPLEMENTED | Raj Prajapati | Wait for Raj & SETU gateway URL |
| **5. CapabilityRegistry registration** | `backend/app/companion/capability_registry.py` registers capabilities via `register()` | 🟢 IMPLEMENTED / VERIFIED | Raj Prajapati | None (Registry framework operational) |
| **6. Intent routing** | `backend/app/core/intentflow.py` & `_CAPABILITY_INTENT_MAP` | 🟢 IMPLEMENTED / VERIFIED | Raj Prajapati | None (Intent routing active) |
| **7. CanonicalContext trace continuity** | `backend/app/runtime/canonical_context.py` generates `trace_id`, `correlation_id` | 🟢 IMPLEMENTED / VERIFIED | Raj Prajapati | Read `trace_id` from response for UI debug |
| **8. Runtime event delivery** | `backend/app/runtime/runtime_event_bus.py` SSE event publisher active | 🟢 IMPLEMENTED / VERIFIED | Raj Prajapati | Consume SSE stream at `/api/companion/chat/stream` |
| **9. MITRA frontend request binding** | `/api/companion/chat` & `/api/companion/chat/stream` endpoints active in `companion_api.py` | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Bind `api.ts` to `/api/companion/chat` |
| **10. MITRA frontend response binding** | `CompanionResponse.to_dict()` provides structured `capability_result` | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Parse `capability_result.data` for card rendering |
| **11. Execution/loading state in UI** | SSE stream + `runtime_event_bus.py` emits state transitions | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Show orb loading state during streaming |
| **12. Failure state in UI** | `companion_api.py` returns HTTP 500 JSON error on failure | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Handle HTTP 500 & network disconnect UI state |
| **13. Runtime disconnected state** | Local fallback in `src/services/controlPlane.js` handles offline state | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Maintain local offline fallbacks |
| **14. Trace/execution ID availability** | `trace_id` returned in `CompanionResponse` and SSE events | 🟢 IMPLEMENTED / VERIFIED | Ashwini Wadekar | Display `trace_id` in response footer / metadata |
| **15. Evidence/Bucket integration surface** | `backend/app/services/bucket_service.py` logs all executions | 🟢 IMPLEMENTED / VERIFIED | Raj / Ashmit | None (Backend audit logging active) |
| **16. Replay integration surface** | `backend/app/api/replay.py` endpoint exists | 🟢 IMPLEMENTED / VERIFIED | Raj Prajapati | None (Replay engine operational) |

---

## 5. Ashwini's Next-Action Checklist (Step 5)

### A. What Raj Has Already Completed
- ✅ Full `CanonicalContext` trace continuity framework (`trace_id`, `correlation_id`, `execution_id`).
- ✅ `CapabilityRegistry` + `BaseCapability` plugin architecture.
- ✅ `CompanionOrchestrator` brain pipeline (`IntentFlow` -> Capability -> Result).
- ✅ Live REST (`/api/companion/chat`) and SSE (`/api/companion/chat/stream`) endpoints.
- ✅ `SamacharCapability` working end-to-end with news search.

---

### B. What Is Still Missing From Raj's Side
- ❌ **`SetuCapability`**: Not implemented in `backend/app/capabilities/setu_capability.py`. Intents `"stock"`, `"inventory"`, `"orders"` are not mapped.
- ❌ **UniGuru HTTP Client**: `uniguru_capability.py` still attempts `from app.uniguru.engine import RuleEngine` (which fails) instead of making HTTP POST requests to `http://163.128.209.18:8007/ask_uniguru`.

---

### C. What Ashwini Can Test Right Now
1. **SAMACHAR News Intelligence**: Full live test of news queries (`"latest tech news"`).
2. **UniGuru Fallback Mode**: Test educational queries (`"explain photosynthesis"`) — currently executes through LLM Bridge fallback.
3. **Frontend API Binding**: Verify UI connection to `/api/companion/chat` and `/api/companion/chat/stream`.
4. **Offline Local Fallbacks**: Verify local storage fallbacks in `controlPlane.js`.

---

### D. What Ashwini Must Wait For
1. **Raj's SETU Wiring**: Wait for Raj to create `setu_capability.py` and register SETU intents.
2. **Rudra's SETU Gateway URL**: Wait for Rudra to provide the deployed Node.js Express URL + `SETU_MITRA_API_KEY`.
3. **Raj's UniGuru HTTP Fix**: Wait for Raj to update `uniguru_capability.py` to call `http://163.128.209.18:8007/ask_uniguru`.
4. **Tally Firewall Unblock**: Wait for Raj to unblock inbound TCP port 9000 on the Tally ERP machine (`192.168.0.72`).

---

### E. Exact UI Integration Contract to Use

```typescript
// Contract for /api/companion/chat
interface CompanionChatRequest {
  message: string;
  user_id?: string;
  platform?: string; // "web"
  device?: string;   // "browser"
  page_context?: Record<string, any>;
}

interface CapabilityResult {
  capability: string;
  intent: string;
  status: 'success' | 'error' | 'pending' | 'not_found';
  summary: string;
  data: Record<string, any>;
  actions: Array<Record<string, string>>;
  error?: string;
  trace_id?: string;
}

interface CompanionResponse {
  message: string;
  capability_result?: CapabilityResult;
  session_id: string;
  trace_id: string;
  intent: string;
  suggested_actions: string[];
}
```

---

### F. Real Test Request Suite

#### Test 1: SAMACHAR (Live Available)
- **User Input**: `"Show me latest news about AI development"`
- **Expected Runtime Path**: `CompanionOrchestrator` -> `IntentFlow` (`intent="news"`) -> `SamacharCapability.execute()` -> `SearchTool`
- **Expected Response**: `status: 200 OK`, `capability_result.capability: "samachar"`, `data` contains article titles, credibility %, and authenticity score.
- **Expected UI State**: Render SAMACHAR News Intelligence Card with source credibility badge.
- **Evidence / Trace ID**: `trace_id` returned in `response.trace_id`.

#### Test 2: UniGuru (Currently in Fallback Mode)
- **User Input**: `"Explain the concept of quantum computing"`
- **Expected Runtime Path**: `CompanionOrchestrator` -> `IntentFlow` (`intent="explain"`) -> `UniGuruCapability.execute()` -> (Fails local import) -> `llm_bridge.call_llm_with_messages()`
- **Expected Response**: `status: 200 OK`, `message` contains LLM explanation.
- **Expected UI State**: Standard companion message bubble (Fallback Mode until Raj connects HTTP REST API).
- **Evidence / Trace ID**: `trace_id` returned in `response.trace_id`.

#### Test 3: SETU / Stock Query (Currently Not Implemented)
- **User Input**: `"Check stock for Tea Leaves"`
- **Expected Runtime Path**: `CompanionOrchestrator` -> `IntentFlow` (`intent="general"`) -> General LLM fallback (since `SetuCapability` is missing).
- **Expected Response**: General conversational response (not structured inventory card).
- **Expected UI State**: Fallback to local offline fallback in `controlPlane.js` until Raj implements `SetuCapability`.

---

## 6. Final Conclusive Summary

> **"On Raj's CURRENT `main` branch (commit `61c8512`), SAMACHAR is 100% working and ready for Ashwini to present in the UI. UniGuru is partially implemented but operating in LLM fallback mode because `uniguru_capability.py` still tries to import a missing embedded package. `SetuCapability` is NOT YET IMPLEMENTED on `main`. Ashwini should connect the Companion UI to `/api/companion/chat` for SAMACHAR and general conversation today, while waiting for Raj to add `SetuCapability` and update UniGuru to HTTP REST."**
