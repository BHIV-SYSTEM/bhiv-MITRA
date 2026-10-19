# CORRECTED MITRA FRONTEND IMPLEMENTATION PLAN

**Target Repository:** https://github.com/praj33/MITRA  
**Target Branch:** `main` (Commit `61c8512`)  
**Owner:** Ashwini Wadekar — MITRA Companion UX & Live Interaction Surface  
**Date:** 2026-08-29  
**Status:** STRICT READ-ONLY VERIFIED & READY FOR FRONTEND IMPLEMENTATION  

---

> [!IMPORTANT]
> **STRICT CONTRACT ADHERENCE.** No mock backend contracts, fake data generators, or unverified backend fields are included. All proposed UI updates use verified `CompanionResponse` and `CapabilityResult` schemas from the `praj33/MITRA` `main` branch.

---

## 1. Verified Current Backend Response & Event Schemas

### A. `CompanionResponse` JSON Schema (`companion_orchestrator.py`)
```json
{
  "message": "string",
  "capability_result": {
    "capability": "string",
    "intent": "string",
    "status": "success | error | pending | not_found",
    "summary": "string",
    "data": { ... },
    "actions": [],
    "error": null,
    "trace_id": "string"
  },
  "session_id": "string",
  "trace_id": "string",
  "intent": "string",
  "suggested_actions": ["string"]
}
```

### B. Verified SAMACHAR Data Schema (`controlPlane.js` & `samachar_capability.py`)
```json
{
  "capability": "samachar",
  "status": "success",
  "summary": "Retrieved news intelligence from Samachar.",
  "data": {
    "capability": "samachar",
    "query": "string",
    "url": "string or null",
    "result": "string (summary text)",
    "scraped_data": {
      "title": "string",
      "category": "Technology | Politics | Sports | Business | Weather | Health | Science | Entertainment | Breaking News",
      "author": "string",
      "date": "string"
    },
    "vetting_results": {
      "authenticity_score": 95,
      "credibility_rating": "High"
    },
    "summary": { "text": "string" }
  }
}
```

### C. Active Event Names (`eventBus.js` & `controlPlane.js`)
- `health.changed`: `{ status: 'Healthy' | 'Busy' | 'Error' | 'Connecting' | 'Offline' | 'Recovered' }`
- `chat.mitra_message`: `{ role: 'mitra', text, intent, suggestedActions, capabilityResult, traceId }`
- `user.message_sent`: `{ text: string }`
- `capability.completed`: `{ capability: string, duration: string, result: string, data: Object }`
- `capability.failed`: `{ capability: string, error: string, data: Object }`

---

## 2. Classification of Proposed Frontend Changes

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          PROPOSED FRONTEND CHANGE CLASSIFICATION                       │
├──────────────────────────────────┬─────────────────────────────────────────────────────┤
│ Feature                          │ Classification Status                               │
├──────────────────────────────────┼─────────────────────────────────────────────────────┤
│ SAMACHAR News Intelligence Card  │ 🟢 VERIFIED SAFE TO IMPLEMENT (Already operational) │
│ 6-State Header Connection Dot    │ 🟢 VERIFIED SAFE TO IMPLEMENT                       │
│ UniGuru Kosha Citation Card UI   │ 🟡 IMPLEMENTABLE BUT WAITING FOR REAL BACKEND       │
│ SETU Inventory/Order Card UI     │ 🔴 BLOCKED (Missing SetuCapability backend file)    │
└──────────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 3. Exact Component & File Modification Plan

### File 1: `src/components/ConversationPanel.js`

#### Signature Verification
`addCapabilityCard(capability, resultText, duration, backendData = {})` (Line 188) — **VERIFIED.**

#### Modifications:
1. **Add UniGuru Kosha RAG Citation Card Template**:
   - Check if `capability === 'uniguru'`.
   - Render header: `🎓 UNIGURU KOSHA KNOWLEDGE CITATION`.
   - If `backendData.evidence` is present (from future backend update): render `Textbook ID`, `Page Numbers`, `Source Hash`, `Lineage Hash`, and `verification_status: "VERIFIED"`.
   - If in LLM fallback mode (`backendData.source === 'llm_fallback'`): render clean Knowledge Answer bubble with fallback indicator.

2. **Add SETU Inventory & Order Card Template**:
   - Check if `capability === 'setu'`.
   - Render header: `🔌 SETU OPERATIONAL GATEWAY`.
   - Render stock items table or order status summary from `backendData`.

---

### File 2: `src/services/controlPlane.js`

#### Modifications:
1. **Refine Capability Event Dispatching**:
   - Ensure `data.capability_result` for `uniguru` and `setu` cleanly emits `capability.completed` with `trace_id` attached.
2. **Support Enhanced Health Status Events**:
   - Emit `health.changed: { status: 'Connecting' }` before API fetch, `{ status: 'Busy' }` during processing, `{ status: 'Healthy' }` on 200 OK, and `{ status: 'Offline' }` on network failure.

---

### File 3: `src/components/Header.js`

#### Modifications:
1. **Map 6 Visual Connection States**:
   - `Connecting`: Yellow pulsing status dot (`#ffb700`) + `"Connecting to MITRA..."`
   - `Busy` / `Executing`: Purple pulsing dot (`#e056fd`) + `"Executing..."`
   - `Healthy` / `Success`: Green status dot (`#00e676`) + `"Healthy"`
   - `Error` / `Failed`: Red alert dot (`#ff3b30`) + `"Pipeline Error"`
   - `Offline` / `Disconnected`: Orange dot (`#ff9500`) + `"Offline (Local Mode)"`
   - `Recovered`: Green dot (`#00e676`) + `"Connection Restored"`

---

## 4. Summary of What Can Be Implemented Now vs Blocked

### Implementable Now (Frontend Owner: Ashwini Wadekar)
- [x] Verified `CompanionResponse` & `CapabilityResult` backend schemas.
- [ ] Add UniGuru Kosha Knowledge Citation card template in `ConversationPanel.js`.
- [ ] Implement 6-state connection indicator in `Header.js`.
- [ ] Enhance `controlPlane.js` event emitter for capability completions.

### Blocked Waiting on External Owners
- 🛑 **UniGuru Kosha RAG Evidence Metadata**: Raj Prajapati must update `uniguru_capability.py` to return `verification_status`, `textbook_id`, `page_numbers`, `source_hash`, `lineage_hash`.
- 🛑 **`SetuCapability` Creation**: Raj Prajapati must create `backend/app/capabilities/setu_capability.py`.
- 🛑 **SETU Gateway Production URL**: Rudra Parmeshwar must supply the deployed Node.js Express server URL & `SETU_MITRA_API_KEY`.
- 🛑 **Tally Port 9000 Firewall**: Raj Prajapati must unblock Windows Firewall port 9000 at `192.168.0.72`.
