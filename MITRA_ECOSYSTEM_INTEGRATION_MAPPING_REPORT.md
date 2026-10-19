# CONSOLIDATED MITRA ECOSYSTEM INTEGRATION & REPOSITORY MAPPING REPORT

**Target Framework:** MITRA Architectural Integration Surface  
**Date:** 2026-08-26  
**Auditor:** Ashwini Wadekar (read-only audit — zero code modifications made)  
**Output Document:** `MITRA_ECOSYSTEM_INTEGRATION_MAPPING_REPORT.md`  

---

> [!IMPORTANT]
> **READ-ONLY AUDIT & ARCHITECTURAL MAPPING ONLY.** No repository code has been modified, implemented, committed, or pushed. Every finding, entry point, contract, and boundary in this report is strictly derived from source code analysis of `praj33/MITRA`, `BHIV-Engineering-Exchange/bhiv-ai-crm` (commit `8861d96`), `VJY123VJY/uniguru_ai`, and live API specifications from `http://163.128.209.18:8007/docs`.

---

## 1. Executive Summary

This report establishes the single authoritative architectural blueprint for attaching external ecosystem capabilities (SETU, Bright Connection, UniGuru, and SAMACHAR) to **MITRA’s Canonical Companion Runtime** (`praj33/MITRA`).

### System Readiness & Classification Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MITRA ECOSYSTEM STATUS                                  │
├───────────────────────────────┬─────────────────────────────────────────────────────────┤
│ System                        │ Current Technical Status                                │
├───────────────────────────────┼─────────────────────────────────────────────────────────┤
│ MITRA Canonical Runtime       │ 🟢 VERIFIED / AVAILABLE                                 │
│ SAMACHAR (News Capability)    │ 🟢 VERIFIED / AVAILABLE                                 │
│ SETU (Node.js MITRA Gateway)  │ 🟡 CONDITIONALLY AVAILABLE                              │
│ Bright Connection (via SETU)  │ 🟡 CONDITIONALLY AVAILABLE (Tally TCP 9000 Blocked)     │
│ UniGuru (Kosha RAG Engine)    │ 🟠 STRUCTURE EXISTS BUT REQUIRES FIX                     │
│ ARTHA                         │ ⚪ SOURCE NOT AVAILABLE — ANALYSIS PENDING               │
│ Gurukul                       │ ⚪ SOURCE NOT AVAILABLE — ANALYSIS PENDING               │
└───────────────────────────────┴─────────────────────────────────────────────────────────┘
```

### Key Architectural Truths Verified from Source
1. **MITRA is a Governed Companion Platform**: Every inbound user request follows an immutable pipeline: `Safety → Intelligence → Enforcement → Orchestration → Capability → Execution → Bucket Audit`. No capability or external API can bypass this sequence.
2. **Pluggable Capability Model**: All capabilities in MITRA extend `BaseCapability` (`backend/app/capabilities/base_capability.py`) and are registered in `CapabilityRegistry` (`backend/app/companion/capability_registry.py`).
3. **Bright Connection is NOT a Separate Top-Level MITRA Capability**: Source code in `bhiv-ai-crm` (commit `8861d96`) proves that Bright Connection is an external Tally ERP tenant dataset (`tenant_bright_connection`, `bc_bright_connection_001`). Its data is ingested into SETU via `BrightConnectionConnector` (`bright_connection_connector.py`) and exposed to MITRA via SETU’s Node.js dispatch gateway (`POST /api/mitra/execute`).
4. **UniGuru Requires an HTTP Adapter Fix**: MITRA contains `backend/app/capabilities/uniguru_capability.py`, but it currently attempts to import a non-existent embedded python package `app.uniguru.engine`. It must be updated by Raj to dispatch REST HTTP requests to UniGuru’s deployed live API (`http://163.128.209.18:8007/ask_uniguru`).

---

## 2. MITRA Canonical Runtime Flow

Verified directly from `praj33/MITRA` source files (`backend/MITRA_SYSTEM_ARCHITECTURE.md`, `companion_orchestrator.py`, `capability_registry.py`, `base_capability.py`, `canonical_context.py`, `runtime_event_bus.py`):

