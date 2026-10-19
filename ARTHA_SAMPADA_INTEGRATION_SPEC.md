# MITRA & BHIV ECOSYSTEM INTEGRATION SPECIFICATION: ARTHA & SAMPADA

**Document Version:** 1.0.0  
**Target Systems:** Artha (Financial & Wealth Intelligence Engine) & Sampada (Asset & Holdings Management)  
**Lead System Owners / Engineers:** Ashmit & Rudra  
**Core System Integration:** MITRA Universal OS Companion & Common Trace Model  

---

## 1. Executive Summary & Objective

This specification details the technical integration contract between the **MITRA Universal OS Companion** and the **Artha & Sampada** product modules within the BHIV Ecosystem.

As per system architecture guidelines:
* **MITRA must participate as a real operational system**, not merely a passive status card or generic fallback container.
* Both **Artha** and **Sampada** must adhere to the BHIV Common Trace Model, audit logging standards, security contracts, and real-time operational state synchronization.

---

## 2. Target System Roles & Ownership

| System Module | Description | Module Leads | Primary Scope |
| :--- | :--- | :--- | :--- |
| **Artha** | Financial intelligence, market analytics, trade executions, portfolio queries | Ashmit & Rudra | Financial data pipelines, transaction execution, real-time market data sync |
| **Sampada** | Asset holdings, wealth inventory, capital distribution, ledger tracking | Ashmit & Rudra | Asset ledger verification, holdings balance queries, transaction history audit |

---

## 3. Operational View Integration Contract

MITRA integrates into the operational view of **Artha** and **Sampada** through the following binding layers:

### 3.1 Floating Companion & UI Dock Integration
* **Placement:** Persistent bottom-right floating widget or header dock action within the Artha & Sampada web applications.
* **Event Handlers:**
  - `mitra.intent.portfolio_query` → Triggers Artha portfolio analytics view.
  - `mitra.intent.holdings_audit` → Triggers Sampada asset ledger breakdown.
  - `mitra.intent.trade_execution` → Initiates trade confirmation workflow with explicit user confirmation.

### 3.2 Real-Time Health & Operational Status Binding
Both modules must expose a health probe endpoint compliant with the BHIV Ecosystem contract:
* **Artha Health Check:** `GET /api/artha/health`
* **Sampada Health Check:** `GET /api/sampada/health`

**Expected JSON Contract:**
```json
{
  "system": "artha",
  "status": "healthy",
  "latency_ms": 42,
  "db_connected": true,
  "trace_id": "trc_artha_918237",
  "version": "1.0.0",
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 4. Audit & Security Contracts

### 4.1 Common Trace Model (`trace_id`)
All financial requests passing through Artha and Sampada must carry and propagate a unique `trace_id`.
* Header Name: `X-BHIV-Trace-Id`
* Format: `trc_<system>_<uuid4_short>` (e.g., `trc_artha_8f91a20b`)
* Log Requirement: Every state mutation (trade execution, balance update, ledger query) must write to audit logs with the associated `trace_id`.

### 4.2 Security & Authentication
* **API Key Requirement:** Requests from MITRA to Artha/Sampada must include `X-API-Key: bhiv-enterprise-key` (or environment-configured `API_KEY`).
* **JWT Identity Propagation:** User identity must be read strictly from `Authorization: Bearer <token>`. User IDs must never be trusted from unauthenticated request bodies or query parameters.

### 4.3 Audit Event Schema
Artha & Sampada must emit structured audit events on critical operations:
```json
{
  "event_type": "FINANCIAL_AUDIT",
  "system": "artha",
  "action": "PORTFOLIO_QUERY",
  "user_id": "user_12345",
  "trace_id": "trc_artha_8f91a20b",
  "status": "SUCCESS",
  "details": {
    "assets_scanned": 12,
    "portfolio_value_inr": 250000.00
  },
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 5. Capability Execution Bindings

| Capability | Intent | Handler Endpoint | Result Payload Contract |
| :--- | :--- | :--- | :--- |
| `samruddhi` / `artha` | `portfolio_balance` | `POST /api/companion/execute` | `{ "status": "success", "portfolio": { "total_value": ..., "holdings": [...] } }` |
| `samruddhi` / `sampada` | `asset_ledger` | `POST /api/companion/execute` | `{ "status": "success", "assets": [...], "ledger_status": "verified" }` |

---

## 6. Implementation Checklist for Ashmit & Rudra

- [ ] Add `X-BHIV-Trace-Id` header handling to all REST & WebSocket endpoints.
- [ ] Mount health endpoints `/api/artha/health` & `/api/sampada/health`.
- [ ] Register Artha & Sampada capabilities with `MITRA CompanionOrchestrator`.
- [ ] Verify CORS headers allow `http://localhost:3000` & `https://mitra.blackholeinfiverse.com`.
- [ ] Implement audit event emission on trade/asset mutations.

---
*Signed by MITRA Engineering Lead — Ashwini Wadekar*
