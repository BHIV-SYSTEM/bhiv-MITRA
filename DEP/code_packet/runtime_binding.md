# Runtime Binding — MITRA Event & Service Architecture

## Service Layer

```
Browser Tab
│
├── src/mitra-companion.js          (Web Component entry point)
│   │
│   ├── RuntimeService              (connection lifecycle + message dispatch)
│   │   ├── connectAll()            → GET /health (verifies backend)
│   │   ├── startHeartbeat()        → GET /health every 5 seconds
│   │   ├── sendMessage(text)       → delegates to controlPlane.sendMessage()
│   │   └── sendCapabilityRequest() → delegates to controlPlane.sendCapability()
│   │
│   ├── ControlPlane                (API transport layer)
│   │   ├── sendMessage()           → POST /api/assistant
│   │   │   payload: { version, input: {message}, context: {session_id, platform, device} }
│   │   └── sendCapability()        → POST /api/mitra/evaluate
│   │       payload: { input: {message}, context: {session_id} }
│   │
│   ├── ContextStore                (localStorage persistence)
│   │   ├── storageKey: 'mitra_context_store'
│   │   ├── state: { history[], sessionId, dockMode, replays[] }
│   │   ├── getHistory()            → returns all messages
│   │   ├── addMessage(role, text)  → appends + saves to localStorage
│   │   ├── getSessionId()          → returns persisted session ID
│   │   └── setDockMode(mode)       → persists dock position
│   │
│   └── EventBus                    (decoupled pub/sub)
```

## Event Map

| Event                   | Emitted By              | Consumed By                                      |
|-------------------------|-------------------------|--------------------------------------------------|
| `runtime.connected`     | RuntimeService          | EventBus log                                     |
| `runtime.thinking`      | RuntimeService          | MITRAButton (glow), ActivityIndicator, ExecutionStatusPanel |
| `runtime.idle`          | RuntimeService          | MITRAButton (stop glow), ActivityIndicator, ExecutionStatusPanel |
| `runtime.executing`     | (future: TANTRA stream) | ExecutionStatusPanel                             |
| `runtime.waiting`       | (future: TANTRA stream) | ExecutionStatusPanel                             |
| `health.changed`        | RuntimeService          | HealthPanel, ExecutionStatusPanel                |
| `capability.started`    | RuntimeService          | ActivityIndicator, ExecutionStatusPanel, EventBus log |
| `capability.completed`  | RuntimeService          | ActivityIndicator, NotificationCenter, ExecutionStatusPanel, NotificationBadge |
| `capability.failed`     | RuntimeService          | ActivityIndicator, NotificationCenter, ExecutionStatusPanel, NotificationBadge |
| `capability.retrying`   | RuntimeService          | ActivityIndicator, ExecutionStatusPanel, EventBus log |
| `capability.finished`   | RuntimeService          | MITRAButton, ConversationPanel (system msg)      |
| `notification.received` | ControlPlane            | ConversationPanel (adds bubble), NotificationCenter, NotificationBadge |
| `context.saved`         | ContextStore            | EventBus log                                     |
| `replay.generated`      | ContextStore            | EventBus log                                     |
| `chat.opened`           | MITRAButton             | NotificationBadge (clears count)                 |

## Request Headers

Every API request includes:
```
Content-Type: application/json
X-API-Key: bhiv-enterprise-key
```

And every request body includes:
```json
{
  "context": {
    "session_id": "<persisted-from-localStorage>",
    "platform": "web",
    "device": "desktop"
  }
}
```
