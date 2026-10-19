# MITRA & BHIV ECOSYSTEM INTEGRATION SPECIFICATION: SETU & GURUKUL

**Document Version:** 1.0.0  
**Target Systems:** Setu (Supply Chain, Inventory & Operations Gateway) & Gurukul (Enterprise Learning & Knowledge System)  
**Lead System Owners / Engineers:** Ranjit & Harsha  
**Core System Integration:** MITRA Universal OS Companion & Common Trace Model  

---

## 1. Executive Summary & Objective

This specification details the technical integration contract between the **MITRA Universal OS Companion** and the **Setu & Gurukul** product modules within the BHIV Ecosystem.

As per system architecture guidelines:
* **MITRA must participate as a real operational system**, not merely a passive status card or generic fallback container.
* Both **Setu** and **Gurukul** must adhere to the BHIV Common Trace Model, audit logging standards, security contracts, and real-time operational state synchronization.

---

## 2. Target System Roles & Ownership

| System Module | Description | Module Leads | Primary Scope |
| :--- | :--- | :--- | :--- |
| **Setu** | Operations management, inventory tracking, order routing, supply chain telemetry | Ranjit & Harsha | Real-time stock queries, operational alerts, supply chain telemetry |
| **Gurukul** | Enterprise learning platform, course modules, skill assessments, knowledge progress | Ranjit & Harsha | Course progress tracking, quiz evaluations, skill matrix updates |

---

## 3. Operational View Integration Contract

MITRA integrates into the operational view of **Setu** and **Gurukul** through the following binding layers:

### 3.1 Floating Companion & UI Dock Integration
* **Placement:** Persistent bottom-right floating widget or header dock action within the Setu & Gurukul web applications.
* **Event Handlers:**
  - `mitra.intent.inventory_lookup` → Triggers Setu real-time stock lookup widget.
  - `mitra.intent.operational_summary` → Triggers Setu supply chain status summary.
  - `mitra.intent.course_progress` → Displays Gurukul learning roadmap & active module status.

### 3.2 Real-Time Health & Operational Status Binding
Both modules must expose a health probe endpoint compliant with the BHIV Ecosystem contract:
* **Setu Health Check:** `GET /api/setu/health`
* **Gurukul Health Check:** `GET /api/gurukul/health`

**Expected JSON Contract:**
```json
{
  "system": "setu",
  "status": "healthy",
  "latency_ms": 35,
  "inventory_service_online": true,
  "trace_id": "trc_setu_781290",
  "version": "1.0.0",
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 4. Audit & Security Contracts

### 4.1 Common Trace Model (`trace_id`)
All operational and learning telemetry requests passing through Setu and Gurukul must carry and propagate a unique `trace_id`.
* Header Name: `X-BHIV-Trace-Id`
* Format: `trc_<system>_<uuid4_short>` (e.g., `trc_setu_9a12b40c`)
* Log Requirement: Every state mutation (stock update, order dispatch, course completion) must write to audit logs with the associated `trace_id`.

### 4.2 Security & Authentication
* **API Key Requirement:** Requests from MITRA to Setu/Gurukul must include `X-API-Key: bhiv-enterprise-key` (or environment-configured `API_KEY`).
* **JWT Identity Propagation:** User identity must be read strictly from `Authorization: Bearer <token>`. User IDs must never be trusted from unauthenticated request bodies or query parameters.

### 4.3 Audit Event Schema
Setu & Gurukul must emit structured audit events on critical operations:
```json
{
  "event_type": "OPERATIONS_AUDIT",
  "system": "setu",
  "action": "INVENTORY_LOOKUP",
  "user_id": "user_67890",
  "trace_id": "trc_setu_9a12b40c",
  "status": "SUCCESS",
  "details": {
    "sku": "TEA-LEAF-PREMIUM-500G",
    "stock_level": 450,
    "status": "IN_STOCK"
  },
  "timestamp": "2026-09-22T14:30:00Z"
}
```

---

## 5. Capability Execution Bindings

| Capability | Intent | Handler Endpoint | Result Payload Contract |
| :--- | :--- | :--- | :--- |
| `setu` | `inventory_lookup` | `POST /api/companion/execute` | `{ "status": "success", "item": "Tea Leaves", "stock": 450 }` |
| `gurukul` | `course_progress` | `POST /api/companion/execute` | `{ "status": "success", "enrolled_courses": [...], "progress": "75%" }` |

---

## 6. Implementation Checklist for Ranjit & Harsha

- [ ] Add `X-BHIV-Trace-Id` header handling to all REST & WebSocket endpoints.
- [ ] Mount health endpoints `/api/setu/health` & `/api/gurukul/health`.
- [ ] Register Setu & Gurukul capabilities with `MITRA CompanionOrchestrator`.
- [ ] Verify CORS headers allow `http://localhost:3000` & `https://mitra.blackholeinfiverse.com`.
- [ ] Implement operational & learning audit logging.

---
*Signed by MITRA Engineering Lead — Ashwini Wadekar*
