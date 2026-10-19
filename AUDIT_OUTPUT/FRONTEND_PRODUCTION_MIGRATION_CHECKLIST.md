# Frontend Production Migration Checklist

## Objective
This checklist converts the current local-development frontend integration into a production-ready architecture without relying on hardcoded localhost endpoints or browser-only state.

## Implementation Order

### 1. Centralize API configuration
Priority: Highest

Why: The current frontend still hardcodes localhost and uses environment variables inconsistently.

Files to address:
- [src/services/controlPlane.js](src/services/controlPlane.js)
- [src/services/RuntimeService.js](src/services/RuntimeService.js)
- [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts)
- [frontend/frontend/src/services/authApi.ts](frontend/frontend/src/services/authApi.ts)
- [pages/gurukul.html](pages/gurukul.html)
- [pages/samachar.html](pages/samachar.html)
- [pages/samruddhi.html](pages/samruddhi.html)
- [pages/setu.html](pages/setu.html)
- [pages/uniguru.html](pages/uniguru.html)

Actions:
- Replace hardcoded backend URLs with a single runtime configuration source.
- Support both development and production values via environment configuration.
- Ensure the production build never falls back to localhost unless explicitly allowed.
- Make the same configuration available to both legacy and React frontend paths.

Acceptance criteria:
- No frontend module depends on a hardcoded localhost base URL in production.
- The API base URL is configurable per environment.

---

### 2. Move authentication from local-only storage to production-safe session handling
Priority: Highest

Why: The frontend currently stores auth tokens in browser storage, which is not ideal for production session hygiene.

Files to address:
- [frontend/frontend/src/contexts/AuthContext.tsx](frontend/frontend/src/contexts/AuthContext.tsx)
- [frontend/frontend/src/services/authApi.ts](frontend/frontend/src/services/authApi.ts)
- [src/components/Navbar.js](src/components/Navbar.js)

Actions:
- Replace token-only storage with a backend-backed session strategy.
- Prefer secure, httpOnly cookies or a server-managed session flow if the backend supports it.
- Ensure logout, refresh, and session expiry are handled centrally.
- Keep localStorage only as a fallback for non-sensitive UI state, not primary auth state.

Acceptance criteria:
- Authentication state is not solely dependent on browser localStorage.
- Login/logout/session expiry behave predictably in production.

---

### 3. Replace localStorage-only context persistence with backend-backed session state
Priority: High

Why: Conversation history, dock mode, avatar, and replay data are currently persisted in browser storage only.

Files to address:
- [src/services/contextStore.js](src/services/contextStore.js)
- [frontend/frontend/src/App.tsx](frontend/frontend/src/App.tsx)
- [frontend/frontend/src/contexts/LanguageContext.tsx](frontend/frontend/src/contexts/LanguageContext.tsx)

Actions:
- Introduce a server-side session model for chat history and runtime state.
- Pass a stable session identifier from frontend to backend on every request.
- Persist only UI preferences locally if needed, while moving conversation and execution context server-side.
- Ensure state hydration works correctly after page reloads or tab reopen events.

Acceptance criteria:
- A user can resume a session across page reloads without losing backend-backed context.
- Chat history and replay state are restored from the backend session layer.

---

### 4. Replace or remove stubbed backend integrations
Priority: High

Why: Several frontend services currently call endpoints that are not fully implemented by the active backend or return placeholder behavior.

Files to address:
- [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts)
- [frontend/frontend/src/components/dashboard/BHIVDashboard.tsx](frontend/frontend/src/components/dashboard/BHIVDashboard.tsx)
- [frontend/frontend/src/components/dashboard/ReplayVisualization.tsx](frontend/frontend/src/components/dashboard/ReplayVisualization.tsx)
- [frontend/frontend/src/components/dashboard/SystemHealthPanel.tsx](frontend/frontend/src/components/dashboard/SystemHealthPanel.tsx)

Actions:
- Review each stubbed method and either implement the backend contract or disable the feature in production.
- Ensure task, analytics, search, and research flows either have real backend support or clear user-facing fallback behavior.
- Avoid exposing stubbed features as if they were production-ready.

Acceptance criteria:
- No production UI depends on a feature that is merely simulated.
- Unsupported features are disabled or clearly surfaced as unavailable.

---

### 5. Standardize request headers and backend contract usage
Priority: Medium

Why: The current frontend mixes API keys, bearer tokens, and different payload shapes across wrappers.

Files to address:
- [src/services/controlPlane.js](src/services/controlPlane.js)
- [src/services/RuntimeService.js](src/services/RuntimeService.js)
- [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts)
- [frontend/frontend/src/services/authApi.ts](frontend/frontend/src/services/authApi.ts)

Actions:
- Normalize headers around auth, API key, and content type.
- Ensure all assistant calls use the same request contract.
- Consolidate message, task, replay, and health request logic into a single shared wrapper if possible.

Acceptance criteria:
- All frontend API wrappers use a consistent auth and payload contract.
- Backend responses are parsed through the same normalization layer.

---

### 6. Harden production networking and reliability
Priority: Medium

Why: The current calls lack robust timeout, retry, and error handling for production environments.

Files to address:
- [src/services/controlPlane.js](src/services/controlPlane.js)
- [src/services/RuntimeService.js](src/services/RuntimeService.js)
- [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts)

Actions:
- Add request timeout handling and retry policy for transient failures.
- Surface backend outages in a clear UI state rather than generic errors.
- Add health-check and status fallback behaviors for offline or degraded backend conditions.

Acceptance criteria:
- The UI degrades gracefully when the backend is unreachable or slow.
- Network failures are visible and recoverable.

---

### 7. Add deployment validation and environment checks
Priority: Medium

Why: The current setup is tuned for local development and lacks production readiness verification.

Files to address:
- [frontend/frontend/.env.example](frontend/frontend/.env.example)
- [frontend/frontend/README.md](frontend/frontend/README.md)
- [frontend/frontend/INTEGRATION_GUIDE.md](frontend/frontend/INTEGRATION_GUIDE.md)

Actions:
- Validate the production environment configuration before deployment.
- Confirm the correct API host, auth strategy, and feature flags are enabled.
- Run smoke tests against the production backend endpoint.

Acceptance criteria:
- The deployed frontend can reach the production backend successfully.
- The environment configuration is documented and tested.

---

## Suggested Delivery Sequence
1. API URL centralization
2. Authentication/session migration
3. Backend-backed session state
4. Stub removal and feature completion
5. Error handling and reliability hardening
6. Production deployment validation

## Recommended Outcome
The production-ready state should have:
- no localhost dependency in production
- secure session handling
- backend-backed conversation state
- no placeholder or fake API behavior in user-facing flows
- clear degradation and error handling for backend issues
