# Backend Architecture Analysis Report

Status: Documentation only. No backend code was modified.

## 1. Backend framework and runtime

- Framework: FastAPI
- Runtime entrypoint: [backend/app/main.py](backend/app/main.py)
- Main characteristics:
  - ASGI app with CORS middleware and API-key/auth middleware
  - Router-based architecture with dedicated API modules under [backend/app/api](backend/app/api)
  - Central orchestration pipeline in [backend/app/core/assistant_orchestrator.py](backend/app/core/assistant_orchestrator.py)
  - Control-plane enforcement and execution path via [backend/app/services/mitra_control_plane_service.py](backend/app/services/mitra_control_plane_service.py) and [backend/app/services/execution_service.py](backend/app/services/execution_service.py)

## 2. Backend folder structure

- [backend/app](backend/app)
  - [backend/app/api](backend/app/api) — public API routers for assistant, auth, ecosystem, replay, metrics, webhooks, TTS
  - [backend/app/core](backend/app/core) — orchestration, security, logging, response generation, policy integration
  - [backend/app/services](backend/app/services) — auth, bucket persistence, control plane, execution, ecosystem integration, reminders, TTS, etc.
  - [backend/app/inbound](backend/app/inbound) — inbound webhook processing and gateway normalization
  - [backend/app/executors](backend/app/executors) — platform-specific executors for WhatsApp, Email, Telegram, Calendar, Reminder, EMS, Device Gateway
  - [backend/app/memory](backend/app/memory) — lightweight JSON-based memory store
  - [backend/app/tantra](backend/app/tantra) — TANTRA runtime, governance, registry, and API
  - [backend/app/ecosystem](backend/app/ecosystem) — BHIV ecosystem adapters and registry
  - [backend/app/routers](backend/app/routers) — older/legacy router modules that are not currently mounted in the main app

## 3. Active backend API endpoint inventory

The following routes are currently active through the main FastAPI app in [backend/app/main.py](backend/app/main.py).

