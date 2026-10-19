# MITRA COMPANION: UI & SYSTEM INTEGRATION CONTRACT

**Document Version:** 1.0.0  
**Target Systems:** NYAI, Artha, Sampada, Setu, Gurukul, UniGuru, and BHIV Shared Web Applications  
**Core Purpose:** Comprehensive technical guide, API contracts, auth requirements, and code references for embedding MITRA across existing and new BHIV UI surfaces.

---

## 1. Overview & Architectural Role

MITRA operates as a **Universal OS Companion** across the BHIV Ecosystem. Rather than acting as a static status card, MITRA participates as an active operational system with:
1. **Universal Floating Dock / Button:** Accessible on any BHIV page (bottom-right).
2. **Context-Aware Conversational Drawer:** Real-time NLP, intent extraction, and capability execution cards.
3. **Common Trace Model (`X-BHIV-Trace-Id`):** Event telemetry and audit logging across BHIV microservices.

---

## 2. API Contract & Endpoints

### 2.1 Base URLs
* **Local Development Backend:** `http://localhost:8001`
* **Production Cloud Backend:** `https://mitra-backend-q1f3.onrender.com` / `https://mitra.blackholeinfiverse.com`

---

### 2.2 Primary Conversation Endpoint (`POST /api/companion/chat`)

Primary endpoint for user messages, NLP parsing, and intent execution.

* **URL:** `POST /api/companion/chat`
* **Headers:**
  ```http
  Content-Type: application/json
  X-API-Key: bhiv-enterprise-key
  Authorization: Bearer <jwt_token>  (Optional for guest, required for logged-in user)
  X-BHIV-Trace-Id: trc_<system>_<uuid> (Optional trace context)
  ```

* **Request Body Schema:**
  ```json
  {
    "message": "Send email to test@example.com subject: Meeting body: 4 PM update",
    "user_id": "user_501cfb6024484f8c8ccb8c52b2835e45",
    "platform": "web",
    "device": "browser",
    "page_context": {
      "active_app": "nyai",
      "url": "http://localhost:3000/pages/nyai",
      "selected_domain": "criminal_law"
    }
  }
  ```

* **Response Body Schema (HTTP 200 OK):**
  ```json
  {
    "message": "Email sent to test@example.com — Subject: \"Meeting\"",
    "intent": "email",
    "suggested_actions": ["View full draft", "Edit before sending"],
    "capability_result": {
      "capability": "email",
      "intent": "send_email",
      "status": "success",
      "summary": "Email sent to test@example.com",
      "data": {
        "status": "success",
        "to": "test@example.com",
        "subject": "Meeting",
        "method": "backend_smtp"
      }
    },
    "trace_id": "trc_nyai_918237a1"
  }
  ```

---

### 2.3 Real-Time Capability Execution (`POST /api/companion/execute`)

Executes specific capabilities directly without conversational NLP overhead.

* **URL:** `POST /api/companion/execute`
* **Headers:** Same as Chat API (`X-API-Key`, `Authorization`).
* **Request Body:**
  ```json
  {
    "capability": "device",
    "intent": "send_notification",
    "params": {
      "message": "Urgent Call Alert",
      "recipient": "Ashwini"
    },
    "user_id": "user_12345"
  }
  ```

---

### 2.4 Notifications APIs

* **Fetch Notifications:** `GET /api/v1/notifications/{user_id}`
* **Mark Notification as Read:** `PATCH /api/v1/notifications/{notification_id}/read`

---

## 3. Authentication & Security Contract

1. **X-API-Key Header:**
   - All REST API calls require `X-API-Key: bhiv-enterprise-key`.
   - In local development mode, fallback keys (`bhiv-enterprise-key`, `your_api_key_here`, `internal_key`) are accepted automatically.

2. **Bearer Token Authentication:**
   - Pass JWT token in `Authorization: Bearer <jwt_token>` header.
   - Unauthenticated sessions automatically fall back to `guest_user` identity in non-production environments.