```
                                USER REQUEST
                                     │
                                     ▼
                       Inbound Gateway (inbound_gateway.py)
                                     │
                                     ▼
                     Assistant Orchestrator (assistant_orchestrator.py)
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
    Safety Layer             Intelligence Layer          Enforcement Runtime
     (Akanksha)                  (Sankalp)                      (Raj)
  safety_service.py      intelligence_service.py       enforcement_service.py
  Safety Decision          Intent & Risk Flags           ALLOW/BLOCK/REWRITE
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │ (Verdicts & Mediation logged to Bucket)
                                     ▼
                     CompanionOrchestrator (companion_orchestrator.py)
                                     │
                                     ├── [1] Enforce CanonicalContext
                                     │       (trace_id, correlation_id, execution_id)
                                     │       canonical_context.py
                                     │
                                     ├── [2] Publish SSE Lifecycle Event ("requested")
                                     │       runtime_event_bus.py
                                     │
                                     ├── [3] NLU Intent Resolution
                                     │       IntentFlow.process_text() -> intent string
                                     │       intentflow.py
                                     │
                                     ├── [4] Capability Resolution
                                     │       _CAPABILITY_INTENT_MAP[intent] -> capability_name
                                     │       CapabilityRegistry.resolve(capability_name)
                                     │       capability_registry.py
                                     │
                                     └── [5] Capability Execution
                                             Capability.execute(intent, params, trace_id)
                                             base_capability.py
                                             │
                                             ▼
                                   EXTERNAL SYSTEM / ADAPTER
                         (SETU / UniGuru / SAMACHAR / Local Executors)
                                             │
                                             ▼
                                     CapabilityResult
                   { capability, intent, status, summary, data, trace_id }
                                             │
                                             ▼
                     ExecutionService / Bucket Logging (MongoDB)
                                     │
                                     ▼
                   CompanionResponse -> Frontend + SSE Stream
```

### Component Reference Table

| Component | Source File | Responsibilities |
|---|---|---|
| **Inbound Gateway** | `backend/app/inbound/inbound_gateway.py` | Normalizes multi-channel requests (web, WhatsApp, Telegram, Email) |
| **Safety Layer** | `backend/app/services/safety_service.py` | Content safety & ethical boundary evaluation (Akanksha) |
| **Intelligence Layer** | `backend/app/services/intelligence_service.py` | Context analysis & risk flag scoring (Sankalp) |
| **Enforcement Runtime** | `backend/app/services/enforcement_service.py` | Enforces ALLOW / BLOCK / REWRITE verdicts (Raj) |
| **Companion Orchestrator** | `backend/app/companion/companion_orchestrator.py` | Main brain — generates context, routes intents to capabilities |
| **Canonical Context** | `backend/app/runtime/canonical_context.py` | Generates immutable `trace_id`, `correlation_id`, `execution_id` |
| **Runtime Event Bus** | `backend/app/runtime/runtime_event_bus.py` | Real-time SSE event publishing (`requested`, `running`, `completed`) |
| **IntentFlow** | `backend/app/core/intentflow.py` | Keyword pattern matching & entity extraction NLU |
| **Capability Registry** | `backend/app/companion/capability_registry.py` | Pluggable map of registered `BaseCapability` instances |
| **Base Capability** | `backend/app/capabilities/base_capability.py` | Abstract class enforcing uniform `execute()` contract |
| **Capability Result** | `backend/app/capabilities/base_capability.py` | Standardized result dataclass returned by all capabilities |
| **Execution Service** | `backend/app/services/execution_service.py` | Universal execution gateway for platform actions (Chandresh) |
| **Bucket Service** | `backend/app/services/bucket_service.py` | Immutable audit logging in MongoDB (Ashmit) |

---

## 3. Product-by-Product Integration Mapping

---

### Product A: SETU (Routing Gateway & Dispatch Runtime)

#### 1. Product Identity
SETU is an operational routing gateway, trace continuity engine, and telemetry/lineage emission layer across the TANTRA ecosystem. It features two complementary backends:
- **Python FastAPI (`backend/setu/`)**: Handles contract routing (`/setu/route`), trace continuity, Niyantran state consumption, and lineage emission.
- **Node.js Express + MongoDB (`backend-nodejs/`)**: Manages AI CRM services, MongoDB storage, and the dedicated **MITRA Product Dispatch Gateway** (`POST /api/mitra/execute`).

#### 2. Source Evidence
- **Repository**: `https://github.com/BHIV-Engineering-Exchange/bhiv-ai-crm`
- **Reference Commit**: `8861d963cd30af4ebb16882968b5556de713120a` (`8861d96`)
- **Key Source Files**: `backend-nodejs/src/routes/mitra.js`, `backend-nodejs/src/services/mitraProductService.js`, `backend/setu/signal_ingestion.py`, `CURRENT_RUNTIME_MAPPING.md`, `HANDOVER.md`.

