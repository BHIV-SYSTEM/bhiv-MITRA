# Changed Files — MITRA Phase 1 Convergence

## New Files Created

| File | Size | Purpose |
|------|------|---------|
| `src/config.js` | ~416 B | Global config; reads `api-base-url` from the `<mitra-companion>` element. Fixes breaking module import in `RuntimeService.js` and `controlPlane.js`. |
| `src/components/MessageRenderer.js` | ~1.8 KB | Canonical reusable message bubble factory. Role-aware HTML escaping. Satisfies Phase 6 design system requirement. |
| `src/components/ExecutionStatusPanel.js` | ~5.3 KB | Unified execution status + health panel. Handles all 7 required runtime states. Satisfies Phase 6 design system requirement. |
| `pages/samruddhi.html` | ~1.6 KB | Samruddhi product page with MITRA embedded. Satisfies Phase 2 integration requirement. |
| `DEP/metadata.md` | ~1.7 KB | Mandatory DEP project metadata. |
| `DEP/tms.md` | ~2.4 KB | Mandatory DEP task management summary. |
| `DEP/gc.md` | ~1.9 KB | Mandatory DEP governance compliance. |
| `DEP/mdu.md` | ~1.8 KB | Mandatory DEP module dependency update. |
| `DEP/review.md` | ~1.9 KB | Mandatory DEP review. |
| `DEP/next_tasks.md` | ~1.5 KB | Mandatory DEP next tasks. |
| `DEP/blockers.md` | ~2.6 KB | Mandatory DEP blockers log. |
| `evidence_packet/executive_assessment.md` | — | Mandatory evidence packet executive assessment. |
| `evidence_packet/review_packet.md` | — | Mandatory evidence packet review. |
| `evidence_packet/code_packet/changed_files.md` | — | This file. |
| `evidence_packet/code_packet/companion_components.md` | — | Component inventory. |
| `evidence_packet/code_packet/integration_summary.md` | — | Integration summary per product. |
| `evidence_packet/code_packet/runtime_binding.md` | — | Runtime and event binding documentation. |
| `evidence_packet/code_packet/session_continuity.md` | — | Session continuity architecture. |

## Modified Files

| File | Change | Reason |
|------|--------|--------|
| `pages/uniguru.html` | `http.localhost` → `http://localhost` | Typo caused all backend fetches to fail on UniGuru page |
| `src/components/ConversationPanel.js` | `addMessage({...})` → `addMessage('mitra', message)` | Wrong signature silently corrupted conversation history in localStorage |

## Files NOT Modified (Already Working)

Everything else in the repository was left untouched. Specifically:
- `src/mitra-companion.js` — entry point is correct
- `src/services/RuntimeService.js` — correctly follows backend orchestration
- `src/services/controlPlane.js` — correctly calls backend APIs
- `src/services/contextStore.js` — localStorage persistence is working
- `src/services/eventBus.js` — event system is working
- `src/components/MITRAWindow.js`, `Header.js`, `Footer.js`, `MITRAButton.js`, etc. — all working
- `login.html`, `signup.html` — MITRA already correctly embedded
- `pages/gurukul.html`, `pages/setu.html`, `pages/samachar.html` — already correct
- `backend/` — not touched; backend logic is not Ashwini's responsibility to modify
