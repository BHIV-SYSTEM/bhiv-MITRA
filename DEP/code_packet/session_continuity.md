# Session Continuity — MITRA Cross-Product Architecture

## Current Implementation (Same-Origin)

### Storage Key
```
localStorage key: 'mitra_context_store'
```

### State Shape
```json
{
  "sessionId": "mitra-session-1722230400000-abc123",
  "history": [
    { "role": "mitra", "text": "Hello. I am MITRA...", "timestamp": "2026-07-29T06:30:00.000Z" },
    { "role": "user",  "text": "What can you do?",    "timestamp": "2026-07-29T06:30:15.000Z" },
    { "role": "mitra", "text": "I can help you...",   "timestamp": "2026-07-29T06:30:16.000Z" }
  ],
  "dockMode": "floating",
  "replays": []
}
```

### How It Works

1. **First visit** — `ContextStore` generates a unique `sessionId` and stores it in `localStorage`.
2. **Same-origin navigation** — Gurukul, Samruddhi, SETU served from same origin share `localStorage`. `ConversationPanel` loads the history array on mount and replays all messages in order.
3. **Backend session binding** — Every API request includes `session_id` in the request body so the backend can join conversation to the same session record.
4. **Dock persistence** — The `dockMode` (floating / docked-left / docked-right) is also persisted, so MITRA remembers the user's preferred position across navigation.

### Session Lifecycle

```
Page Load
  └─ ContextStore.loadState() reads localStorage
        └─ If sessionId exists → reuse
        └─ If not → generate new sessionId, save

User sends message
  └─ ContextStore.addMessage('user', text) → saved to localStorage
  └─ controlPlane.sendMessage(text) → POST /api/assistant { session_id }
  └─ Response received → ContextStore.addMessage('mitra', response)

User navigates to next page
  └─ New page loads → ContextStore.loadState() reads same localStorage
  └─ Same sessionId → backend treats as same session
  └─ Same history → ConversationPanel replays all previous messages
  └─ Companion resumes exactly where it left off
```

---

## Cross-Origin Limitation & Resolution Path

`localStorage` is origin-bound. When products are deployed on **separate domains** (e.g., `gurukul.bhiv.com` vs `setu.bhiv.com`), they cannot share `localStorage`.

**Frontend is ready.** To enable true cross-origin continuity, Raj needs to provide:

1. A session-restore endpoint:
   ```
   GET /api/session/{session_id}/history
   Response: { history: [...], dockMode: "floating" }
   ```

2. A session-sync endpoint (optional, for real-time multi-tab sync):
   ```
   POST /api/session/{session_id}/sync
   Body: { history: [...] }
   ```

Once available, `ContextStore.syncFromBackend(sessionId)` can be implemented and called from `RuntimeService.connectAll()` — one addition, no rewrites.

---

## No New Conversation

Per the task requirement: *"No new conversation unless the user explicitly starts one."*

- If `contextStore.getHistory()` returns messages, they are shown. No new greeting is sent.
- A new greeting is only shown if history is empty (first visit or cleared session).
- This is implemented in `ConversationPanel.js` lines 10–17.