3. **CORS Origins Allowed:**
   - `http://localhost:3000`, `http://localhost:3001`, `http://127.0.0.1:3000`
   - `https://mitra.blackholeinfiverse.com`, `https://uniguru.blackholeinfiverse.com`, `https://samachar.blackholeinfiverse.com`, `https://setu.blackholeinfiverse.com`, `https://artha.blackholeinfiverse.com`

---

## 4. Frontend Integration Guide & Reference Code

### 4.1 Embedding MITRA into Any HTML / React / Vanilla JS Web App

Add the module script import to your main `index.html` or main app entry:

```html
<!-- Import MITRA Companion Stylesheet -->
<link rel="stylesheet" href="/src/index.css" />

<!-- Import MITRA Companion ES Module -->
<script type="module" src="/src/mitra-companion.js"></script>
```

Or instantiate programmatically in JS:

```javascript
import { MITRAWindow } from './src/components/MITRAWindow.js';
import { MITRAButton } from './src/components/MITRAButton.js';
import { RuntimeService } from './src/services/RuntimeService.js';
import { eventBus } from './src/services/eventBus.js';

// 1. Initialize Runtime & Event Bus
const runtime = new RuntimeService(eventBus);

// 2. Instantiate Floating Button & Window
const mitraButton = new MITRAButton(eventBus);
document.body.appendChild(mitraButton.element);

const mitraWindow = new MITRAWindow(runtime, eventBus, dockController);
document.body.appendChild(mitraWindow.element);
```

---

### 4.2 Handling Real-Time User Actions vs. History Hydration

> **CRITICAL RULE:** To prevent notification spam on page load/refresh, pass `isRealtime = false` during history hydration, and `isRealtime = true` ONLY when a real user action completes.

```javascript
// Example from ConversationPanel.js
eventBus.on('capability.completed', (data) => {
  // Real-time execution when user actively sends a message
  this.addCapabilityCard(data.capability, data.result, data.duration, data.data || {}, true);
});

// During page load / history hydration
history.forEach(msg => {
  // Historical rendering: suppresses popups/toasts
  this.addCapabilityCard(msg.capabilityName, msg.result, msg.duration, msg.data, false);
});
```

---

## 5. Existing Reference Implementations

1. **Local MITRA Shell App:** `http://localhost:3000` (Root directory: `c:\Users\pc\Desktop\BHIV_ASHWINI\Mitra`)
   - `src/mitra-companion.js` (Main companion orchestration)
   - `src/components/ConversationPanel.js` (Widget card rendering)
   - `src/services/controlPlane.js` (HTTP client & API bridge)

2. **BHIV NYAI Repository:** `BHIV-Engineering-Exchange/bhiv-NYAI` (`commit ccc1f8d`)
   - Floating Companion UI integration.
   - Galaxy background 30 FPS rendering throttle (`Galaxy.jsx`).
   - Expanded criminal domain keyword matching & developer details toggle.

3. **Integration Specs for Ecosystem Apps:**
   - `MITRA_INTEGRATION_SPEC_FOR_RHUGVED.md` (Operational View & Trace Model)
   - `ARTHA_SAMPADA_INTEGRATION_SPEC.md` (Ashmit & Rudra)
   - `SETU_GURUKUL_INTEGRATION_SPEC.md` (Ranjit & Harsha)
   - `UNIGURU_INTEGRATION_SPEC.md` (Vijay & Isha)

---

## 6. Checklist for Front-End Wiring

- [ ] Import `mitra-companion.js` ES module into application shell.
- [ ] Set `X-API-Key: bhiv-enterprise-key` header on API requests.
- [ ] Pass active page context (`page_context`) in `/api/companion/chat` payload.
- [ ] Maintain `isRealtime` flag check to suppress historical popups on page refresh.
- [ ] Attach `X-BHIV-Trace-Id` header to outbound network events for audit trace tracking.

---
*Signed by MITRA Engineering Lead — Ashwini Wadekar*
