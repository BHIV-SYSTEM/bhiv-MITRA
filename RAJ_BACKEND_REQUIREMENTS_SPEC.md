# BACKEND INTEGRATION REQUIREMENTS SPECIFICATION FOR RAJ PRAJAPATI

**Target:** Raj Prajapati (MITRA Runtime Integration Owner)  
**Author:** Ashwini Wadekar (MITRA Companion UX Owner)  
**Date:** 2026-08-31  
**Purpose:** Precise task specification for Raj's AI agent to execute live backend capability wiring, trace continuity, and orchestrator routing.

---

## 1. Overview & Architectural Boundaries

Frontend `master1` branch has completed 100% of the UI presence, Web Component Shadow DOM encapsulation, 6-state status indicators, cross-page persistence, and payload context nesting (`page_context: { host_app, current_page }`).

To achieve end-to-end live ecosystem convergence, Raj's backend runtime must fulfill the following 4 technical tasks.

---

## 2. Technical Task Breakdown for Raj's AI Agent

### Task 1: SETU Capability Live HTTP Wiring (`backend/app/capabilities/setu_capability.py`)
- **Objective**: Connect `SetuCapability` to Rudra's live SETU Express Gateway.
- **Target Endpoint**: `POST /api/mitra/execute` (Node.js Gateway) or `POST /setu/route` (FastAPI).
- **Authentication**: Header `X-SETU-API-Key: <SETU_MITRA_API_KEY>`.
- **Request Dispatch Envelope**:
  ```json
  {
    "dispatch_id": "disp_987654321",
    "correlation_id": "<TRACE_ID>",
    "product_id": "prod_mitra_crm",
    "capability_id": "cap_inventory_read",
    "intent_id": "setu.inventory.lookup",
    "payload": {
      "query": "<USER_QUERY>",
      "limit": 10
    }
  }
  ```
- **Provenance Continuity**: Ensure response maps `source_context: { connected_company_id: "bc_bright_connection_001", connected_company_name: "Bright Connection Ltd" }` for Bright Connection Tally telemetry.

---

### Task 2: UniGuru Kosha RAG Live HTTP Wiring (`backend/app/capabilities/uniguru_capability.py`)
- **Objective**: Wire `UniGuruCapability` to Vijay's live UniGuru endpoint.
- **Target Endpoint**: `http://163.128.209.18:8007/ask_uniguru` (or `VJY123VJY/uniguru_ai`).
- **Request Envelope**:
  ```json
  {
    "query": "<KNOWLEDGE_QUERY>",
    "top_k": 5
  }
  ```
- **Response Contract**: Must return populated citation evidence (`textbook_id`, `page_numbers`, `verification_status: "VERIFIED"`) inside `CapabilityResult.data`.

---

### Task 3: Active Host App Context Routing (`backend/app/companion/companion_orchestrator.py`)
- **File**: `backend/app/companion/companion_orchestrator.py`
- **Logic**: In `CompanionOrchestrator.process()`, extract `active_host_app = (page_context or {}).get("host_app", "")`:
  ```python
  if active_host_app == "uniguru":
      is_knowledge = True
      capability_name = None
  elif active_host_app == "setu":
      capability_name = "setu"
      intent = "setu"
  ```
- **CapabilityResult Guarantee**: Ensure `_call_knowledge()` and `capability_registry.execute()` always return a non-null `CapabilityResult` dictionary so `ConversationPanel.js` renders the custom UI card templates.

---

### Task 4: Fail-Open Memory & Database Fallback (`backend/app/companion/companion_memory.py`)
- **Objective**: Prevent 3-second MongoDB connection timeout delays on Windows when local MongoDB daemon is offline.
- **Implementation**: Wrap MongoDB retries in `try/except` with instant in-memory fallback so live requests execute without socket block.

---

## 3. Verification Commands for Raj

Raj's agent can run the following test commands to verify clean execution:

1. **Validate Backend Syntax**:
   ```bash
   python -m py_compile backend/app/capabilities/setu_capability.py backend/app/capabilities/__init__.py backend/app/companion/companion_orchestrator.py
   ```

2. **Run Convergence Test Suite**:
   ```bash
   python backend/test_all_capabilities.py
   ```

3. **Start FastAPI Backend Server**:
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --port 8001
   ```

---

## 4. Handover Sign-Off

Once Raj's AI agent applies these 4 tasks, MITRA Companion will be 100% converged across **SAMACHAR**, **UniGuru**, and **SETU/Bright Connection**.
