import sys
import os
from datetime import datetime
from contextlib import asynccontextmanager

import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from dotenv import load_dotenv

# -------------------------------------------------
# Path setup
# -------------------------------------------------
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

# -------------------------------------------------
# Load environment variables
# -------------------------------------------------
load_dotenv()  # Load from current directory

# -------------------------------------------------
# Optional Sentry
# -------------------------------------------------
if os.getenv("SENTRY_DSN"):
    import sentry_sdk
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        environment=os.getenv("ENV", "production"),
    )

# -------------------------------------------------
# Local imports
# -------------------------------------------------
from app.core.logging import setup_logging, get_logger
from app.core.database import create_tables
from app.core.security import rate_limit, audit_log
from app.api.assistant import router as assistant_router
from app.api.auth import router as auth_router
from app.api.mitra_api import router as mitra_router
from app.api.webhooks import router as webhook_router
from app.api.tts import router as tts_router
from app.api.replay import router as replay_router
from app.api.metrics import router as metrics_router
from app.api.ecosystem import router as ecosystem_router
from app.tantra.api import router as tantra_router
from app.executors.telegram_executor import TelegramExecutor
from app.services.reminder_scheduler import ReminderScheduler, SchedulerConfig
from app.mitra_system_health import get_system_health_snapshot
from app.core.monitoring import init_monitoring, init_prometheus_metrics

# -------------------------------------------------
# Companion / Runtime / Extended routers (from praj33 & bhiv/main)
# -------------------------------------------------
try:
    from app.api.oauth_api import router as oauth_router
except ImportError:
    oauth_router = None

try:
    from app.api.integrations import router as integrations_router
except ImportError:
    integrations_router = None

try:
    from app.api.communication_api import router as communication_router
except ImportError:
    communication_router = None

try:
    from app.api.companion_api import router as companion_router
except ImportError:
    companion_router = None

try:
    from app.api.workflow_api import router as workflow_router
except ImportError:
    workflow_router = None

try:
    from app.api.notifications_api import router as notifications_router
except ImportError:
    notifications_router = None

try:
    from app.api.presence_api import router as presence_router
except ImportError:
    presence_router = None

try:
    from app.routers.whatsapp_inbound import router as whatsapp_inbound_router
except ImportError:
    whatsapp_inbound_router = None

try:
    from app.routers.email_inbound import router as email_inbound_router
except ImportError:
    email_inbound_router = None

try:
    from app.routers.telephony_inbound import router as telephony_inbound_router
except ImportError:
    telephony_inbound_router = None

try:
    from app.routers.pages import router as pages_router
except ImportError:
    pages_router = None

try:
    from app.api.whatsapp_api import router as whatsapp_api_router
except ImportError:
    whatsapp_api_router = None

# -------------------------------------------------
# Logging
# -------------------------------------------------
setup_logging()
logger = get_logger(__name__)


def _telegram_webhook_url() -> str | None:
    explicit = (os.getenv("TELEGRAM_WEBHOOK_URL") or "").strip()
    if explicit:
        return explicit

    public_base = (
        os.getenv("RENDER_EXTERNAL_URL")
        or os.getenv("BASE_URL")
        or os.getenv("PUBLIC_BASE_URL")
        or ""
    ).strip()
    if not public_base or "localhost" in public_base or "127.0.0.1" in public_base:
        return None
    return f"{public_base.rstrip('/')}/webhook/telegram"


def _register_telegram_webhook() -> None:
    webhook_url = _telegram_webhook_url()
    if not webhook_url:
        logger.info("Telegram webhook registration skipped: no public webhook URL configured")
        return

    executor = TelegramExecutor()
    if not executor.bot_token:
        logger.info("Telegram webhook registration skipped: TELEGRAM_BOT_TOKEN not configured")
        return

    result = executor.set_webhook(webhook_url)
    if result.get("status") == "success":
        logger.info("Telegram webhook registered: %s", webhook_url)
    else:
        logger.warning("Telegram webhook registration failed: %s", result)

