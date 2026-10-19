# UI Review
## MITRA Universal Companion — Phase 2 Frontend

**Contributor:** Ashwini Wadekar  
**Scope:** Frontend UI — Existing Capabilities and Integration Points  
**Review Date:** 2026-07-31

---

## 1. Scope

This document reviews the frontend UI as it exists after the Phase 2 integration. No UI redesign was performed as part of this contribution. The UI components described below were already present. This document records their state and confirms compatibility with the production API integration.

---

## 2. React Application UI (`frontend/frontend/src/`)

### 2.1 Authentication Views

The application renders a login or signup form when the user is not authenticated. These views are managed by `AuthContext.tsx` and the `Login` and `Signup` components.

- Login form: email and password fields, submit button
- Signup form: name, email, password fields, submit button
- Toggle between login and signup via `onToggleForm` callback
- Loading spinner shown during auth state resolution

No changes were made to these components.

### 2.2 Main Chat Interface

After authentication, the application renders the main chat interface. Layout:

- Left sidebar (`ChatSidebar`): conversation history list, new chat button, delete conversation
- Header: MITRA title, live connection status pulse, language dropdown, user name/email, logout button
- Main content area: message list (`ChatMessage` components), empty state prompt
- Bottom input bar (`MessageInput`): text input, send button

The sidebar is open by default on screens 1024px and wider. On smaller screens it is hidden by default.

No changes were made to any of these components.

### 2.3 Message Display

Each `ConversationMessage` is rendered by `ChatMessage`. The component displays:

- User message bubble
- Assistant response bubble (or loading skeleton while `isLoading` is true)
- Error state if the API call failed
- Timestamp

The greeting message injected at startup uses the same `ConversationMessage` type and renders identically to a regular assistant response.

### 2.4 Connection Status

`ConnectionStatus` component displays a banner when the backend is unreachable. This component was not modified.

### 2.5 Language Dropdown

`LanguageDropdown` allows the user to select a display language. This component was not modified.

---

## 3. Companion Widget UI (`src/`)

The companion widget is a Web Component (`<mitra-companion>`) embedded in static HTML pages. It operates independently of the React application. The following UI capabilities are present as frontend features.

### 3.1 Floating Orb Mode

The companion renders as a circular Floating Action Button (FAB) when minimized. The FAB:

- Is draggable across the viewport using Pointer Events (`pointerdown`, `pointermove`, `pointerup`)
- Applies viewport bounds clamping to prevent dragging off-screen
- Persists its last position to `localStorage` via `contextStore`
- Restores its last position on page load
- Displays a thinking animation (green glow pulse) while the backend is processing

This is a browser-based UI feature. It does not represent a native OS-level runtime.

### 3.2 Minimize

Clicking the minimize button in the companion window header calls `MITRAWindow.minimize()`. This removes the `.expanded` CSS class from the window element, hiding it. After a 300ms delay, the FAB is shown again via `MITRAButton.show()`.

### 3.3 Restore

Clicking the FAB calls `MITRAWindow.expand()`, which adds the `.expanded` CSS class to the window element, making it visible. The FAB is hidden via `MITRAButton.hide()`.

### 3.4 Expand Companion

`MITRAWindow.expand()` transitions the companion from minimized to expanded state using a CSS class toggle. The transition is animated via CSS.

### 3.5 Custom Avatar Support

The companion supports user-supplied avatar assets. The user can:

- Right-click the FAB to trigger the file picker
- Click the avatar button in the companion header to trigger the file picker
- Select a PNG, JPG, GIF, WebP, MP4, or WebM file

The selected file is read via the `FileReader` API and stored as a data URL in `contextStore`. The avatar is rendered in both the FAB and the companion header. It persists across page navigation via `localStorage`.

This is a browser-based UI feature. It does not represent a native OS-level runtime.

### 3.6 Dock Mode

The companion supports three dock modes: floating, dock-left, dock-right. The selected mode is persisted to `localStorage` via `contextStore` and restored on page load.

---

## 4. Screenshot Evidence

| Reference | Filename | Description |
|-----------|----------|-------------|
| Screenshot-01 | `login_page.png` | Login page |
| Screenshot-02 | `dashboard.png` | Main chat dashboard |
| Screenshot-10 | `Floating_Orb.png` | Companion in Floating Orb mode |
| Screenshot-11 | `avtar.png` | Default companion avatar |
| Screenshot-12 | `change_avtar.png` | Custom avatar applied |

Screenshots are located in `DEP/evidence_packet/Screenshots/`.

---

## 5. Compatibility Confirmation

The production API integration does not affect any UI component. The following compatibility points were verified:

- `sendMessage()` public interface: unchanged
- `AssistantResponse` type: unchanged
- `ConversationMessage` type: unchanged
- `ChatMessage` component: unchanged
- `MessageInput` component: unchanged
- `ChatSidebar` component: unchanged
- `ConnectionStatus` component: unchanged
- Login and Signup components: unchanged
- Companion widget components: unchanged
