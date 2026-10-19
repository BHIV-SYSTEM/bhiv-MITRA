# MITRA Universal Companion CODE PACKET

## File Listing & Purpose

### Services & Logic (`src/services/`)
- `eventBus.js`: Lightweight Pub-Sub Event Bus implementation with structured `[MITRA]` console logging.
- `contextStore.js`: Persistent state & conversation history store using `localStorage`. Handles Dock Modes and Replay history.
- `controlPlane.js`: Simulated BHIV Control Plane communication.
- `RuntimeService.js`: High-level runtime orchestration service with Heartbeat health monitoring and Failure simulation.

### Mock Backend (`src/mock/`)
- `capabilityRuntime.js`: Simulated capability execution engine. Records duration and pushes replay items. Includes special handling for `replay` and `health`/`settings`.

### Web Component & Entrypoint (`src/`)
- `mitra-companion.js`: Main `<mitra-companion>` custom element wrapper.

### UI Components (`src/components/`)
- `MITRAButton.js`: Floating action button with pulse animation and status dot.
- `MITRAWindow.js`: Main expandable window container.
- `Header.js`: Title bar with window controls & health panel toggle.
- `Footer.js`: Input bar, send button, and capability launcher trigger.
- `ConversationPanel.js`: Chat surface with history, timestamps, and HTML system message rendering.
- `CapabilityLauncher.js`: Grid of 9 capability cards.
- `DockController.js`: Left, Right, and Floating dock switcher with localStorage persistence.
- `HealthPanel.js`: System metrics & status indicator.
- `ActivityIndicator.js`: Live state feedback indicator.
- `NotificationBadge.js`: Unread count badge on FAB.
- `NotificationCenter.js`: Toast alert system.

### Styles (`styles/`)
- `mitra-companion.css`: Isolated Shadow DOM CSS with glassmorphism aesthetics and mobile responsive rules.

### Host Demo Pages (`pages/`)
- `uniguru.html`
- `samachar.html`
- `gurukul.html`
- `setu.html`
