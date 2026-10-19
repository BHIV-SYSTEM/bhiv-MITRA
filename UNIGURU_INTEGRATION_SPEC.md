# MITRA & BHIV ECOSYSTEM INTEGRATION SPECIFICATION: UNIGURU

**Document Version:** 1.0.0  
**Target System:** UniGuru (Universal Learning & AI Intelligence Engine)  
**Lead System Owners / Engineers:** Vijay & Isha  
**Core System Integration:** MITRA Universal OS Companion & Common Trace Model  

---

## 1. Executive Summary & Objective

This specification details the technical integration contract between the **MITRA Universal OS Companion** and the **UniGuru** product module within the BHIV Ecosystem.

As per system architecture guidelines:
* **MITRA must participate as a real operational system**, not merely a passive status card or generic fallback container.
* **UniGuru** must adhere to the BHIV Common Trace Model, audit logging standards, security contracts, and real-time operational state synchronization.

---

## 2. Target System Role & Ownership

| System Module | Description | Module Leads | Primary Scope |
| :--- | :--- | :--- | :--- |
| **UniGuru** | Universal AI learning engine, interactive tutoring, concept explanation, academic intelligence | Vijay & Isha | Concept explanation NLP, quiz generation, AI tutoring session state, knowledge retrieval |

---

## 3. Operational View Integration Contract

MITRA integrates into the operational view of **UniGuru** through the following binding layers:

### 3.1 Floating Companion & UI Dock Integration
* **Placement:** Persistent bottom-right floating widget or header dock action within the UniGuru web application.
* **Event Handlers:**
  - `mitra.intent.explain_concept` → Triggers UniGuru concept explanation modal/card.
  - `mitra.intent.generate_quiz` → Initiates interactive UniGuru quiz session within MITRA floating drawer.
  - `mitra.intent.study_recommendations` → Displays AI-curated learning topics.

### 3.2 Real-Time Health & Operational Status Binding
UniGuru must expose a health probe endpoint compliant with the BHIV Ecosystem contract:
* **UniGuru Health Check:** `GET /api/uniguru/health`

**Expected JSON Contract:**
```json
{
  "system": "uniguru",
  "status": "healthy",
  "latency_ms": 28,
  "ai_engine_online": true,
  "trace_id": "trc_uniguru_551289",
  "version": "1.0.0",
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 4. Audit & Security Contracts

### 4.1 Common Trace Model (`trace_id`)
All intelligence queries and AI generation requests passing through UniGuru must carry and propagate a unique `trace_id`.
* Header Name: `X-BHIV-Trace-Id`
* Format: `trc_uniguru_<uuid4_short>` (e.g., `trc_uniguru_3c71a90d`)
* Log Requirement: Every query, concept search, and AI response generation must write to audit logs with the associated `trace_id`.

### 4.2 Security & Authentication
* **API Key Requirement:** Requests from MITRA to UniGuru must include `X-API-Key: bhiv-enterprise-key` (or environment-configured `API_KEY`).
* **JWT Identity Propagation:** User identity must be read strictly from `Authorization: Bearer <token>`. User IDs must never be trusted from unauthenticated request bodies or query parameters.

### 4.3 Audit Event Schema
UniGuru must emit structured audit events on critical operations:
```json
{
  "event_type": "AI_INTELLIGENCE_AUDIT",
  "system": "uniguru",
  "action": "EXPLAIN_CONCEPT",
  "user_id": "user_11223",
  "trace_id": "trc_uniguru_3c71a90d",
  "status": "SUCCESS",
  "details": {
    "topic": "Quantum Computing Basics",
    "tokens_generated": 320,
    "confidence_score": 0.98
  },
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 5. Capability Execution Bindings

| Capability | Intent | Handler Endpoint | Result Payload Contract |
| :--- | :--- | :--- | :--- |
| `uniguru` | `explain` | `POST /api/companion/execute` | `{ "status": "success", "explanation": "...", "key_takeaways": [...] }` |
| `uniguru` | `quiz` | `POST /api/companion/execute` | `{ "status": "success", "quiz_id": "q123", "questions": [...] }` |

---

## 6. Implementation Checklist for Vijay & Isha

- [ ] Add `X-BHIV-Trace-Id` header handling to all REST & WebSocket endpoints.
- [ ] Mount health endpoint `/api/uniguru/health`.
- [ ] Register UniGuru capability with `MITRA CompanionOrchestrator`.
- [ ] Verify CORS headers allow `http://localhost:3000` & `https://mitra.blackholeinfiverse.com`.
- [ ] Implement AI query and intelligence generation audit logging.

---
*Signed by MITRA Engineering Lead — Ashwini Wadekar*
