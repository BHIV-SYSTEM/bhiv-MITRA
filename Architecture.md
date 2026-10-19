# MITRA Universal Companion - Architecture & Specification

## Architecture Overview

```mermaid
graph TD
  User([User Interface]) --> UIComponent[MITRA Web Component Shadow DOM]
  UIComponent --> EventBus[Event Bus src/services/eventBus.js]
  EventBus --> RuntimeService[Runtime Service src/services/RuntimeService.js]
  RuntimeService --> ControlPlane[Control Plane Mock src/services/controlPlane.js]
  RuntimeService --> CapRuntime[Capability Runtime src/mock/capabilityRuntime.js]
  RuntimeService --> ContextStore[Context Store src/services/contextStore.js]
  ContextStore --> LocalStorage[(localStorage Persistence)]
```

## Runtime Flow

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as MITRA Window / Launcher
  participant EB as Event Bus
  participant RS as Runtime Service
  participant CP as Control Plane / UniGuru
  participant CR as Capability Runtime
  participant CS as Context Store

  User->>UI: Types Message / Selects Capability
  UI->>EB: Emits `mitra:message` / `capability.started`
  EB->>RS: Dispatches Event
  RS->>CS: Saves User Input to localStorage
  alt Capability Execution
    RS->>CR: Invokes capability function
    CR-->>EB: Emits `capability.finished`
  else Reasoning / LLM Task
    RS->>CP: Forwards request to UniGuru
    CP-->>EB: Emits `notification.received`
  end
  EB-->>UI: Updates Chat Surface & Activity Indicator
```

## Integration Flow across BHIV Applications

```mermaid
graph LR
  UniGuru[uniguru.html] -->|Embeds <mitra-companion>| WebComp[MITRA Web Component]
  Samachar[samachar.html] -->|Embeds <mitra-companion>| WebComp
  Gurukul[gurukul.html] -->|Embeds <mitra-companion>| WebComp
  SETU[setu.html] -->|Embeds <mitra-companion>| WebComp
  WebComp -->|Reads/Writes State| LocalStorage[(Shared Browser localStorage)]
```

## Review Readiness & Feature Checklist

- **Floating Companion Button**: Always visible bottom-right, pulsing animation, online indicator.
- **Expand / Collapse / Minimize Modes**: Fully supported.
- **Dock Modes**: Left, Right, Floating dock modes.
- **Notification State**: Badges, toasts, background notifications.
- **Conversation Surface**: Bubbles, timestamps, scrolling, history persistence.
- **Capability Launcher**: 9 capability cards (Analyze, OCR, Translate, Summarize, Image, PDF, Replay, Health, Settings).
- **Activity Indicator**: Idle, Thinking, Running Capability, Completed, Failed.
- **Runtime Integration & Event Bus**: Decoupled event-driven architecture with zero hardcoded assistant text.
- **Health Panel**: Live status, latency, version, sync time.
- **Cross-App Demo**: 4 host pages (`uniguru`, `samachar`, `gurukul`, `setu`) with shared persistent context.
- **Mobile Readiness**: Media queries handling tablets and mobile viewports seamlessly.