#### 3. Existing MITRA Integration Surface
- **Attachment Point**: `CapabilityRegistry` in `backend/app/companion/capability_registry.py` (in `praj33/MITRA`).
- **Required New File**: `backend/app/capabilities/setu_capability.py` (to be created by Raj) defining `SetuCapability(BaseCapability)`.
- **Orchestrator Mapping**: `_CAPABILITY_INTENT_MAP` in `companion_orchestrator.py` mapping `"stock"`, `"inventory"`, `"orders"`, `"setu"` to `"setu"`.

#### 4. Request Flow
```
User: "Check stock for Tea Leaves"
  │
  ▼
MITRA CompanionOrchestrator.process()
  │  IntentFlow -> "stock" -> _CAPABILITY_INTENT_MAP["stock"] -> "setu"
  │
  ▼
CapabilityRegistry.resolve("setu") -> SetuCapability.execute()
  │
  ▼
POST http://<setu-host>:8000/api/mitra/execute
  Headers: X-SETU-API-Key: <SETU_MITRA_API_KEY>
  Payload: {
    "dispatch_id": "disp_987654321",
    "correlation_id": "<CanonicalContext.trace_id>",
    "product_id": "prod_mitra_crm",
    "capability_id": "cap_inventory_read",
    "intent_id": "setu.inventory.lookup",
    "payload": { "query": "Tea Leaves", "low_stock_only": true }
  }
  │
  ▼
SETU Node.js Gateway (mitra.js -> mitraProductService.js)
  Queries MongoDB `products` collection
  │
  ▼
Response (200 OK):
  {
    "status": "completed",
    "success": true,
    "trace_id": "<correlation_id>",
    "intent_id": "setu.inventory.lookup",
    "data": { "count": 1, "products": [...] }
  }
  │
  ▼
SetuCapability wraps into CapabilityResult(status="success", data={...})
  │
  ▼
MITRA renders Inventory Card on Frontend
```

#### 5. Ownership Boundary

##### MITRA Owns:
- Intent classification and user input normalization.
- Forwarding `CanonicalContext.trace_id` as `correlation_id`.
- Rendering structured inventory/order/operations cards in companion UI.
- Managing local session state and SSE event streaming.

##### MITRA Must NOT Own:
- Direct database calls or writes to SETU’s MongoDB (`setu_signal_ingestion`, `orders`, `products`).
- Direct invocation of `/setu/route` (Python FastAPI) without canonical runtime mediation.
- Generating SETU lineage SHA-256 hashes or governance attestation tokens (`gated_bridge`).
- Secret management of `SETU_MITRA_API_KEY` in frontend code or Git.

#### 6. Trace & Evidence Flow
1. `CanonicalContext` generates `trace_id` (`trc_12hex`).
2. `SetuCapability` sends `correlation_id: trace_id` in request body to `/api/mitra/execute`.
3. SETU Node.js server stamps response headers: `X-SETU-Execution-Id`, `X-SETU-Trace-Id`, `X-SETU-Tenant-Id`.
4. `SetuCapability` attaches `trace_id` to `CapabilityResult`.
5. `BucketService` logs the complete trace to MongoDB audit.

#### 7. Current Technical Status
🟡 **CONDITIONALLY AVAILABLE**  
*Rationale:* Node.js MITRA gateway code (`mitra.js` & `mitraProductService.js`) is 100% complete and unit-tested in `bhiv-ai-crm`. Blocked only on: (1) Deployed server URL from Rudra, (2) `SETU_MITRA_API_KEY` value issued to MITRA backend.

---

### Product B: Bright Connection (Tally ERP Connector Module)

#### 1. Product Identity
Bright Connection is **NOT an independent MITRA capability codebase**. It is an external enterprise company/Tally ERP installation (`tenant_bright_connection`, `bc_bright_connection_001`). Its Tally XML export envelopes are ingested into SETU via `BrightConnectionConnector` (`bright_connection_connector.py`) located inside the `bhiv-ai-crm` repository.

