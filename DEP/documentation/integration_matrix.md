# Integration Matrix
## MITRA Universal Companion — Phase 2 Frontend Production Integration

**Contributor:** Ashwini Wadekar  
**Scope:** React Frontend API Integration  
**Review Date:** 2026-07-31

---

## 1. Endpoint Integration Status

| Feature | HTTP Method | Endpoint | Status | Evidence | Notes |
|---------|-------------|----------|--------|----------|-------|
| Chat | POST | `/api/companion/chat` | Integrated | Screenshot-03, Screenshot-06, Screenshot-07 | Replaces legacy `/api/assistant`; session_id included when available |
| Greeting | GET | `/api/companion/greeting/{user_id}` | Integrated | Screenshot-03 | Called once on auth; result injected as first message |
| Session | GET | `/api/companion/session/{user_id}` | Integrated | Screenshot-04 | session_id stored in `_sessionId`; reused for all chat turns |
| Memory | GET | `/api/companion/memory/{user_id}` | Integrated | Screenshot-03 | Called at startup via `Promise.allSettled`; non-fatal on failure |
| Presence | GET | `/api/v1/presence/{user_id}` | Integrated | Screenshot-03 | Called at startup; non-fatal on failure |
| Heartbeat | POST | `/api/v1/presence/heartbeat` | Integrated | Screenshot-05 | 60-second interval; errors silently caught |
| Capabilities | GET | `/api/companion/capabilities` | Integrated | Screenshot-03 | Called at startup; non-fatal on failure |
| Health Check | GET | `/health` | Integrated | Screenshot-09 | Used by `RuntimeService.js` for connection status display |

---

## 2. Authentication Integration Status

| Mechanism | Header | Status | Notes |
|-----------|--------|--------|-------|
| API Key | `X-API-Key` | Integrated | Read from `REACT_APP_API_KEY` env variable; fallback to `bhiv-enterprise-key` |
| Bearer Token | `Authorization: Bearer <token>` | Integrated | Read from `localStorage.getItem('authToken')`; included when present |
| Base URL | `REACT_APP_API_URL` | Integrated | Resolved at module load; HTTPS enforced |

---

## 3. Session Continuity Status

| Mechanism | Status | Notes |
|-----------|--------|-------|
| Session ID acquisition | Integrated | `getSession()` called at startup; `session_id` stored in module-level `_sessionId` |
| Session ID reuse | Integrated | Every `sendMessage()` call includes `session_id` in request body when `_sessionId` is set |
| Startup guard | Integrated | `startupRanRef` prevents duplicate startup calls on re-render |
| Greeting guard | Integrated | `greetingInjectedRef` prevents duplicate greeting injection |
| Conversation history | Integrated | Persisted to `localStorage` key `chatHistory` via existing mechanism |

---

## 4. Frontend UI Capability Status

| Capability | Status | Implementation Location | Notes |
|------------|--------|------------------------|-------|
| Floating Orb mode | Present | `src/mitra-companion.js`, `src/components/MITRAButton.js` | Draggable FAB with viewport bounds clamping |
| Minimize window | Present | `src/components/MITRAWindow.js` | CSS class toggle; 300ms delay before FAB re-appears |
| Restore window | Present | `src/components/MITRAButton.js` | Click on FAB calls `mitraWindow.expand()` |
| Expand companion | Present | `src/components/MITRAWindow.js` | `expand()` adds `.expanded` CSS class |
| Custom avatar | Present | `src/components/MITRAButton.js`, `src/services/contextStore.js` | FileReader API; supports PNG, JPG, GIF, WebP, MP4, WebM |
| Dock mode persistence | Present | `src/services/contextStore.js` | `dockMode` persisted to `localStorage` |
| Position persistence | Present | `src/services/contextStore.js` | `position` (left, top) persisted to `localStorage` |

---

## 5. Out-of-Scope Items (Not Integrated by This Contributor)

| Item | Owner | Notes |
|------|-------|-------|
| TANTRA Runtime | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| Universal Capability Runtime | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| Replay Engine | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| InsightFlow | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| Control Plane backend | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| UniGuru backend | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| Runtime Contracts | BHIV ecosystem | Integrated with production backend services provided by the BHIV ecosystem |
| Backend API implementation | BHIV ecosystem | No backend files were modified by this contributor |

---

## 6. Stubbed Endpoints (Not Available in Current Backend Version)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| `getTasks()` | — | Stubbed | Returns empty array; backend does not expose this endpoint |
| `updateTaskStatus()` | — | Stubbed | Throws error; backend does not expose this endpoint |
| `search()` | — | Stubbed | Returns empty results |
| `research()` | — | Stubbed | Throws error |
| `getPerformanceInsights()` | — | Stubbed | Throws error |
