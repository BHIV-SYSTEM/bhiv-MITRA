# MITRA Companion Floating Chatbot — Integration Handover Guide
**Target Audience:** Engineering & Product Teams across the BHIV Ecosystem (Shakti, Artha, Setu, Samachar, Gurukul, Samruddhi, UniGuru, etc.)  
**Production Backend URL:** `https://mitra.blackholeinfiverse.com`  
**Version:** 5.0.0 (Universal Web Component)

---

## 1. Overview & Architecture

The **MITRA Companion** is a portable, plug-and-play AI companion widget designed to embed seamlessly into any web application or portal across the BHIV ecosystem.

### Key Capabilities
- **Universal Framework Support**: Works natively in Vanilla HTML/JS, React, Next.js, Vue, Angular, or Django/FastAPI templates.
- **Shadow DOM Isolation**: Styles and scripts are fully encapsulated inside an open Shadow DOM (`<mitra-companion>`). It will never clash with host application Tailwind, Bootstrap, or custom CSS.
- **Production Backend Connected**: All conversational intelligence, intent routing, capabilities, and memory are served live from `https://mitra.blackholeinfiverse.com`.
- **Zero-Config Authentication**: Features self-healing authentication. If the host application user is anonymous or has no token, MITRA automatically provisions a guest JWT session from `/api/auth/guest`.
- **Dual Launcher Modes**:
  1. **Floating Mode (Default)**: Renders a floating cosmic companion orb in the bottom-right corner.
  2. **Headless / TopBar Mode (`hide-fab="true"`)**: Hides the floating orb so the chatbot window can be launched directly from a custom navbar or search bar button.

---

## 2. Quick Integration (Vanilla HTML / Static Pages)

Add these three lines to your page `<body>` or `<head>`:

```html
<!-- 1. Define Companion Element (Connected to Production Backend) -->
<mitra-companion 
  api-base-url="https://mitra.blackholeinfiverse.com"
  host-app="shakti"
  stylesheet-path="https://mitra.blackholeinfiverse.com/styles/mitra-companion.css">
</mitra-companion>

<!-- 2. Import Companion Web Component Module -->
<script type="module" src="https://mitra.blackholeinfiverse.com/src/mitra-companion.js"></script>
```

*That is all.* The floating companion orb will immediately appear in the bottom-right corner, ready to converse.

---

## 3. React / Next.js Integration (Custom TopBar / Search Bar Button)

If your application (like Shakti or Raj's dashboard) already has a top navigation bar and wants to launch the chatbot from a header avatar or icon:

### Step 1: Add `<mitra-companion>` to `public/index.html`

```html
<!-- Inside public/index.html body -->
<mitra-companion 
  hide-fab="true" 
  api-base-url="https://mitra.blackholeinfiverse.com"
  host-app="shakti"
  stylesheet-path="/styles/mitra-companion.css">
</mitra-companion>

<script type="module" src="/src/mitra-companion.js"></script>
```

### Step 2: Trigger Chatbot from Any React Button or Component

Call `window.__MITRA_TOGGLE_ORB__()` directly on your button's `onClick`:

```tsx
import React, { useState, useEffect } from 'react';

export const ShaktiMitraTrigger: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Listen for state changes (e.g. user closes window with minimize button)
    const handleState = (e: any) => {
      setIsOpen(e.detail?.expanded || false);
    };
    window.addEventListener('mitra:orb-state-changed', handleState);
    return () => window.removeEventListener('mitra:orb-state-changed', handleState);
  }, []);

  const handleToggle = () => {
    if (typeof (window as any).__MITRA_TOGGLE_ORB__ === 'function') {
      (window as any).__MITRA_TOGGLE_ORB__();
    } else {
      window.dispatchEvent(new CustomEvent('mitra:toggle-orb'));
    }
  };

  return (
    <button 
      id="shakti-mitra-trigger-btn"
      onClick={handleToggle}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-white transition-all"
    >
      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
      <span>Ask Mitra</span>
    </button>
  );
};
```

---

## 4. Component Attributes Reference

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `api-base-url` | string | `https://mitra.blackholeinfiverse.com` | Base URL of the backend API. |
| `host-app` | string | `'dashboard'` | Identifier of the host application (e.g., `'shakti'`, `'artha'`, `'uniguru'`). Passes context to AI. |
| `user-id` | string | *auto-generated* | Optional host user ID. If provided, MITRA links conversation memory to this user. |
| `hide-fab` | `"true" \| "false"` | `"false"` | When set to `"true"`, suppresses the bottom-right floating button. |
| `stylesheet-path` | string | `'styles/mitra-companion.css'` | Custom path to companion CSS file. |

---

## 5. Global Window JavaScript APIs

Every host application has access to these browser global helpers:

### 1. Toggle Chatbot Window
```javascript
window.__MITRA_TOGGLE_ORB__();
```
*Toggles the chatbot window between expanded and minimized.*

### 2. Explicit Minimize
```javascript
window.__MITRA_MINIMIZE__();
```
*Minimizes the chatbot window.*

### 3. State Change Listener
```javascript
window.addEventListener('mitra:orb-state-changed', (event) => {
  const { expanded } = event.detail;
  console.log('MITRA is now:', expanded ? 'OPEN' : 'MINIMIZED');
});
```

### 4. Avatar Change Listener
```javascript
window.addEventListener('mitra:avatar-changed', (event) => {
  const { avatar } = event.detail;
  console.log('Active avatar changed:', avatar);
});
```

---

## 6. Production Backend API Specification

Host applications communicating directly with the backend can use these endpoints:

### Endpoint: Primary Chatbot Conversation
- **URL:** `POST https://mitra.blackholeinfiverse.com/api/companion/chat`
- **Headers:**
  ```http
  Content-Type: application/json
  X-API-Key: bhiv-enterprise-key
  Authorization: Bearer <JWT_ACCESS_TOKEN>
  ```
- **Request Body:**
  ```json
  {
    "message": "Summarize today's priority tasks",
    "platform": "web",
    "device": "browser",
    "page_context": {
      "host_app": "shakti",
      "current_page": "dashboard"
    }
  }
  ```
- **Response (`HTTP 200 OK`):**
  ```json
  {
    "message": "Here is your summary...",
    "intent": "general",
    "capability_result": null,
    "suggested_actions": []
  }
  ```

### Endpoint: Anonymous Guest Token Generation
If the user is not logged in with a full account:
- **URL:** `POST https://mitra.blackholeinfiverse.com/api/auth/guest`
- **Headers:**
  ```http
  Content-Type: application/json
  X-API-Key: bhiv-enterprise-key
  ```
- **Body:** `{}`
- **Response (`HTTP 200 OK`):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "usr_guest_...",
      "name": "Guest User",
      "is_guest": true
    }
  }
  ```

---

## 7. Header Controls & Window Minimization Standard

To maintain a unified, uncluttered user experience across all portals:
- The chatbot window header contains a single **Minimize** (`_`) button with ID `#btn-minimize`.
- The close (`✕`) button has been intentionally deprecated and removed from the header to prevent user confusion between minimizing vs. destroying session state.
- Clicking `#btn-minimize` transitions `.mitra-window` to `display: none` and `opacity: 0`, and resets the companion custom element host to `pointer-events: none` so underlying page content is completely unblocked.
- Clicking the host trigger button (or calling `window.__MITRA_TOGGLE_ORB__()`) immediately expands the window and restores focus to the input box.