#### 2. Source Evidence
- **Repository**: `https://github.com/BHIV-Engineering-Exchange/bhiv-ai-crm`
- **Reference Commit**: `8861d963cd30af4ebb16882968b5556de713120a` (`8861d96`)
- **Key Source Files**: `backend/setu/bright_connection_connector.py`, `BRIGHT_CONNECTION_INTEGRATION_SURFACE.md`, `SOURCE_TO_INSIGHT_FLOW.md`, `CURRENT_RUNTIME_MAPPING.md`.

#### 3. Existing MITRA Integration Surface
MITRA accesses Bright Connection data **exclusively through SETU**:
- Via `SetuCapability` querying SETU’s Node.js Gateway (`POST /api/mitra/execute`) for `setu.inventory.lookup` or `setu.order.lookup`.
- Via ARTHA formatted `mitraReadable` text snippets derived from normalized Bright Connection MDUs.

#### 4. Request Flow
```
User: "Show active orders for Bright Connection"
  │
  ▼
MITRA Intent -> CapabilityRegistry -> SetuCapability
  │
  ▼
POST /api/mitra/execute (Intent: setu.order.lookup, Tenant: tenant_bright_connection)
  │
  ▼
SETU Gateway -> Queries MongoDB orders collection (synced via BrightConnectionConnector)
  │
  ▼
CapabilityResult -> MITRA Order Card Display
```

#### 5. Ownership Boundary

##### MITRA Owns:
- Displaying Bright Connection order, product, and field visit summaries to the user.

##### MITRA Must Not Own:
- Raw Tally XML parsing or direct TCP socket access (`192.168.0.72:9000`).
- Extraction of Tally store/godown context (`TALLY_STORE_ID`).
- Calculating ARTHA dealer outstanding balances or billing metrics.
- Generating `source_context` provenance envelopes.

#### 6. Trace & Evidence Flow
Commit `8861d96` introduced mandatory `source_context` provenance to all Bright Connection records:
```json
{
  "source_context": {
    "source_system": "tally",
    "connected_company_id": "bc_bright_connection_001",
    "connected_company_name": "Bright Connection",
    "store_id": "store_mumbai_01",
    "source_entity": "order_record",
    "source_record_id": "ORD-BC-0821",
    "source_timestamp": "2026-08-21T08:00:00Z",
    "received_at": "2026-08-21T08:30:00Z",
    "sync_id": "sync_demo_001"
  }
}
```
This envelope is persisted in MongoDB and returned to MITRA for verifiable provenance display.

#### 7. Current Technical Status
🟡 **CONDITIONALLY AVAILABLE** (Tally TCP 9000 Firewall-Blocked)  
*Rationale:* `BrightConnectionConnector` code is 100% complete with full provenance in commit `8861d96` (unit tests 8/8 pass in `test_provenance_local.py`). However, live sync from Tally ERP (`192.168.0.72:9000`) is currently blocked by Windows Firewall per `CURRENT_RUNTIME_MAPPING.md` limitation #1.

---

### Product C: UniGuru (Sovereign Educational RAG Engine)

#### 1. Product Identity
UniGuru is a sovereign AI educational reasoning engine and knowledge retrieval platform. It combines vector (FAISS) and SQLite RAG over indexed Balbharati K-12 Maharashtra state board textbooks (Classes 1–5), Gurukul knowledge, Nyaya logic, and Jain scriptures with multi-agent "Guru" tutor persona management.

#### 2. Source Evidence
- **Repository**: `https://github.com/VJY123VJY/uniguru_ai`
- **Live OpenAPI Documentation**: `http://163.128.209.18:8007/docs` (OpenAPI v1.1.0)
- **MITRA Reference Files**: `backend/app/capabilities/uniguru_capability.py`, `backend/app/ecosystem/adapters/uniguru_adapter.py`, `backend/app/core/llm_bridge.py`.

#### 3. Existing MITRA Integration Surface
- **Capability File**: `backend/app/capabilities/uniguru_capability.py` (`UniGuruCapability` extending `BaseCapability`).
- **Supported Intents**: `["uniguru", "knowledge", "explain", "learn", "study", "educational"]`.
- **Current Defect in Code**: `uniguru_capability.py` lines 30–34 attempt `from app.uniguru.engine import RuleEngine`. Because `app.uniguru.engine` does not exist as an embedded package inside `praj33/MITRA`, it fails silently and falls back to LLM Bridge.

