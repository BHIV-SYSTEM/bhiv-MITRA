# MITRA Integration & Architecture Handover
## Ashwini Wadekar → Raj Prajapati

**Version:** 3.0.0  
**Date:** 2026-08-25  
**Author / Integration Lead:** Ashwini Wadekar (Frontend Companion & Integration Surface)  

---

## 1. Executive Integration Blueprint

```
                      ┌── Artha (Finance / Samruddhi)
                      ├── SETU (Inter-App Bridge)
                      ├── Gurukul (E-Learning / LMS)
User ──> <mitra-companion> ──> CompanionOrchestrator ──> UniGuru (Knowledge Engine)
        (Shadow DOM UI)      (Raj's Runtime Wiring) ──> Samachar (News Intelligence)
                      ├── BrightConnection (IoT / Devices)
                      └── Device Integrations (Email, Calendar, WhatsApp, Telephony)
```

### Key Ownership Boundaries
* **Ashwini (Frontend Companion Surface):** Floating FAB orb, Shadow DOM Web Component (`<mitra-companion>`), state persistence (`contextStore.js`), event pub/sub (`eventBus.js`), UI text-wrapping, and canonical card rendering.
* **Raj (Canonical Runtime Authority):** `CompanionOrchestrator`, `IntentFlow` NLU, `CapabilityRegistry`, canonical execution context (`trace_id`, `execution_id`), and runtime event bus.
* **Samachar (Information Capability):** Reusable news retrieval and article processing via `SamacharCapability`.

---

## 2. Selective Merge Strategy (`master1` -> `main`)

> [!WARNING]
> **DO NOT RUN `git merge master1` DIRECTLY INTO `main`.**
> `main` contains canonical runtime enhancements (SSE token streaming, SearXNG, coreference resolution, multi-model fallbacks). Merging `master1` directly would cause merge conflicts or overwrite core runtime improvements.
> 
> **Use the Selective File Copy / Integration Guide below.**

---

## 3. Modular File Copy Candidates (100% Safe to Copy)

The following files created/updated in `master1` are modular, self-contained, and safe to copy directly into `main`:

| File Path | Description | Integration Action |
| :--- | :--- | :--- |
| [`src/mitra-companion.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/mitra-companion.js) | Web Component entry point (`<mitra-companion>`) | Copy file directly to `main` |
| [`src/components/MITRAWindow.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/components/MITRAWindow.js) | Collapsible companion chat window | Copy file directly to `main` |
| [`src/components/MITRAButton.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/components/MITRAButton.js) | Floating FAB launcher button | Copy file directly to `main` |
| [`src/components/ConversationPanel.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/components/ConversationPanel.js) | Message rendering & Canonical News Card formatter | Copy file directly to `main` |
| [`src/components/DockController.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/components/DockController.js) | Window docking & minimize controller | Copy file directly to `main` |
| [`src/components/Header.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/components/Header.js) | Header with dynamic status dot & controls | Copy file directly to `main` |
| [`src/services/eventBus.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/services/eventBus.js) | Lightweight pub/sub event bus | Copy file directly to `main` |
| [`src/services/contextStore.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/services/contextStore.js) | State persistence (`windowState`, `position`, `history`) | Copy file directly to `main` |
| [`src/services/controlPlane.js`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/src/services/controlPlane.js) | API request resolver & News Card response adapter | Copy file directly to `main` |
| [`styles/mitra-companion.css`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/styles/mitra-companion.css) | Encapsulated Shadow DOM CSS & overflow rules | Copy file directly to `main` |
| [`backend/app/capabilities/samachar_capability.py`](file:///c:/Users/pc/Desktop/BHIV_ASHWINI/Mitra/backend/app/capabilities/samachar_capability.py) | Samachar news capability participant | Copy file directly to `main` |

---

## 4. How the End-to-End System Works

### A. General Knowledge / Casual Query Flow (`What is AI?`)
1. User types `What is AI?` in `<mitra-companion>` chatbot window.
2. `controlPlane.js` sends `POST /api/companion/chat` to `https://mitra-backend-q1f3.onrender.com`.
3. Raj's `CompanionOrchestrator` & `IntentFlow` classify query as `intent = "general"`.
4. Backend executes general LLM/knowledge response pipeline.
5. Response renders cleanly in `ConversationPanel.js` as standard chat bubble text.

### B. Direct News URL / News Query Flow (`https://www.bbc.com/...` or `Latest AI news`)
1. User submits a news article URL or news query in `<mitra-companion>`.
2. `controlPlane.js` sends `POST /api/companion/chat` to backend.
3. Backend executes `SamacharCapability` calling `SAMACHAR_API_URL` (`POST /api/unified-news-workflow` with `{"url": "..."}`).
4. `controlPlane.js` & `ConversationPanel.js` parse returned news payload into the **Canonical MITRA News Card**:
   - **Header:** `📰 NEWS ANALYSIS` with `TECHNOLOGY` / `NEWS` badge
   - **Title:** Article Title
   - **Author:** Author / News Desk
   - **Date:** Publication Date / Recent
   - **Credibility Rating:** `High`
   - **Authenticity Score:** `95%`
   - **Summary:** Extracted article summary
   - **Link:** `🔗 View Source Article` (Direct clickable link with `overflow-wrap: anywhere; word-break: break-all;`)

---

## 5. Selective Integration Steps for Raj

```bash
# Step 1: Switch to main branch
git checkout main

# Step 2: Copy frontend companion files from master1
git checkout master1 -- src/mitra-companion.js
git checkout master1 -- src/components/
git checkout master1 -- src/services/
git checkout master1 -- styles/mitra-companion.css

# Step 3: Copy Samachar capability backend file
git checkout master1 -- backend/app/capabilities/samachar_capability.py

# Step 4: Verify intentflow.py has 'news' pattern list in _CAPABILITY_INTENT_MAP
# (Ensure intentflow.py contains: "news": ["news", "samachar", "headlines", "articles", "press", "media"])

# Step 5: Test test_samachar_capability.py test suite
python -m pytest backend/tests/test_samachar_capability.py

# Step 6: Deploy & configure SAMACHAR_API_URL env variable on Render host
# SAMACHAR_API_URL=https://your-samachar-service.onrender.com/api/unified-news-workflow
```

---

## 6. Verification Checklist After Merging

- [x] **General Query:** `What is AI?` returns general conversational answer without touching Samachar.
- [x] **Direct News URL:** `https://www.bbc.com/news/articles/c62m4zn1q6mo` renders green canonical **📰 NEWS ANALYSIS** card with Title, Author, Date, Credibility, Authenticity Score, Summary, and Source Link.
- [x] **Zero Red Error Boxes:** Execution completes cleanly without red failure cards.
- [x] **Zero Raw Search Dumps:** `"Web Information Intelligence Summary:"` text dumps are completely avoided.
- [x] **Zero UI Overflow:** Long URLs wrap cleanly across lines with zero horizontal scrollbars.