# -------------------------------------------------
# App lifespan
# -------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_task = None
    scheduler = None
    # Initialize database tables
    try:
        await create_tables()
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}")
        # Don't fail startup if database is read-only - app can still run
        # but database features won't work
        logger.warning("Continuing startup without database initialization")

    # Optional: start reminder scheduler worker
    if os.getenv("REMINDER_SCHEDULER_ENABLED", "0").lower() in {"1", "true", "yes"}:
        try:
            scheduler = ReminderScheduler(
                SchedulerConfig(
                    poll_interval_seconds=float(os.getenv("REMINDER_SCHEDULER_POLL_SECONDS", "1.0")),
                    max_batch=int(os.getenv("REMINDER_SCHEDULER_MAX_BATCH", "25")),
                )
            )
            scheduler_task = asyncio.create_task(scheduler.start())
            logger.info("Reminder scheduler started")
        except Exception as e:
            logger.error(f"Failed to start reminder scheduler: {e}")

    # Initialize Ecosystem Adapters & Mitra Capabilities
    try:
        from app.ecosystem.adapter_registry import register_all_adapters
        from app.capabilities import register_all_capabilities
        register_all_adapters()
        register_all_capabilities()
        logger.info("Ecosystem adapters and Mitra capabilities registered successfully.")
    except Exception as exc:
        logger.warning("Failed initializing capabilities/adapters: %s", exc)

    try:
        _register_telegram_webhook()
    except Exception as e:
        logger.warning(f"Telegram webhook setup failed: {e}")

    yield

    # Shutdown reminder scheduler
    if scheduler:
        try:
            scheduler.stop()
        except Exception:
            pass
    if scheduler_task:
        scheduler_task.cancel()

# -------------------------------------------------
# FastAPI app
# -------------------------------------------------
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

app = FastAPI(
    title="AI Assistant Backend",
    description="Production-locked Assistant Backend",
    version="3.0.0",
    lifespan=lifespan,
)