#### 4. Request Flow (Corrected Architecture)
```
User: "Explain Newton's third law of motion"
  │
  ▼
MITRA CompanionOrchestrator.process()
  │  IntentFlow -> "explain" -> _CAPABILITY_INTENT_MAP["explain"] -> "uniguru"
  │
  ▼
CapabilityRegistry.resolve("uniguru") -> UniGuruCapability.execute()
  │
  ▼
POST http://163.128.209.18:8007/ask_uniguru
  Headers: Authorization: Bearer <UNIGURU_API_KEY>
  Payload: { "query": "Newton's third law of motion", "domain": "physics" }
  │
  ▼
UniGuru Live Service (163.128.209.18:8007)
  Queries Kosha FAISS index + Balbharati textbook DB
  │
  ▼
Response (200 OK):
  {
    "verification_status": "VERIFIED",
    "answer": "For every action, there is an equal and opposite reaction...",
    "confidence": 1.0,
    "trace_id": "trc_9a8b7c6d5e4f",
    "evidence": {
      "textbook_id": "balbharti_class_5_science",
      "page_numbers": [42, 43],
      "source_hash": "a1b2c3d4...",
      "lineage_hash": "e5f6a1b2..."
    }
  }
  │
  ▼
UniGuruCapability wraps into CapabilityResult(status="success", data={...})
  │
  ▼
MITRA renders Verified Educational Attribution Card on Frontend
```

#### 5. Ownership Boundary

##### MITRA Owns:
- Classifying educational intents (`"explain"`, `"learn"`, `"study"`, `"knowledge"`).
- Formatting user queries and domain hints.
- Rendering verified textbook citation cards (Textbook ID, Page Numbers, Verified Badge).
- Executing LLM fallback (Groq / OpenAI) if UniGuru HTTP service times out (>5s).

##### MITRA Must NOT Own:
- FAISS vector index creation or storage.
- SQLite textbook chunk database management.
- Nyaya logic rule engine execution.
- Managing UniGuru's internal chatbot/guru personas (`/guru/*`).

#### 6. Trace & Evidence Flow
1. MITRA passes `CanonicalContext.trace_id` in request header or payload.
2. UniGuru `/ask_uniguru` returns deterministic evidence metadata: `textbook_id`, `page_numbers`, `source_hash`, `lineage_hash`, and `verification_status: "VERIFIED"`.
3. `UniGuruCapability` embeds evidence into `CapabilityResult.data`.
4. `BucketService` records evidence provenance in MITRA’s MongoDB audit trail.

#### 7. Current Technical Status
🟠 **STRUCTURE EXISTS BUT REQUIRES FIX**  
*Rationale:* Live service is active and verified at `http://163.128.209.18:8007` (`POST /ask_uniguru`, `/new_rag`). MITRA has `uniguru_capability.py` in place, but code lines 30–34 attempt a non-existent local import `app.uniguru.engine`. Raj must update `uniguru_capability.py` to make HTTP REST requests to the deployed URL.

---

### Product D: SAMACHAR (News Intelligence & Retrieval)

#### 1. Product Identity
SAMACHAR is MITRA’s news intelligence and media retrieval capability, providing real-time news analysis, credibility scoring, authenticity rating, and headline summaries.

#### 2. Source Evidence
- **Repository**: `https://github.com/praj33/MITRA`
- **Key Source File**: `backend/app/capabilities/samachar_capability.py`
- **Intent Mapping**: `_CAPABILITY_INTENT_MAP` entries `"samachar"`, `"news"`, `"headlines"` -> `"samachar"`.

#### 3. Existing MITRA Integration Surface
- **Capability File**: `backend/app/capabilities/samachar_capability.py` (`SamacharCapability` extending `BaseCapability`).
- **Tool Dependency**: `app.tools.search_tool.SearchTool`.
- **Frontend Handler**: `src/services/controlPlane.js` (renders canonical News Intelligence cards with Credibility % and Authenticity score).

#### 4. Request Flow
```
User: "What is the latest news in technology?"
  │
  ▼
CompanionOrchestrator -> IntentFlow ("news") -> _CAPABILITY_INTENT_MAP["news"] -> "samachar"
  │
  ▼
CapabilityRegistry.resolve("samachar") -> SamacharCapability.execute()
  │
  ▼
SearchTool.search("technology news") -> Formats News Intelligence Payload
  │
  ▼
CapabilityResult(
  capability="samachar",
  intent="news",
  status="success",
  summary="News Article Analysis",
  data={ author, date, credibility: "High", authenticity: "95%", summary_bullets }
)
  │
  ▼
MITRA Frontend renders News Intelligence Card
```

