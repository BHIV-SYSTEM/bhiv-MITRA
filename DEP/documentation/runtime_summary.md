# Runtime Summary
## MITRA Universal Companion — Phase 2 Frontend Production Integration

**Contributor:** Ashwini Wadekar  
**Scope:** Frontend Runtime Behavior  
**Review Date:** 2026-07-31

---

## 1. Scope

This document describes the runtime behavior of the frontend after the Phase 2 production integration. It covers the sequence of operations from page load through active conversation. Backend runtime behavior is not described here and was not implemented by this contributor.

---

## 2. Startup Runtime Sequence

The following sequence executes once per authenticated session, on the first render after authentication resolves.

```
1. AuthContext resolves isAuthenticated = true, user.id available

2. App.tsx startup effect fires (startupRanRef prevents re-execution)

3. Four requests dispatched in parallel via Promise.allSettled:
   a. GET /api/companion/session/{user_id}
   b. GET /api/companion/memory/{user_id}
   c. GET /api/v1/presence/{user_id}
   d. GET /api/companion/capabilities

4. If (a) resolves successfully:
      apiService.setSessionId(session_id)
      _sessionId = session_id  [module-level variable in api.ts]

5. Greeting effect fires (greetingInjectedRef prevents re-execution):
   GET /api/companion/greeting/{user_id}
   --> greeting text injected as first ConversationMessage

6. Heartbeat interval starts:
   setInterval(() => POST /api/v1/presence/heartbeat, 60000)
```

If any of steps 3a–3d fail, the remaining steps are unaffected. Chat is functional regardless of startup endpoint availability.

---

## 3. Chat Turn Runtime Sequence

The following sequence executes for each user message.

```
1. User submits message via MessageInput

2. App.tsx handleSendMessage() called

3. New ConversationMessage created with isLoading: true
   --> Rendered immediately in UI (optimistic update)

4. apiService.sendMessage({ message, session_id? }) called

5. Request sent:
   POST /api/companion/chat
   Headers: Content-Type, X-API-Key, Authorization
   Body: { message: string, session_id: string | undefined }
   Timeout: 90 seconds (AbortController)

6. Response received:
   json.message or json.response extracted as reply text

7. Reply mapped into AssistantResponse contract

8. ConversationMessage updated: isLoading: false, assistantResponse set

9. Message persisted to localStorage via existing conversation sync effect
```

---

## 4. Heartbeat Runtime

```
Interval: 60 seconds
Trigger: setInterval, starts after authentication
Endpoint: POST /api/v1/presence/heartbeat
Body: { user_id: string }
Error handling: .catch(() => {}) — silent; no UI impact
Cleanup: clearInterval on component unmount and window beforeunload
```

---

## 5. Session ID Runtime

```
Lifecycle: module-level variable _sessionId in api.ts
Initial value: null
Set: once, after getSession() resolves at startup
Reused: in every sendMessage() call body
Reset: on page refresh (getSession() runs again at next startup)
Not persisted: to localStorage (backend is source of truth)
```

---

## 6. Authentication Token Runtime

```
Storage: localStorage key 'authToken'
Read: on every API request via getToken() in api.ts
Included: as Authorization: Bearer <token> header when present
Managed by: AuthContext.tsx (not modified by this contribution)
```

---

## 7. Companion Widget Runtime (`src/`)

The companion widget operates as a Web Component independent of the React application. Its runtime behavior is as follows.

```
Page load:
  1. <mitra-companion> custom element connected
  2. Shadow DOM rendered
  3. contextStore.loadState() reads localStorage
     --> dockMode, position, avatar, history restored
  4. runtimeService.connectAll() called
     --> GET /health checked
     --> If healthy: startHeartbeat() begins (5-second interval to /health)

User opens companion:
  1. FAB clicked --> MITRAWindow.expand()
  2. Conversation history loaded from contextStore

User sends message:
  1. Footer input submitted
  2. runtimeService.sendMessage(text) called
  3. controlPlane.sendMessage(text) called
     --> POST /api/assistant (legacy endpoint, unchanged in widget)
  4. Response emitted via eventBus 'notification.received'
  5. ConversationPanel appends message
  6. contextStore.addMessage() persists to localStorage

User changes avatar:
  1. File picker triggered via right-click or header button
  2. FileReader reads file as data URL
  3. contextStore.setAvatar(dataUrl) persists to localStorage
  4. eventBus emits 'avatar.changed'
  5. FAB and header update avatar display
```

Note: The companion widget (`src/`) uses the legacy `/api/assistant` endpoint via `controlPlane.js`. The production companion API integration (`/api/companion/chat`) is implemented in the React application (`frontend/frontend/src/services/api.ts`). These are two separate frontend surfaces.

---

## 8. Backend Services

All backend services consumed by the frontend are provided by the BHIV ecosystem. The frontend integrates with production backend services provided by the BHIV ecosystem. No backend runtime was implemented by this contributor.

---

## 9. Runtime Constraints

| Constraint | Value | Reason |
|------------|-------|--------|
| Chat request timeout | 90 seconds | Accommodates Render.com cold start |
| Heartbeat interval | 60 seconds | Keeps presence active without excessive requests |
| Health check interval (widget) | 5 seconds | Provides responsive connection status in widget |
| Startup guard | Once per auth session | Prevents duplicate session/memory/presence calls |
| Greeting guard | Once per auth session | Prevents duplicate greeting injection |
