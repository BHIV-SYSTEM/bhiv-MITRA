# Review Packet
## MITRA Universal Companion — Phase 2 Frontend Production Integration

**Contributor:** Ashwini Wadekar  
**Scope:** React Frontend — Production API Integration  
**Primary Files:** `frontend/frontend/src/services/api.ts`, `frontend/frontend/src/App.tsx`  
**Review Date:** 2026-07-31

---

## 1. Overview

This review packet documents the production integration changes made to the MITRA React frontend. The changes are confined to two primary files: `api.ts` (API service layer) and `App.tsx` (application lifecycle and startup sequence). No UI components were modified.

---

## 2. Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `frontend/frontend/src/services/api.ts` | Modified | Full refactor of API service; all companion endpoints added; auth headers standardized |
| `frontend/frontend/src/App.tsx` | Modified | Startup sequence added; greeting, session, memory, presence, capabilities wired; heartbeat interval added |

---

## 3. API Service — `api.ts`

### 3.1 Authentication Headers

Every request is sent with the following headers, constructed in the private `getHeaders()` method:

```
Content-Type: application/json
X-API-Key: <REACT_APP_API_KEY>
Authorization: Bearer <authToken>   (when token is present in localStorage)
```

The base URL is resolved from `REACT_APP_API_URL` with an HTTPS fallback to the production Render deployment.

### 3.2 Session ID Management

A module-level variable `_sessionId` is declared in `api.ts`. It is `null` on initialization. After `getSession()` resolves successfully in `App.tsx`, `apiService.setSessionId(session_id)` is called. From that point forward, every `sendMessage()` call includes `session_id` in the request body, ensuring the backend maintains conversation state across turns.

```typescript
// Module-level — set once, reused for all subsequent sendMessage calls
let _sessionId: string | null = null;
```

### 3.3 Chat Endpoint

`sendMessage()` posts to `POST /api/companion/chat`. The response is mapped into the existing `AssistantResponse` contract so no downstream component changes were required.

```
POST /api/companion/chat
Body: { message: string, session_id?: string }
```

Response fields `json.message` and `json.response` are both handled; the first non-null string value is used as the reply text.

A 90-second `AbortController` timeout is applied to guard against backend cold starts.

### 3.4 Companion Lifecycle Endpoints

| Method | Endpoint | Return Type |
|--------|----------|-------------|
| `getGreeting(userId)` | `GET /api/companion/greeting/{user_id}` | `CompanionGreetingResponse` |
| `getSession(userId)` | `GET /api/companion/session/{user_id}` | `CompanionSessionResponse` |
| `getMemory(userId)` | `GET /api/companion/memory/{user_id}` | `CompanionMemoryResponse` |
| `getCapabilities()` | `GET /api/companion/capabilities` | `CompanionCapabilitiesResponse` |
| `getPresence(userId)` | `GET /api/v1/presence/{user_id}` | `PresenceResponse` |
| `sendHeartbeat(userId)` | `POST /api/v1/presence/heartbeat` | `HeartbeatResponse` |

All methods use the shared `getHeaders()` helper and throw typed errors on non-OK responses.

---

## 4. Application Lifecycle — `App.tsx`

### 4.1 Startup Sequence

On authentication, a one-time startup effect runs using `startupRanRef` to prevent duplicate execution. It calls four endpoints in parallel using `Promise.allSettled`:

```typescript
const [sessionRes] = await Promise.allSettled([
  apiService.getSession(user.id),
  apiService.getMemory(user.id),
  apiService.getPresence(user.id),
  apiService.getCapabilities(),
]);
if (sessionRes.status === 'fulfilled' && sessionRes.value.session_id) {
  apiService.setSessionId(sessionRes.value.session_id);
}
```

`Promise.allSettled` is used deliberately: if any endpoint fails (e.g., during backend cold start), the chat interface remains fully functional.

### 4.2 Greeting Injection

After authentication, `getGreeting(user.id)` is called once (guarded by `greetingInjectedRef`). The greeting text is injected as the first message in the conversation using the existing `ConversationMessage` type. No new types were introduced.

### 4.3 Heartbeat

A `setInterval` runs every 60 seconds while the user is authenticated. It calls `apiService.sendHeartbeat(userId)`. Errors are silently caught to prevent UI disruption. The interval is cleared on component unmount and on `beforeunload`.

```typescript
const intervalId = setInterval(() => {
  apiService.sendHeartbeat(userId).catch(() => {});
}, 60000);
```

### 4.4 Preserved Contract

The `handleSendMessage()` function and its call to `apiService.sendMessage()` were not modified. The `AssistantRequest` and `AssistantResponse` types were not changed. All existing UI components (`ChatMessage`, `MessageInput`, `ChatSidebar`) continue to operate without modification.

---

## 5. Screenshot Evidence

The following screenshots are located in `DEP/evidence_packet/Screenshots/`:

| Reference | Filename | Description |
|-----------|----------|-------------|
| Screenshot-01 | `login_page.png` | Login page with authentication form |
| Screenshot-02 | `dashboard.png` | Main chat dashboard after login |
| Screenshot-03 | `integrationendpoint.png` | Browser Network tab showing companion API endpoint calls |
| Screenshot-04 | `session_id.png` | Session ID reuse visible in Network tab request payloads |
| Screenshot-05 | `heartbeat.png` | Heartbeat POST request in Network tab |
| Screenshot-06 | `chating.png` | Active chat session with user message sent |
| Screenshot-07 | `respones.png` | Chat response received from production backend |
| Screenshot-08 | `respons.png` | Additional chat response evidence |
| Screenshot-09 | `health.png` | Backend health status indicator |
| Screenshot-10 | `Floating_Orb.png` | Floating Orb UI mode (frontend widget) |
| Screenshot-11 | `avtar.png` | Default companion avatar display |
| Screenshot-12 | `change_avtar.png` | Custom avatar applied to companion |

---

## 6. Known Limitations

- `getTasks()` and `updateTaskStatus()` are stubbed. The production backend does not expose independent task fetch/update endpoints in the current version.
- `search()`, `research()`, and `getPerformanceInsights()` are stubbed. These capabilities are not available in the current backend version.
- Cross-origin session continuity requires a backend session-restore endpoint. The frontend is ready to consume it when available.

---

## 7. No Regressions

- All existing UI components are unchanged.
- The `sendMessage()` public interface is unchanged.
- The `AssistantResponse` and `AssistantRequest` types are unchanged.
- `localStorage`-based conversation history continues to function as before.
- Authentication flow (`AuthContext`, `Login`, `Signup`) is unchanged.
