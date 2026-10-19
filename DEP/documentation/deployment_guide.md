# Deployment Guide
## MITRA Universal Companion — Phase 2 Frontend Production Integration

**Contributor:** Ashwini Wadekar  
**Scope:** React Frontend Deployment  
**Review Date:** 2026-07-31

---

## 1. Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 16 or higher |
| npm | 8 or higher |
| BHIV production backend | Running and reachable |

---

## 2. Environment Variables

Create a `.env` file in `frontend/frontend/` before building or running the application.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `REACT_APP_API_URL` | Yes | Base URL of the BHIV production backend | `https://mitra-backend-q1f3.onrender.com` |
| `REACT_APP_API_KEY` | Yes | API key sent as `X-API-Key` header on every request | `bhiv-enterprise-key` |

If `REACT_APP_API_URL` is not set, the application falls back to `https://mitra-backend-q1f3.onrender.com`.  
If `REACT_APP_API_KEY` is not set, the application falls back to `bhiv-enterprise-key`.

A `.env.example` file is provided at `frontend/frontend/.env.example`.

---

## 3. Local Development

```bash
# 1. Navigate to the frontend directory
cd frontend/frontend

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
# Edit .env and set REACT_APP_API_URL and REACT_APP_API_KEY

# 4. Start the development server
npm start
```

The application will be available at `http://localhost:3000`.

The backend must be running and reachable at the URL specified in `REACT_APP_API_URL` for API calls to succeed.

---

## 4. Production Build

```bash
# 1. Navigate to the frontend directory
cd frontend/frontend

# 2. Install dependencies
npm install

# 3. Set environment variables (do not commit .env to version control)
export REACT_APP_API_URL=https://mitra-backend-q1f3.onrender.com
export REACT_APP_API_KEY=<your-api-key>

# 4. Build
npm run build
```

The production build output is placed in `frontend/frontend/build/`. Serve this directory with any static file server or deploy to Vercel, Netlify, or a CDN.

---

## 5. Vercel Deployment

A `vercel.json` is present at `frontend/frontend/vercel.json`. To deploy:

```bash
cd frontend/frontend
npx vercel --prod
```

Set the environment variables `REACT_APP_API_URL` and `REACT_APP_API_KEY` in the Vercel project settings dashboard before deploying.

The `_redirects` file at `frontend/frontend/public/_redirects` handles client-side routing for single-page application deployments.

---

## 6. Backend Dependency

The frontend requires the following backend endpoints to be available at the configured `REACT_APP_API_URL`:

| Endpoint | Required for |
|----------|-------------|
| `GET /health` | Connection status indicator |
| `POST /api/companion/chat` | All chat messages |
| `GET /api/companion/greeting/{user_id}` | Initial greeting on login |
| `GET /api/companion/session/{user_id}` | Session ID acquisition at startup |
| `GET /api/companion/memory/{user_id}` | Memory load at startup |
| `GET /api/companion/capabilities` | Capabilities load at startup |
| `GET /api/v1/presence/{user_id}` | Presence check at startup |
| `POST /api/v1/presence/heartbeat` | Periodic presence heartbeat |

The startup endpoints (session, memory, presence, capabilities) are called with `Promise.allSettled`. If any of them are unavailable, the chat interface remains functional. Only `POST /api/companion/chat` is required for core chat functionality.

---

## 7. Authentication

The frontend uses a Bearer token stored in `localStorage` under the key `authToken`. This token is set by the authentication flow (`AuthContext.tsx`) and is included in the `Authorization` header of every API request.

The `X-API-Key` header is always included, regardless of authentication state.

---

## 8. Backend Cold Start

The production backend is deployed on Render.com and may experience cold start delays of up to 60 seconds after a period of inactivity. The `sendMessage()` function applies a 90-second `AbortController` timeout to accommodate this. Users will see a "Request timed out" error if the backend does not respond within 90 seconds.

---

## 9. CORS

The backend must be configured to allow requests from the frontend origin. This is a backend configuration concern and is not managed by the frontend.

---

## 10. Companion Widget (Static Pages)

The companion widget (`src/mitra-companion.js`) is embedded in static HTML pages (`index.html`, `login.html`, `signup.html`, `pages/*.html`). These pages reference the backend directly via the `api-base-url` attribute on the `<mitra-companion>` element or via the hardcoded URL in `src/services/RuntimeService.js`.

To update the backend URL for the widget, modify `src/services/RuntimeService.js` and `src/services/controlPlane.js`, or set the `api-base-url` attribute on the `<mitra-companion>` element in each HTML page.