| Route | Method | Request body | Response format | Auth requirement | Implemented in |
|---|---|---|---|---|---|
| / | GET | None | JSON status object | None | [backend/app/main.py](backend/app/main.py) |
| /health | GET | None | JSON health info | None | [backend/app/main.py](backend/app/main.py) |
| /health/system | GET | None | JSON system health snapshot | None | [backend/app/main.py](backend/app/main.py) |
| /external_llm | POST | { prompt, model } | JSON { response } | None | [backend/app/main.py](backend/app/main.py) |
| /api/auth/signup | POST | { name, email, password } | JSON { token, user } | Public | [backend/app/api/auth.py](backend/app/api/auth.py) |
| /api/auth/login | POST | { email, password } | JSON { token, user } | Public | [backend/app/api/auth.py](backend/app/api/auth.py) |
| /api/auth/me | GET | None | JSON { user } | Bearer token | [backend/app/api/auth.py](backend/app/api/auth.py) |
| /api/auth/logout | POST | None | JSON { message } | None / optional | [backend/app/api/auth.py](backend/app/api/auth.py) |
| /api/assistant | OPTIONS | None | CORS preflight response | None | [backend/app/api/assistant.py](backend/app/api/assistant.py) |
| /api/assistant | POST | { version, input, context } | JSON success/error envelope with result | X-API-Key required by middleware | [backend/app/api/assistant.py](backend/app/api/assistant.py) |
| /api/mitra/evaluate | POST | { event, user_id, context } | JSON response contract or error | X-API-Key required | [backend/app/api/mitra_api.py](backend/app/api/mitra_api.py) |
| /api/ecosystem/products | GET | None | JSON list of products and adapters | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/manifests | GET | None | JSON manifests | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/health | GET | None | JSON health per integration | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/query | POST | { product, action, payload } | Adapter result | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/execute | POST | { product, action, payload, user_id, session_id } | Adapter result | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/snapshot | GET | None | Registry snapshot | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/runtime-proof | POST | { product, action, payload, user_id, session_id } | Runtime proof object | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/query-proof | POST | { product, action, payload } | Query proof object | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/runtime-proofs | GET | None | List of runtime proofs | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/execution-proofs | GET | None | List of execution proofs | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/integration-summary | GET | None | Integration summary | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/demonstrate | POST | None | Demo result | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/ecosystem/verify-proof/{trace_id} | GET | None | Verification result | X-API-Key required | [backend/app/api/ecosystem.py](backend/app/api/ecosystem.py) |
| /api/metrics | GET | None | JSON metrics | None | [backend/app/api/metrics.py](backend/app/api/metrics.py) |
| /api/metrics/system | GET | None | JSON service metrics | None | [backend/app/api/metrics.py](backend/app/api/metrics.py) |
| /api/metrics/enforcement | GET | None | JSON enforcement metrics | None | [backend/app/api/metrics.py](backend/app/api/metrics.py) |
| /api/metrics/reset | POST | None | JSON reset confirmation | None | [backend/app/api/metrics.py](backend/app/api/metrics.py) |
| /api/replay/{trace_id} | POST | { modifications } | Replay result | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/{trace_id}/stages | GET | None | List of replay stages | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/compare | POST | { trace_id } | Comparison result | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/{trace_id}/dr-proof | POST | { modifications } | Disaster-recovery proof | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/dr-proofs | GET | None | DR proofs list | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/dr-proof/{trace_id} | GET | None | DR proof by trace | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/verify-dr-proof/{trace_id} | POST | None | Verification result | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/replay/dr-summary | GET | None | DR summary | X-API-Key required | [backend/app/api/replay.py](backend/app/api/replay.py) |
| /api/tts | POST | { text, language } | JSON { status, audio_base64, ... } | X-API-Key required | [backend/app/api/tts.py](backend/app/api/tts.py) |
| /api/tts/status | GET | None | JSON TTS status | None | [backend/app/api/tts.py](backend/app/api/tts.py) |
| /api/tantra/status | GET | None | JSON runtime status | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/execution/{trace_id} | GET | None | Execution record | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/governance | GET | None | Governance health report | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/registry | GET | None | Registry snapshot | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/registry/health | GET | None | Registry health | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/executions | GET | None | List of executions | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /api/tantra/cancel/{trace_id} | POST | Query param reason | JSON cancellation result | None | [backend/app/tantra/api.py](backend/app/tantra/api.py) |
| /webhooks/whatsapp and /webhook/whatsapp | POST | Webhook payload | JSON ack / processed result | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhooks/whatsapp and /webhook/whatsapp | GET | Query params | Verification challenge response | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhooks/email and /webhook/email | POST | Webhook payload | JSON ack / processed result | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhooks/call /webhooks/telephony /webhook/telephony | POST | Call payload | JSON processed result | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhooks/telegram and /webhook/telegram | POST | Webhook payload | JSON ack / processed result | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhook/telegram | GET | None | JSON status | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /telegram/contacts | GET | None | Contact list | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhooks/instagram and /webhook/instagram | POST | Webhook payload | JSON processed result | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhook/instagram | GET | Query params | Verification challenge response | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |
| /webhook/health | GET | None | JSON webhook health status | None | [backend/app/api/webhooks.py](backend/app/api/webhooks.py) |

## 4. Services responsible for each major domain

### Authentication
- Primary implementation: [backend/app/services/auth_service.py](backend/app/services/auth_service.py)
- JWT and API-key handling: [backend/app/core/security.py](backend/app/core/security.py)
- API layer: [backend/app/api/auth.py](backend/app/api/auth.py)

### Session management
- There is no dedicated server-side session service yet.
- Session identity is carried through the request context via session_id and user_context.
- The main runtime uses this in [backend/app/core/assistant_orchestrator.py](backend/app/core/assistant_orchestrator.py) and [backend/app/services/mitra_control_plane_service.py](backend/app/services/mitra_control_plane_service.py).
- Current frontend session persistence is client-side via localStorage in [src/services/contextStore.js](src/services/contextStore.js).

### Chat
- Core chat orchestration: [backend/app/core/assistant_orchestrator.py](backend/app/core/assistant_orchestrator.py)
- Response generation fallback: [backend/app/core/respond_service.py](backend/app/core/respond_service.py)
- LLM bridge: [backend/app/core/llm_bridge.py](backend/app/core/llm_bridge.py)

### Companion runtime
- The backend currently exposes the assistant runtime through the single endpoint /api/assistant.
- The actual companion UI runtime exists on the frontend in [src/services/RuntimeService.js](src/services/RuntimeService.js) and [src/services/controlPlane.js](src/services/controlPlane.js).
- Backend-side runtime behavior is implemented in the orchestrator and control-plane service.

