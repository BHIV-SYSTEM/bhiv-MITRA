# Phase 2 Architecture Update — Universal Ecosystem Convergence

## Core Architecture Principles

1. **Native Web Component Runtime**: `<mitra-companion>` encapsulated via Shadow DOM for zero-style collision with host application pages.
2. **Deterministic Context Restoration**: `contextStore.js` manages single-source-of-truth state (`dockMode`, `position`, `avatar`, `history`).
3. **Pointer Event Drag Architecture**: Drag-and-drop operations utilize unified Pointer Events (`pointerdown`, `pointermove`, `pointerup`) with coordinate bounds clamping (`safeLeft`, `safeTop`).
4. **Canonical Control Plane Connection**: `RuntimeService.js` maintains a heartbeat connection with `http://localhost:8000/health`.
5. **Reusable Design System**: `DesignSystemCards.js` defines 10 executive card primitives ready for deployment across BHIV products.