---

## 8. Ready-To-Use Prompts for Developers & AI Assistants

Copy and paste these exact prompts into Antigravity, Claude, ChatGPT, or Cursor to immediately implement or test the MITRA companion chatbot without manual setup.

### Prompt A: Quick Floating Orb Integration (Bottom-Right Mode)
```markdown
Integrate the MITRA AI Companion floating orb into this project.
Requirements:
1. Add <mitra-companion api-base-url="https://mitra.blackholeinfiverse.com" stylesheet-path="/styles/mitra-companion.css"></mitra-companion> and <script type="module" src="/src/mitra-companion.js"></script> to index.html.
2. Ensure the bottom-right floating orb launcher renders cleanly with z-index 999999.
3. Ensure clicking the orb expands the MITRA chatbot window, and clicking the header minimize button (_) collapses it cleanly.
4. Verify guest authentication works automatically by querying "Hello Mitra" without requiring prior manual login.
```

### Prompt B: TopBar / Navbar Trigger Integration (Headless Mode)
```markdown
Integrate the MITRA AI Companion into our top navigation bar next to Search, with NO floating orb at the bottom-right.
Requirements:
1. In index.html, mount <mitra-companion hide-fab="true" api-base-url="https://mitra.blackholeinfiverse.com" stylesheet-path="/styles/mitra-companion.css"></mitra-companion> with stylesheet and script tags.
2. In the TopBar component next to the Search input, add a companion avatar trigger button.
3. On trigger button onClick, call window.__MITRA_TOGGLE_ORB__() or dispatch custom event "mitra:toggle-orb".
4. Ensure the chatbot header has only the minimize button (_) and that minimizing sets pointer-events: none on the custom element so underlying page clicks are never blocked.
```

### Prompt C: End-to-End Verification & QA Test
```markdown
Test and verify the MITRA AI Companion chatbot on http://localhost:8080/ (or our local dev server):
1. Check that NO floating launcher button is visible in the bottom-right corner when hide-fab="true" is set.
2. Click the TopBar companion avatar button and verify that .mitra-window expands smoothly to 400x650px.
3. In the chatbot header, confirm only the minimize button (#btn-minimize) is present, and click it to ensure the window minimizes cleanly without errors.
4. Re-open the chatbot, send a test question "What is the status of my tasks?", and verify that the message auto-scrolls smoothly to the bottom and receives a live response from https://mitra.blackholeinfiverse.com.
```

### Prompt D: Troubleshooting Infinite Event Loops & Shadow DOM Clicks
```markdown
Audit and fix any issues with the MITRA companion integration in this repo:
1. Check event listeners on "mitra:avatar-changed" and "mitra:orb-state-changed" to ensure no recursive state dispatching freezes the main thread.
2. Verify that pointer-events on <mitra-companion> is set to "none" when minimized, and "auto" only on interactive elements (.mitra-window, #mitra-fab) when open.
3. Verify that the chatbot chat container (.mitra-chat) has min-height: 0 !important; and overflow-y: auto !important; with sleek custom dark scrollbar styles.
```

---

## 9. Verification Checklist for Partner Teams

1. **Mount Verification**: Inspect DOM; confirm `<mitra-companion>` is present.
2. **Network Request Check**: Type `"Hello Mitra"` in the companion input. Verify in Network tab that `POST https://mitra.blackholeinfiverse.com/api/companion/chat` returns `HTTP 200`.
3. **Trigger Verification**: If `hide-fab="true"` is set, ensure your custom button calls `window.__MITRA_TOGGLE_ORB__()` and the window animates open.
4. **Header Check**: Confirm only `#btn-minimize` is visible in the header controls and that clicking it cleanly collapses the window.
5. **CORS Check**: Ensure your domain is allowed by the MITRA backend (all `*.blackholeinfiverse.com` and `localhost` domains are pre-authorized).