### Context storage
- Runtime context is request-scoped and ephemeral.
- The backend does not expose a first-class persisted context or session store.
- Frontend context storage is client-side in [src/services/contextStore.js](src/services/contextStore.js).

### Memory
- Primary memory implementation: [backend/app/memory/memory_manager.py](backend/app/memory/memory_manager.py)
- Storage is JSON-file based and not yet a durable multi-user backend service.

### Control Plane
- Primary implementation: [backend/app/services/mitra_control_plane_service.py](backend/app/services/mitra_control_plane_service.py)
- It evaluates safety, policy, RL interpretation, and response contracts.

### TANTRA integration
- Runtime: [backend/app/tantra/runtime.py](backend/app/tantra/runtime.py)
- API: [backend/app/tantra/api.py](backend/app/tantra/api.py)
- The assistant orchestrator routes execution through TANTRA for workflow-capable actions.

### Capability execution
- Central execution gateway: [backend/app/services/execution_service.py](backend/app/services/execution_service.py)
- Platform executors live under [backend/app/executors](backend/app/executors)
- Inbound message processing and routing happens through [backend/app/inbound/inbound_gateway.py](backend/app/inbound/inbound_gateway.py)

## 5. How the frontend currently communicates with the backend

### Primary frontend integration path
- The main frontend companion uses [src/services/controlPlane.js](src/services/controlPlane.js) and [src/services/RuntimeService.js](src/services/RuntimeService.js).
- These use fetch calls to https://mitra-backend-q1f3.onrender.com and send requests to:
  - /api/assistant
  - /api/mitra/evaluate
  - /health
  - /health/system
  - /api/metrics/system
  - /api/replay/{trace_id}

### React frontend integration path
- The newer React interface uses [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts) and [frontend/frontend/src/services/authApi.ts](frontend/frontend/src/services/authApi.ts).
- It calls the backend over REACT_APP_API_URL and includes:
  - X-API-Key header
  - Authorization: Bearer <token> for authenticated requests

### Important observation
- The frontend is currently coupled to a local development backend URL in several places.
- The backend CORS policy is configured to allow development origins and known production hosts, but there is no robust production session bridge yet.

## 6. Mock APIs and placeholder implementations

The following pieces are mock, placeholder, or fallback implementations rather than fully production-ready integrations.

1. Voice STT endpoint
- File: [backend/app/routers/voice_stt.py](backend/app/routers/voice_stt.py)
- Behavior: Returns a placeholder transcription string and is not a real speech-to-text engine.

2. Telephony webhook stub
- File: [backend/app/api/webhooks.py](backend/app/api/webhooks.py)
- Behavior: The telephony endpoint accepts payloads but is explicitly described as a stub.

3. LLM fallback behavior
- File: [backend/app/core/llm_bridge.py](backend/app/core/llm_bridge.py)
- Behavior: If providers are unavailable or fail, the bridge falls back to mock-style responses such as [uniguru mock].

4. Auth service fallback mode
- File: [backend/app/services/auth_service.py](backend/app/services/auth_service.py)
- Behavior: In development or non-production fallback scenarios it can use in-memory users instead of a real persistent store.

5. Frontend task-related APIs that are not implemented on the backend
- Files: [frontend/frontend/src/services/api.ts](frontend/frontend/src/services/api.ts)
- Behavior: The frontend calls /api/tasks, /api/system/info, and /api/system/stats, but those routes are not currently exposed by the active FastAPI backend.

## 7. Do production backend endpoints already exist?

Yes, but with important caveats.