#### 5. Ownership Boundary

##### MITRA Owns:
- End-to-end news intent resolution, search orchestration, and rendering structured News Analysis UI cards.

##### MITRA Must NOT Own:
- Custom news web crawling infrastructure (uses standard search tools / news APIs).

#### 6. Trace & Evidence Flow
`SamacharCapability` attaches `CanonicalContext.trace_id` to `CapabilityResult`, logged directly via `BucketService`.

#### 7. Current Technical Status
🟢 **VERIFIED / AVAILABLE**  
*Rationale:* Fully implemented, verified in runtime, active in `praj33/MITRA` backend, and rendered in frontend control plane. Per user directive: *"Samacharko tho haath bhi maat lagna"* (Do not touch — working as expected).

---

## 4. Consolidated Integration Matrix

| System | Repository | MITRA Attachment Point | Existing Integration | Required Interface | Owner / Dependency | Current Status | Next Action |
|---|---|---|---|---|---|---|---|
| **SETU** | `BHIV-Engineering-Exchange/bhiv-ai-crm` (commit `8861d96`) | `backend/app/companion/capability_registry.py` (via `SetuCapability`) | Node.js Gateway `POST /api/mitra/execute` | `POST /api/mitra/execute` with `X-SETU-API-Key` | **Rudra Parmeshwar** (SETU Gateway), **Raj Prajapati** (MITRA Runtime) | 🟡 **CONDITIONALLY AVAILABLE** | Rudra to supply deployed URL + API key; Raj to create `setu_capability.py`. |
| **Bright Connection** | `BHIV-Engineering-Exchange/bhiv-ai-crm` (commit `8861d96`) | Accesses via SETU Gateway (`setu.inventory.lookup`, `setu.order.lookup`) | `BrightConnectionConnector` in `backend/setu/` | Routed through SETU Gateway (`POST /api/mitra/execute`) | **Aman Pal** (Bright Connection Connector), **Raj Prajapati** (TANTRA/Firewall) | 🟡 **CONDITIONALLY AVAILABLE** (Tally TCP 9000 Blocked) | Raj to unblock inbound TCP 9000 on Tally machine firewall (`192.168.0.72`). |
| **UniGuru** | `VJY123VJY/uniguru_ai` (API: `http://163.128.209.18:8007`) | `backend/app/capabilities/uniguru_capability.py` | `UniGuruCapability` (attempts broken embedded import) | `POST http://163.128.209.18:8007/ask_uniguru` with Bearer key | **Vijay** (UniGuru Lead), **Raj Prajapati** (MITRA Runtime) | 🟠 **STRUCTURE EXISTS BUT REQUIRES FIX** | Vijay to supply production HTTPS URL + Bearer key; Raj to update `uniguru_capability.py` to HTTP client. |
| **SAMACHAR** | `praj33/MITRA` | `backend/app/capabilities/samachar_capability.py` | Fully integrated (`SamacharCapability`) | `SearchTool()` search engine integration | **Ashwini Wadekar** (MITRA UI/Integration) | 🟢 **VERIFIED / AVAILABLE** | None required — maintain current working pipeline per user instruction. |
| **ARTHA** | ⚪ SOURCE NOT AVAILABLE — ANALYSIS PENDING | Pending source analysis | Pending source analysis | Pending source analysis | **ARTHA Lead** | ⚪ **SOURCE NOT AVAILABLE — ANALYSIS PENDING** | Perform read-only audit once repository access is provided. |
| **Gurukul** | ⚪ SOURCE NOT AVAILABLE — ANALYSIS PENDING | Pending source analysis | Pending source analysis | Pending source analysis | **Gurukul Lead** | ⚪ **SOURCE NOT AVAILABLE — ANALYSIS PENDING** | Perform read-only audit once repository access is provided. |

---

## 5. Critical Architecture Decision

### Question: Is Bright Connection a separate top-level MITRA capability?

**NO. Source code evidence in `BHIV-Engineering-Exchange/bhiv-ai-crm` (commit `8861d96`) proves that Bright Connection is NOT a standalone MITRA capability.**

### Correct Architectural Topology

```
                                  MITRA COMPANION
                                         │
                                         ▼
                      CapabilityRegistry.resolve("setu")
                                         │
                                         ▼
                     SetuCapability (backend/app/capabilities/setu_capability.py)
                                         │
                                         ▼
              POST /api/mitra/execute (SETU Node.js Integration Gateway)
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
     SETU MongoDB Collections                     BrightConnectionConnector
  (products, orders, inventory)              (backend/setu/bright_connection_connector.py)
                                                                 │
                                                                 ▼
                                                    Tally ERP Export XML Gateway
                                                        (192.168.0.72:9000)
```