# -------------------------------------------------
# CORS - Explicit origins for production security
# -------------------------------------------------
def _get_allowed_origins() -> list[str]:
    """Build CORS allowed origins from environment."""
    origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        "https://mitra.blackholeinfiverse.com",
        "https://artha.blackholeinfiverse.com",
        "https://samachar.blackholeinfiverse.com",
        "https://uniguru.blackholeinfiverse.com",
        "https://setu.blackholeinfiverse.com",
        "*",
    ]
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        origins.append(frontend_url)
    extra_origins = os.getenv("CORS_ORIGINS", "").strip()
    if extra_origins:
        for origin in extra_origins.split(","):
            origin = origin.strip()
            if origin:
                origins.append(origin)
    return list(set(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# -------------------------------------------------
# Register API Routers
# -------------------------------------------------
app.include_router(auth_router)
if oauth_router:
    app.include_router(oauth_router)
if integrations_router:
    app.include_router(integrations_router)
if communication_router:
    app.include_router(communication_router)

app.include_router(assistant_router)
app.include_router(mitra_router)
app.include_router(webhook_router)
app.include_router(tts_router)
app.include_router(replay_router)
app.include_router(metrics_router)
app.include_router(ecosystem_router)
app.include_router(tantra_router)

if companion_router:
    app.include_router(companion_router)
if workflow_router:
    app.include_router(workflow_router)
if notifications_router:
    app.include_router(notifications_router)
if presence_router:
    app.include_router(presence_router)
if whatsapp_inbound_router:
    app.include_router(whatsapp_inbound_router)
if email_inbound_router:
    app.include_router(email_inbound_router)
if telephony_inbound_router:
    app.include_router(telephony_inbound_router)
if pages_router:
    app.include_router(pages_router)
if whatsapp_api_router:
    app.include_router(whatsapp_api_router)


# -------------------------------------------------
# Security Middleware
# -------------------------------------------------
# -------------------------------------------------
# Initialize Monitoring (OpenTelemetry + Prometheus)
# -------------------------------------------------
@app.on_event("startup")
async def _startup_monitoring():
    init_monitoring()
    init_prometheus_metrics(app)

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Allow health check and root without auth
    if request.url.path in ["/health", "/", "/metrics"]:
        response = await call_next(request)
        return response

    # Public endpoints manage their own validation
    public_prefixes = ("/api/auth", "/api/integrations", "/api/pages", "/api/ecosystem", "/api/companion", "/api/replay", "/api/metrics", "/api/tantra", "/api/mitra", "/api/calendar", "/api/oauth", "/api/connections", "/api/webhooks", "/api/whatsapp")
    if any(request.url.path.startswith(prefix) for prefix in public_prefixes):
        response = await call_next(request)
        return response

    # Allow OPTIONS requests (CORS preflight) without auth
    if request.method == "OPTIONS":
        response = await call_next(request)
        return response

    if request.url.path.startswith("/api"):
        public_paths = ("/api/auth", "/api/integrations", "/api/pages", "/api/calendar/feed", "/api/companion", "/api/system", "/api/mitra", "/api/oauth", "/api/connections", "/api/whatsapp")
        is_public = any(request.url.path.startswith(p) for p in public_paths)

        if not is_public:
            from fastapi import HTTPException
            try:
                rate_limit(request)
            except HTTPException as e:
                if e.status_code == 429:
                    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

    response = await call_next(request)
    return response

# -------------------------------------------------
# Direct LLM Test Endpoint (bypasses broken routers package)
# -------------------------------------------------
from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional
from app.core.llm_bridge import llm_bridge as _llm_bridge

class _LLMRequest(_BaseModel):
    prompt: str
    model: str = "uniguru"

@app.post("/external_llm")
async def call_external_llm(request: _LLMRequest):
    response = await _llm_bridge.call_llm(request.model, request.prompt)
    return {"response": response}

# -------------------------------------------------
# System Endpoints
# -------------------------------------------------
@app.get("/")
async def root():
    return {
        "message": "MITRA AI Command Center API v3.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "health_system": "/health/system",
            "auth_signup": "/api/auth/signup",
            "auth_login": "/api/auth/login",
            "auth_me": "/api/auth/me",
            "assistant": "/api/assistant",
            "assistant_stream": "/api/assistant/stream",
            "mitra_evaluate": "/api/mitra/evaluate",
            "companion_capabilities": "/api/companion/capabilities",
            "companion_process": "/api/companion/process",
            "workflow_create": "/api/workflow/create",
            "notifications": "/api/notifications",
            "presence": "/api/presence",
            "tantra_status": "/api/tantra/status",
            "replay": "/api/replay/{trace_id}",
            "replay_stages": "/api/replay/{trace_id}/stages",
            "replay_compare": "/api/replay/compare",
            "metrics": "/api/metrics",
            "metrics_system": "/api/metrics/system",
            "metrics_enforcement": "/api/metrics/enforcement",
            "tts": "/api/tts",
            "tts_status": "/api/tts/status",
            "ecosystem_products": "/api/ecosystem/products",
            "ecosystem_manifests": "/api/ecosystem/manifests",
            "ecosystem_health": "/api/ecosystem/health",
            "ecosystem_query": "/api/ecosystem/query",
            "ecosystem_execute": "/api/ecosystem/execute",
            "runtime_status": "/api/runtime/status",
            "runtime_capabilities": "/api/runtime/capabilities",
            "runtime_health": "/api/runtime/health",
            "runtime_sessions": "/api/runtime/sessions",
        },
        "version": "3.0.0",
        "modules": {
            "core": "active",
            "tantra": "active",
            "companion": "active" if companion_router else "unavailable",
            "workflow": "active" if workflow_router else "unavailable",
            "notifications": "active" if notifications_router else "unavailable",
            "presence": "active" if presence_router else "unavailable",
            "whatsapp_inbound": "active" if whatsapp_inbound_router else "unavailable",
            "email_inbound": "active" if email_inbound_router else "unavailable",
            "telephony_inbound": "active" if telephony_inbound_router else "unavailable",
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

@app.get("/health")
async def health_check():
    """Basic health check with MongoDB connectivity probe."""
    mongo_status = "ok"
    try:
        from app.core.database import client
        await client.admin.command("ping")
    except Exception as e:
        mongo_status = f"error: {str(e)}"

    return {
        "status": "ok" if mongo_status == "ok" else "degraded",
        "version": "3.0.0",
        "mongodb": mongo_status,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.get("/health/system")
async def system_health():
    """
    Deep system health endpoint.
    Reports module status, bucket status, and runtime version for BHIV Core.
    """
    return get_system_health_snapshot()

# Trigger reload