### Existing production-ready backend endpoints
- Authentication and user identity: /api/auth/signup, /api/auth/login, /api/auth/me
- Main assistant endpoint: /api/assistant
- Control-plane evaluation: /api/mitra/evaluate
- Ecosystem integration: /api/ecosystem/*
- Metrics and replay: /api/metrics/*, /api/replay/*
- TTS: /api/tts
- TANTRA: /api/tantra/*
- Health checks: /health, /health/system

### What is not yet fully implemented for your target task
- Persistent server-side companion state
- Universal session across pages and browser refreshes
- A durable backend session/companion state store
- Real API communication for all companion flows without placeholder or fallback behavior

## 8. Required changes for the requested task

Your requested scope is:
- Persistent floating companion
- Universal session across pages
- Production backend integration
- Real API communication instead of mocks

### Required architectural changes

1. Introduce a real backend session service
- The current backend only sends session_id through the request payload.
- A proper server-side session store is needed to persist conversation state, companion position, and user context across page navigations.

2. Add backend endpoints for companion state
- Example endpoints:
  - POST /api/companion/session
  - GET /api/companion/session/{session_id}
  - PUT /api/companion/session/{session_id}
  - DELETE /api/companion/session/{session_id}
- These endpoints would store and retrieve the floating companion state, conversation history, and page-scoped context.

3. Replace local-only state with backend-backed state sync
- The frontend currently stores companion position and conversations via localStorage in [src/services/contextStore.js](src/services/contextStore.js).
- That should be supplemented or replaced by server-backed session state.

4. Unify session identity across the full navigation surface
- The same user/session should be maintained across all pages.
- That means using an authenticated session identifier and persisting it in the browser securely and consistently.

5. Remove or harden mock endpoints
- Voice STT should be replaced with a real provider if required.
- LLM fallback should be configured to fail closed or use a configured provider instead of mock-style responses.
- Telephony webhook handling should be completed or explicitly disabled for production.

6. Ensure production backend integration
- Replace hardcoded localhost URLs in [src/services/controlPlane.js](src/services/controlPlane.js) and [src/services/RuntimeService.js](src/services/RuntimeService.js) with environment-based API configuration.
- Keep CORS and auth expectations aligned with the deployed frontend.

## 9. Dependency diagram for request flow

```mermaid
flowchart TD
    A[Frontend Page / Companion UI] --> B[API Service Layer]
    B --> C[/api/assistant]
    B --> D[/api/auth/*]
    B --> E[/api/mitra/evaluate]
    B --> F[/api/ecosystem/*]
    B --> G[/api/tts]
    B --> H[/webhooks/*]

    C --> I[Assistant Orchestrator]
    I --> J[MITRA Control Plane]
    I --> K[Multilingual Service]
    I --> L[TANTRA Runtime]
    I --> M[Execution Service]
    I --> N[Bucket Service]

    J --> O[Policy Engine]
    J --> P[Enforcement Service]
    J --> N

    L --> M
    M --> Q[Platform Executors]
    M --> N

    N --> R[Mongo / persistent storage fallback]

    D --> S[Auth Service]
    S --> T[JWT / API-Key Security]
```

## 10. Backend files that will need modification for the assigned task

### Existing files to modify
- [backend/app/main.py](backend/app/main.py) — register new session/companion routes and any middleware changes.
- [backend/app/api/assistant.py](backend/app/api/assistant.py) — extend the assistant contract to support persisted companion sessions and backend stateful context.
- [backend/app/core/assistant_orchestrator.py](backend/app/core/assistant_orchestrator.py) — thread session state through the orchestration pipeline.
- [backend/app/services/mitra_control_plane_service.py](backend/app/services/mitra_control_plane_service.py) — make control-plane decisions session-aware and stateful.
- [backend/app/core/security.py](backend/app/core/security.py) — align production auth/session behavior with the new companion integration.
- [backend/app/services/auth_service.py](backend/app/services/auth_service.py) — support stronger session/user ownership if needed.
- [backend/app/core/database.py](backend/app/core/database.py) — add persistent storage for companion/session records if not using a new storage layer.
- [backend/app/services/bucket_service.py](backend/app/services/bucket_service.py) — optionally persist stateful session artifacts and traces.
- [backend/app/memory/memory_manager.py](backend/app/memory/memory_manager.py) — replace or extend the current JSON memory store for durable companion memory.
- [backend/app/api/webhooks.py](backend/app/api/webhooks.py) — ensure inbound events can attach to the correct persisted session.

### New files to create
- [backend/app/api/session.py](backend/app/api/session.py) — companion/session API endpoints
- [backend/app/services/session_service.py](backend/app/services/session_service.py) — server-side session persistence and state management
- [backend/app/services/companion_state_service.py](backend/app/services/companion_state_service.py) — floating companion state model and sync logic

## 11. Bottom line

The backend already has a real FastAPI foundation with an active assistant endpoint and a mature control-plane/execution pipeline. The missing pieces for your task are not basic API plumbing; they are stateful session infrastructure, durable companion persistence, and production-grade integration between the frontend companion and the backend services. The current implementation is strong for one-shot assistant calls, but it is not yet a fully persistent, cross-page, production companion runtime.