### Architectural Rationale
1. **Bright Connection is a Tenant Dataset**: In `bright_connection_connector.py`, `TENANT_ID = "tenant_bright_connection"` and `CONNECTED_COMPANY_ID = "bc_bright_connection_001"`. It represents a single connected business in SETU, not a universal capability.
2. **SETU Owns the Dispatch Interface**: Rudra built `POST /api/mitra/execute` specifically to handle product, stock, and order lookups across all SETU-connected businesses (including Bright Connection).
3. **Point-to-Point Anti-Pattern Avoided**: Direct MITRA → Bright Connection calls would bypass SETU’s trace continuity, tenant isolation, and `source_context` provenance tracking.

---

## 6. What Should Happen Next

To maintain strict architectural governance, follow this mandatory 6-step sequence:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              MANDATORY IMPLEMENTATION SEQUENCE                         │
├──────────┬─────────────────────────────────────────────────────────────────────────────┤
│ Step 1   │ Complete repository/integration mapping (THIS REPORT COMPLETED).            │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ Step 2   │ Review and validate this mapping with the Technical Lead / Sir.            │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ Step 3   │ Resolve missing deployment URLs, API keys, and firewall configurations:     │
│          │ - Rudra: Deployed URL + SETU_MITRA_API_KEY for SETU Gateway                 │
│          │ - Vijay: HTTPS URL + UNIGURU_API_KEY for UniGuru RAG Service                │
│          │ - Raj: Open Windows Firewall TCP 9000 on Tally machine (192.168.0.72)       │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ Step 4   │ Obtain explicit approval for the proposed MITRA attachment boundaries.      │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ Step 5   │ Create an official Implementation Plan (`implementation_plan.md`).         │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ Step 6   │ Execute code implementation strictly inside approved attachment points:    │
│          │ - Raj implements `backend/app/capabilities/setu_capability.py`              │
│          │ - Raj fixes HTTP client in `backend/app/capabilities/uniguru_capability.py` │
└──────────┴─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Final Conclusive Summary

### 1. What is already available today?
- **MITRA Canonical Runtime**: Full `Safety → Intelligence → Enforcement → Orchestration → Capability → Execution → Bucket` pipeline in `praj33/MITRA`.
- **SAMACHAR**: Fully working news intelligence capability card (`samachar_capability.py`).

### 2. What is structurally present but needs fixing?
- **UniGuru Capability**: `backend/app/capabilities/uniguru_capability.py` is present in `praj33/MITRA`, but lines 30–34 attempt a non-existent embedded import `app.uniguru.engine`. It must be fixed by Raj to call the deployed REST API (`http://163.128.209.18:8007/ask_uniguru`).

### 3. What is blocked by infrastructure or credentials?
- **SETU Node.js Gateway**: Blocked on deployed server URL and `SETU_MITRA_API_KEY` from Rudra.
- **Bright Connection Tally Sync**: Blocked on Windows Firewall TCP port 9000 at `192.168.0.72`.
- **UniGuru Production Access**: Blocked on production HTTPS domain and `UNIGURU_API_KEY` from Vijay.

### 4. What cannot be analyzed because the source is missing?
- **ARTHA** and **Gurukul** repositories (marked `⚪ SOURCE NOT AVAILABLE — ANALYSIS PENDING`).

### 5. What exactly should be presented to Sir for approval?
Present Sections 3, 4, and 5 of this report, specifically highlighting:
1. The **Consolidated Integration Matrix** (Section 4).
2. The **Critical Architecture Decision** (Section 5) confirming Bright Connection routes through SETU (`POST /api/mitra/execute`) rather than existing as a separate capability.
3. The **Ownership Boundaries** enforcing zero direct database writes and zero Tally XML parsing inside MITRA.

### 6. What should NOT be implemented yet?
- **DO NOT** write code for `setu_capability.py` until Rudra provides the deployed URL and API key.
- **DO NOT** attempt direct point-to-point connections from MITRA to Bright Connection / Tally.
- **DO NOT** modify `samachar_capability.py` (working per user directive).
- **DO NOT** touch ARTHA or Gurukul until their source repositories are available for read-only audit.
