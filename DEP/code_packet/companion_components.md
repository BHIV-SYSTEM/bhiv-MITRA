# Companion Components — Canonical MITRA Design System

## Overview

All MITRA UI is composed of exactly these components. No product-specific forks exist. Every product embeds the same package.

---

## 1. Hover Companion (`MITRAButton.js`)

**Purpose:** Floating Action Button — the always-visible entry point to MITRA.

**Features:**
- Circular button with MITRA icon
- Pulse animation ring (CSS `@keyframes pulse`)
- Thinking state: green glow ring pulses when backend is processing
- `NotificationBadge` overlaid showing unread count
- Hides when companion window opens; re-appears on minimize (300ms delay)

**Events consumed:** `runtime.thinking`, `runtime.idle`, `capability.finished`, `chat.opened`

---

## 2. Chat Panel / Conversation Panel (`ConversationPanel.js`)

**Purpose:** Displays the conversation between the user and MITRA.

**Features:**
- Loads full conversation history from `contextStore` on mount
- New MITRA responses appended via `notification.received` event
- Delegates bubble rendering to `MessageRenderer`
- Auto-scrolls to bottom on new message
- Persists new MITRA messages correctly via `contextStore.addMessage('mitra', message)`

---

## 3. Message Renderer (`MessageRenderer.js`) ← NEW

**Purpose:** Canonical factory for individual message bubbles.

**Features:**
- `MessageRenderer.render(role, text, date)` — returns a fully styled `HTMLDivElement`
- Role-aware: `'user'` bubbles have HTML-escaped content (XSS prevention); `'mitra'` bubbles allow safe backend HTML (bold, lists)
- `'system'` messages rendered with reduced opacity
- Single source of truth for bubble markup — no inline `innerHTML` duplication

---

## 4. Execution Status Panel (`ExecutionStatusPanel.js`) ← NEW

**Purpose:** Unified panel showing live execution state + runtime health.

**All 7 required states:**

| State             | Event Trigger          | Dot Class  |
|-------------------|------------------------|------------|
| Thinking          | `runtime.thinking`     | `thinking` |
| Executing         | `runtime.executing`    | `running`  |
| Capability Running| `capability.started`   | `running`  |
| Waiting           | `runtime.waiting`      | `thinking` |
| Completed         | `capability.completed` | `completed`|
| Failed            | `capability.failed`    | `failed`   |
| Retrying          | `capability.retrying`  | `running`  |

Also displays: Status, Latency, Last Sync, and a scrolling log of the last 5 events.

---

## 5. Notification Component (`NotificationCenter.js` + `NotificationBadge.js`)

**Purpose:** Toast notifications (pop-up) and FAB badge (counter).

**NotificationCenter:** Renders toast messages at top-center of companion window. 4-second auto-dismiss with slide animation.

**NotificationBadge:** Red counter badge on FAB. Clears to zero when user opens companion.

---

## 6. Companion Header (`Header.js`)

**Purpose:** Top bar of the companion window.

**Features:**
- MITRA name + live status dot (green = connected)
- Minimize button → triggers `onMinimize` callback
- Dock button → toggles `DockController` (float / left / right)
- `DockController` element injected from `MITRAWindow`

---

## 7. Companion Window / Shell (`MITRAWindow.js`)

**Purpose:** The main container that assembles all sub-components.

**Layout (top to bottom):**
1. `Header`
2. `HealthPanel` (toggleable)
3. Content area:
   - `ConversationPanel`
   - `CapabilityLauncher` (overlay)
4. `ActivityIndicator`
5. `Footer` (input + capability button)

**States:** `minimized` (opacity 0, visibility hidden) → `expanded` (CSS transition)
