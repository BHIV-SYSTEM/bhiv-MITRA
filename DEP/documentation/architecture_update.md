# Architecture Update
## MITRA Universal Companion — Phase 2 Frontend Production Integration

**Contributor:** Ashwini Wadekar  
**Scope:** React Frontend — API Layer and Application Lifecycle  
**Review Date:** 2026-07-31

---

## 1. Scope of This Document

This document describes the frontend architecture as modified by this contribution. It covers only the React application layer (`frontend/frontend/src/`). Backend architecture is not described here and was not modified by this contributor.

---

## 2. Architecture Diagram

```
MITRA React Frontend (frontend/frontend/src/)
        |
        |  Authentication (AuthContext)
        |  User ID resolved from auth token
        |
        v
  App.tsx — Application Lifecycle
        |
        |  On authentication:
        |    Promise.allSettled([
        |      getSession(userId),      --> stores session_id
        |      getMemory(userId),
        |      getPresence(userId),
        |      getCapabilities()
        |    ])
        |
        |  getGreeting(userId)          --> injected as first message
        |
        |  setInterval(sendHeartbeat, 60000)
        |
        v
  ApiService (frontend/frontend/src/services/api.ts)
        |
        |  getHeaders():
        |    Content-Type: application/json
        |    X-API-Key: <env>
        |    Authorization: Bearer <token>
        |
        |  _sessionId (module-level, set once, reused per turn)
        |
        v
  BHIV Production Companion API
  (https://mitra-backend-q1f3.onrender.com)
        |
        +-- POST /api/companion/chat
        +-- GET  /api/companion/greeting/{user_id}
        +-- GET  /api/companion/session/{user_id}
        +-- GET  /api/companion/memory/{user_id}
        +-- GET  /api/companion/capabilities
        +-- GET  /api/v1/presence/{user_id}
        +-- POST /api/v1/presence/heartbeat
        |
        v
  Production Backend Services
  (Integrated with production backend services provided by the BHIV ecosystem)
```

---

## 3. Component Responsibilities

### 3.1 `App.tsx`

Owns the application lifecycle. Responsibilities added in this integration:

- Runs the startup sequence once on authentication using `startupRanRef`
- Calls `apiService.setSessionId()` with the session ID returned by `getSession()`
- Injects the greeting as the first `ConversationMessage` using `greetingInjectedRef`
- Manages the 60-second heartbeat interval; clears it on unmount and `beforeunload`

### 3.2 `api.ts` — `ApiService` class

Single shared service instance (`apiService`) exported as a module singleton. Responsibilities:

- Constructs authentication headers for every request
- Manages `_sessionId` at module scope; exposes `setSessionId()` and `getStoredSessionId()`
- Implements all companion lifecycle methods
- Maps the production chat response into the existing `AssistantResponse` contract
- Applies a 90-second `AbortController` timeout to `sendMessage()`

### 3.3 `contextStore.js` (unchanged)

Manages `localStorage` persistence for the companion widget (`src/`). Not modified by this contribution. Persists: `history`, `dockMode`, `position`, `avatar`, `replays`.

### 3.4 `RuntimeService.js` (unchanged)

Manages the health check connection and heartbeat for the companion widget (`src/`). Not modified by this contribution.

---

## 4. Session Continuity Design

```
User authenticates
        |
        v
App.tsx startup effect runs (once, guarded by startupRanRef)
        |
        v
apiService.getSession(userId)
        |
        v
session_id stored in _sessionId (module-level variable in api.ts)
        |
        v
User sends message
        |
        v
apiService.sendMessage({ message })
  --> body includes session_id when _sessionId is set
        |
        v
Backend maintains conversation state for this session_id
        |
        v
User sends next message
  --> same session_id included
  --> backend continues same conversation
```

The `_sessionId` variable persists for the lifetime of the browser tab. It is not written to `localStorage`. If the page is refreshed, `getSession()` runs again at startup and a new (or restored) session ID is obtained from the backend.

---

## 5. Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| Startup endpoint failure | `Promise.allSettled` — chat remains functional; session_id may be null |
| Chat request timeout (>90s) | `AbortController` fires; user receives "Request timed out" message |
| Chat network error | Caught; user receives "Unable to connect to backend" message |
| Heartbeat failure | Silently caught; no UI impact |
| Greeting failure | Caught; `greetingInjectedRef` set to true; no greeting shown |
| Non-OK HTTP response | Error message extracted from `error.message`, `detail`, or HTTP status |

---

## 6. What Was Not Changed

The following files and systems were not modified by this contribution:

- All UI components (`ChatMessage`, `MessageInput`, `ChatSidebar`, `ConnectionStatus`, etc.)
- `AuthContext.tsx`, `LanguageContext.tsx`
- `types.ts` — `AssistantRequest`, `AssistantResponse`, `ConversationMessage`, `Conversation`
- `authApi.ts`
- `src/mitra-companion.js` and all companion widget components under `src/`
- All backend files under `backend/`
- All HTML pages (`index.html`, `login.html`, `signup.html`, `pages/*.html`)
