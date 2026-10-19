# MITRA — Complete Testing & Completion Guide

**Branch:** `master1` | **Owner:** Ashwini Wadekar
**Last Updated:** 2026-08-25

---

## Overall Task Completion Status

| # | Deliverable | Status | Done |
|---|-------------|--------|------|
| 1 | Learn & Document Architecture | DONE | 100% |
| 2 | Build Persistent Companion | DONE | 100% |
| 3 | Real BHIV App Integrations | DONE | 100% |
| 4 | Real-Time Context Feed | DONE (session ctx) | 80% |
| 5 | Samachar Plug-and-Play | DONE | 100% |
| 6 | Device Connectivity | PARTIAL | 50% |
| 7 | Runtime Integration with Raj | DONE (live backend) | 100% |
| 8 | Integration with Product Owners | DOCUMENTED | 85% |
| 9 | Evidence Packet | DONE | 100% |
| 10 | Test Suite | DONE | 90% |
| 11 | Documentation | DONE (all updated) | 100% |
| 12 | Handover | DONE (v3.0.0) | 100% |

### Total: ~92% Complete
Remaining 8% = WhatsApp/Telephone backend wiring (Raj dependency - BLOCKED)

---

## HOW TO TEST — Step by Step

Before every test: Press Ctrl + Shift + R to hard-refresh the page.
Server must be running: python -m http.server 3000 in the MITRA folder.
Backend: https://mitra-backend-q1f3.onrender.com (Raj's live Render server)

---

## TEST 1: Floating Orb

URL: http://localhost:3000/index.html

1. Open the page → Purple/blue floating orb appears at BOTTOM-RIGHT CORNER
2. Scroll down → Orb stays fixed at bottom-right
PASS: orb always visible | FAIL: orb missing or displaced

---

## TEST 2: Expand → Minimize → Reopen

URL: http://localhost:3000/index.html

1. Click the floating orb → Chat panel OPENS
2. Click the minus button in header → Panel COLLAPSES, orb visible again
3. Click orb again → Panel REOPENS with full conversation history
4. Type "Hello" → Message appears
5. Refresh page → History still present

PASS: panel expands, minimizes, history persists | FAIL: history lost or panel broken

---

## TEST 3: Cross-Page Navigation

1. Open http://localhost:3000/index.html → Orb visible
2. Navigate to http://localhost:3000/dashboard.html → Orb STILL visible
3. Navigate to http://localhost:3000/pages/setu.html → Orb STILL visible
4. Navigate to http://localhost:3000/pages/samachar.html → Orb STILL visible

PASS: orb persists on every page | FAIL: orb disappears on navigation

---

## TEST 4: General Knowledge Query

1. Type: What is artificial intelligence?
2. Wait 5-10 seconds
3. Expected: Plain text AI explanation
4. NO green news card should appear

PASS: clean AI response | FAIL: timeout, error, or raw web search dump

---

## TEST 5: News Query — "What is happening with X today?"

[FIXED on 2026-08-25]

1. Type exactly: What is happening with X today?
2. Wait 10-15 seconds
3. Expected: GREEN NEWS ANALYSIS card appears
4. Card shows: title, author "MITRA News Intelligence", date, summary

PASS: green card with real news content
FAIL: raw "Web Information Intelligence Summary:" text still showing

---

## TEST 6: Direct Article URL

1. Paste: https://www.bbc.com/news/articles/c62m4zn1q6mo
2. Wait 10-15 seconds
3. Expected: Green NEWS ANALYSIS card
4. Author = "BBC News Desk" (from bbc.com domain)
5. Click "View Source Article" → opens BBC article in new tab

PASS: BBC News Desk shown, link works | FAIL: error card or generic "News Desk"

---

## TEST 7: ABP Live URL Dynamic Title

1. Paste: https://www.abplive.com/news/world/world-weather-system-changing-ocean-temperature-el-nino-ann-3179849
2. Expected: Green card, Author = "ABPLIVE News Desk"
3. Title must NOT be "News Article Analysis" (old static fallback)
4. Title must be 80 chars or less

PASS: real title, ABPLIVE author | FAIL: "News Article Analysis" shown

---

## TEST 8: Category Detection

| Type this | Expected badge |
|-----------|----------------|
| IPL cricket score today | [SPORTS] |
| stock market news today | [BUSINESS] |
| covid vaccine latest | [HEALTH] |
| NASA space discovery | [SCIENCE] |
| election results today | [POLITICS] |
| ChatGPT latest update | [TECHNOLOGY] |
| X twitter down today | [BREAKING NEWS] |

---

## TEST 9: Reminders & Tasks (NOT news cards)

1. Type: Set a reminder for 5 minutes → Should get REMINDER card (amber/yellow)
2. Type: Create a task: Review MITRA docs → Should get TASK card
3. These must NOT show a news card (would be a cross-contamination bug)

---

## TEST 10: Backend Verification (DevTools)

1. Press F12 → Network tab
2. Send any message in MITRA
3. Look for: POST /api/companion/chat
4. Status must be: 200 OK
5. Response should have: reply, intent, session_id

PASS: 200 OK from mitra-backend-q1f3.onrender.com
FAIL: 404/500 or CORS error

---

## QUICK TEST CHECKLIST (Tick each before handover)

COMPANION UI
[ ] Floating orb visible on index.html
[ ] Floating orb visible on dashboard.html
[ ] Floating orb visible on pages/setu.html
[ ] Floating orb visible on pages/samachar.html
[ ] Click orb → panel opens
[ ] Click minus → panel minimizes
[ ] Click orb again → panel reopens with history
[ ] Panel remembers chat after page refresh

BACKEND CONNECTION
[ ] "What is AI?" → plain AI response (no news card)
[ ] Network tab shows 200 OK from mitra-backend-q1f3.onrender.com

SAMACHAR / NEWS CARDS
[ ] "What is happening with X today?" → green NEWS ANALYSIS card
[ ] BBC URL → green card with "BBC News Desk"
[ ] ABP URL → green card with "ABPLIVE News Desk"
[ ] Title max 80 chars (no overflow)
[ ] "IPL cricket today" → SPORTS badge
[ ] "stock market news" → BUSINESS badge

DEVICE / CAPABILITY
[ ] "Set a reminder in 5 mins" → reminder card (NOT news card)
[ ] "Create a task: test MITRA" → task card
[ ] "Show my calendar" → calendar widget

BUILD VERIFICATION
[ ] npm run build in frontend/frontend/ exits with 0 errors
[ ] python -m pytest backend/tests/test_samachar_capability.py → 2/2 passed

---

## BLOCKED (Not Ashwini's issue — Needs Raj)

| Feature | Blocker |
|---------|---------|
| WhatsApp real send | No BHIV WhatsApp gateway |
| Real email send | Runtime connector |
| Phone call | OS connector / BHIV approval |
| Production deploy | master1 → main merge (Raj + Ashwini together) |

---

## Definition of Done

Per original task — MITRA is done when:

[x] User can invoke MITRA from Artha, SETU, Gurukul → orb present on all pages
[x] Request travels through BHIV/TANTRA runtime → live POST to Raj Render backend
[x] Reaches actual underlying capability → Samachar, task, reminder, calendar
[x] Returns real contextual information → real news content, not mock
[x] Preserves canonical runtime/provenance boundary → no runtime logic duplicated
[x] Can be demonstrated with evidence → browser tested + verified

Ashwini portion: DONE
Remaining: WhatsApp/Phone/Email requires Raj backend connectors.

---
Testing Guide v1.0.0 | 2026-08-25 | Branch: master1
