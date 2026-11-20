"""
MITRA Ecosystem Integration API
--------------------------------
Provides REST endpoints for BHIV product integration management.
Includes live runtime proof endpoints for integration verification.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.logging import get_logger
from app.ecosystem.adapter_registry import AdapterRegistry, register_all_adapters
from app.ecosystem.base_adapter import IntegrationRequest
from app.services.ecosystem_integration_service import (
    get_ecosystem_integration_service,
    RuntimeProof,
    ExecutionProof,
)

logger = get_logger(__name__)

router = APIRouter()

# Initialize adapter registry at module load
register_all_adapters()


class EcosystemQueryRequest(BaseModel):
    product: str
    action: str
    payload: Optional[Dict[str, Any]] = None


class EcosystemExecuteRequest(BaseModel):
    product: str
    action: str
    payload: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None


class RuntimeProofRequest(BaseModel):
    """Request for generating runtime proof."""
    product: str
    action: str
    payload: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None


@router.get("/api/ecosystem/products")
async def list_ecosystem_products(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """List all registered BHIV products and their integration status."""
    registry = AdapterRegistry()
    return {
        "status": "ok",
        "products": registry.list_products(),
        "active_adapters": registry.list_active_adapters(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/manifests")
async def get_ecosystem_manifests(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Get integration manifests for all registered BHIV products."""
    registry = AdapterRegistry()
    return {
        "status": "ok",
        "manifests": registry.get_manifests(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/health")
async def ecosystem_health_check(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Health check for all BHIV product integrations."""
    registry = AdapterRegistry()
    health = await registry.health_check_all()
    return {
        "status": "ok",
        "integrations": health,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.post("/api/ecosystem/query")
async def ecosystem_query(
    request: EcosystemQueryRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Query data from a BHIV product through its adapter."""
    registry = AdapterRegistry()
    adapter = registry.get_adapter(request.product)
    if not adapter:
        raise HTTPException(
            status_code=404,
            detail=f"No adapter registered for product: {request.product}",
        )

    integration_request = IntegrationRequest(
        action=request.action,
        payload=request.payload or {},
        trace_id=f"eco_q_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        source_product="mitra",
        target_product=request.product,
    )

    result = await adapter.query(integration_request)
    return result.to_dict()


@router.post("/api/ecosystem/execute")
async def ecosystem_execute(
    request: EcosystemExecuteRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Execute an action on a BHIV product through its adapter."""
    registry = AdapterRegistry()
    adapter = registry.get_adapter(request.product)
    if not adapter:
        raise HTTPException(
            status_code=404,
            detail=f"No adapter registered for product: {request.product}",
        )

    integration_request = IntegrationRequest(
        action=request.action,
        payload=request.payload or {},
        trace_id=f"eco_e_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        source_product="mitra",
        target_product=request.product,
        user_id=request.user_id,
        session_id=request.session_id,
    )

    result = await adapter.execute(integration_request)
    return result.to_dict()


@router.get("/api/ecosystem/snapshot")
async def ecosystem_snapshot(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Get full ecosystem registry snapshot for monitoring."""
    registry = AdapterRegistry()
    return {
        "status": "ok",
        "snapshot": registry.snapshot(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ============================================================
# LIVE RUNTIME PROOF ENDPOINTS
# ============================================================

@router.post("/api/ecosystem/runtime-proof")
async def generate_runtime_proof(
    request: RuntimeProofRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Generate live runtime proof for BHIV product integration.
    Demonstrates actual integration with the product.
    """
    service = get_ecosystem_integration_service()

    proof = await service.execute_product_action(
        product=request.product,
        action=request.action,
        payload=request.payload or {},
        user_id=request.user_id,
        session_id=request.session_id,
    )

    from dataclasses import asdict
    return {
        "status": "ok",
        "proof": asdict(proof),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.post("/api/ecosystem/query-proof")
async def generate_query_proof(
    request: RuntimeProofRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Generate live query proof for BHIV product integration.
    Demonstrates actual data retrieval from the product.
    """
    service = get_ecosystem_integration_service()

    proof = await service.query_product_data(
        product=request.product,
        action=request.action,
        payload=request.payload or {},
    )

    from dataclasses import asdict
    return {
        "status": "ok",
        "proof": asdict(proof),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/runtime-proofs")
async def get_runtime_proofs(
    product: Optional[str] = None,
    limit: int = 100,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Get all runtime execution proofs.
    Provides evidence of live integration with BHIV products.
    """
    service = get_ecosystem_integration_service()
    proofs = service.get_runtime_proofs(product=product, limit=limit)

    from dataclasses import asdict
    return {
        "status": "ok",
        "total_proofs": len(proofs),
        "proofs": [asdict(p) for p in proofs],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/execution-proofs")
async def get_execution_proofs(
    platform: Optional[str] = None,
    limit: int = 100,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Get all platform execution proofs.
    Provides evidence of live execution on WhatsApp, Email, Telegram, etc.
    """
    service = get_ecosystem_integration_service()
    proofs = service.get_execution_proofs(platform=platform, limit=limit)

    from dataclasses import asdict
    return {
        "status": "ok",
        "total_proofs": len(proofs),
        "proofs": [asdict(p) for p in proofs],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/integration-summary")
async def get_integration_summary(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Get summary of all integration proofs.
    Shows total integrations and execution evidence.
    """
    service = get_ecosystem_integration_service()
    summary = service.get_integration_summary()

    return {
        "status": "ok",
        "summary": summary,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.post("/api/ecosystem/demonstrate")
async def demonstrate_ecosystem_integration(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Demonstrate live integration with all ecosystem products.
    Generates runtime proofs for each registered product.
    """
    service = get_ecosystem_integration_service()
    result = await service.demonstrate_ecosystem_integration()

    return {
        "status": "ok",
        "demonstration": result,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/ecosystem/verify-proof/{trace_id}")
async def verify_runtime_proof(
    trace_id: str,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """
    Verify the integrity of a runtime proof by trace_id.
    Ensures proof has not been tampered with.
    """
    service = get_ecosystem_integration_service()
    proofs = service.get_runtime_proofs()

    for proof in proofs:
        if proof.trace_id == trace_id:
            is_valid = service.verify_integrity(proof)
            from dataclasses import asdict
            return {
                "status": "ok",
                "trace_id": trace_id,
                "valid": is_valid,
                "proof": asdict(proof),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }

    raise HTTPException(
        status_code=404,
        detail=f"No proof found for trace_id: {trace_id}",
    )


# ── AIAIC (KRISHI SAMPADA / GOV OPS) NOTIFICATION ROUTES ──

import hmac
import hashlib
import uuid
from typing import List

_IDEMPOTENCY_CACHE: Dict[str, Dict[str, Any]] = {}


def _get_ecosystem_db():
    try:
        from app.services.connected_account_service import _get_db
        return _get_db()
    except Exception:
        return None


def _verify_aiaic_key(x_api_key: Optional[str]) -> bool:
    if not x_api_key or not x_api_key.strip():
        return False
    configured = os.getenv("AIAIC_SERVICE_KEY", "").strip()
    alt_keys = [k.strip() for k in os.getenv("ECOSYSTEM_API_KEYS", "").split(",") if k.strip()]
    valid_keys = [k for k in [configured] + alt_keys if k]
    if not valid_keys:
        return False
    return any(hmac.compare_digest(x_api_key.strip(), vk) for vk in valid_keys)


class WhatsAppTemplateSendRequest(BaseModel):
    to_phone: str
    template_name: str
    language_code: str = "en_US"
    components: Optional[List[Dict[str, Any]]] = None


class EmailNoticeSendRequest(BaseModel):
    to_email: str
    template_name: str
    language: str = "en"
    params: Dict[str, Any]


_EMAIL_TEMPLATES = {
    "govops_status_update_email": {
        "en": {
            "subject": "Update on your request {request_id}",
            "body": "Your request {request_id} now has the status: {status}. If you have questions, or no longer want these e-mails, please contact your office. This message was sent automatically; please do not reply to it."
        },
        "mr": {
            "subject": "तुमच्या विनंती {request_id} बद्दल माहिती",
            "body": "तुमच्या विनंती {request_id} ची स्थिती आता: {status}. काही प्रश्न असल्यास, किंवा हे ई-मेल नको असल्यास, कृपया तुमच्या कार्यालयाशी संपर्क साधा. हा संदेश आपोआप पाठवला आहे; कृपया याला उत्तर देऊ नका."
        },
        "hi": {
            "subject": "आपके अनुरोध {request_id} के बारे में जानकारी",
            "body": "आपके अनुरोध {request_id} की स्थिति अब: {status}. कोई प्रश्न हो, या ये ई-मेल नहीं चाहिए हों, तो कृपया अपने कार्यालय से संपर्क करें। यह संदेश अपने आप भेजा गया है; कृपया इसका उत्तर न दें।"
        }
    }
}


@router.post("/api/ecosystem/whatsapp/send-template")
async def ecosystem_send_whatsapp_template(
    req: WhatsAppTemplateSendRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Dedicated server-to-server endpoint for AIAIC / Gov Ops to dispatch WhatsApp templates.
    Protected by X-API-Key and deduplicated via Idempotency-Key.
    """
    if not _verify_aiaic_key(x_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing X-API-Key")

    now_iso = datetime.utcnow().isoformat() + "Z"

    # Idempotency deduplication check
    if idempotency_key:
        cached = _IDEMPOTENCY_CACHE.get(idempotency_key)
        if cached:
            logger.info("Idempotent replay detected for key=%s", idempotency_key)
            return cached

    from app.executors.meta_whatsapp_executor import meta_whatsapp_executor
    res = meta_whatsapp_executor.send_template_message(
        to_phone=req.to_phone.strip(),
        template_name=req.template_name.strip(),
        language_code=req.language_code.strip(),
        components=req.components,
        user_id=None
    )

    if res.get("status") == "error":
        err_msg = res.get("error") or res.get("raw_error") or "Failed to dispatch WhatsApp template"
        code = res.get("meta_code")
        status_code = 404 if code in (100, 132001) else 400
        raise HTTPException(status_code=status_code, detail=f"Meta Dispatch Error: {err_msg}")

    wamid = res.get("message_id")
    response_payload = {
        "status": "success",
        "message_id": wamid,
        "recipient": req.to_phone.strip(),
        "timestamp": now_iso
    }

    # Store in MongoDB / memory for status lookup
    db = _get_ecosystem_db()
    if db is not None:
        try:
            db["ecosystem_dispatches"].insert_one({
                "channel": "whatsapp",
                "message_id": wamid,
                "recipient": req.to_phone.strip(),
                "template_name": req.template_name,
                "language_code": req.language_code,
                "delivery_status": "sent",
                "idempotency_key": idempotency_key,
                "created_at": datetime.utcnow(),
                "updated_at": now_iso
            })
        except Exception as exc:
            logger.warning("Failed storing ecosystem dispatch in DB: %s", exc)

    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = response_payload

    return response_payload


@router.get("/api/ecosystem/whatsapp/status/{wamid}")
async def ecosystem_get_whatsapp_status(
    wamid: str,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    """
    Fallback status inquiry for an in-flight WhatsApp message ID.
    """
    if not _verify_aiaic_key(x_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing X-API-Key")

    db = _get_ecosystem_db()
    delivery_status = "sent"
    updated_at = datetime.utcnow().isoformat() + "Z"
    error_obj = None

    if db is not None:
        doc = db["ecosystem_dispatches"].find_one({"message_id": wamid, "channel": "whatsapp"})
        if doc:
            delivery_status = doc.get("delivery_status", "sent")
            updated_at = doc.get("updated_at") or updated_at
            error_obj = doc.get("error")
        else:
            event_doc = db["whatsapp_webhook_events"].find_one({"event.entry.changes.value.statuses.id": wamid})
            if event_doc:
                delivery_status = "delivered"

    return {
        "status": "success",
        "channel": "whatsapp",
        "message_id": wamid,
        "delivery_status": delivery_status,
        "timestamp": updated_at,
        "error": error_obj
    }


@router.post("/api/ecosystem/email/send-notice")
async def ecosystem_send_email_notice(
    req: EmailNoticeSendRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Dedicated server-to-server endpoint for AIAIC / Gov Ops to dispatch templated email notices.
    """
    if not _verify_aiaic_key(x_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing X-API-Key")

    now_iso = datetime.utcnow().isoformat() + "Z"

    if idempotency_key:
        cached = _IDEMPOTENCY_CACHE.get(idempotency_key)
        if cached:
            return cached

    tmpl_dict = _EMAIL_TEMPLATES.get(req.template_name)
    if not tmpl_dict:
        raise HTTPException(status_code=400, detail=f"Unsupported email template: {req.template_name}")

    lang = req.language if req.language in tmpl_dict else "en"
    tmpl = tmpl_dict[lang]

    try:
        subj = tmpl["subject"].format(**req.params)
        body = tmpl["body"].format(**req.params)
    except KeyError as k_err:
        raise HTTPException(status_code=400, detail=f"Missing required template parameter: {k_err}")

    from app.executors.email_executor import email_executor
    res = email_executor.send_email(
        to_email=req.to_email.strip(),
        subject=subj,
        message=body,
        is_system_action=True
    )

    if res.get("status") == "error":
        raise HTTPException(status_code=502, detail=f"Email Delivery Error: {res.get('error')}")

    message_id = f"email_{uuid.uuid4().hex[:16]}"
    response_payload = {
        "status": "success",
        "message_id": message_id,
        "timestamp": now_iso
    }

    db = _get_ecosystem_db()
    if db is not None:
        try:
            db["ecosystem_dispatches"].insert_one({
                "channel": "email",
                "message_id": message_id,
                "recipient": req.to_email.strip(),
                "template_name": req.template_name,
                "language": lang,
                "delivery_status": "delivered",
                "idempotency_key": idempotency_key,
                "created_at": datetime.utcnow(),
                "updated_at": now_iso
            })
        except Exception as exc:
            logger.warning("Failed storing email dispatch in DB: %s", exc)

    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = response_payload

    return response_payload


@router.get("/api/ecosystem/email/status/{message_id}")
async def ecosystem_get_email_status(
    message_id: str,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    """
    Status inquiry for a dispatched email notice.
    """
    if not _verify_aiaic_key(x_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing X-API-Key")

    db = _get_ecosystem_db()
    delivery_status = "delivered"
    updated_at = datetime.utcnow().isoformat() + "Z"
    bounce_type = None

    if db is not None:
        doc = db["ecosystem_dispatches"].find_one({"message_id": message_id, "channel": "email"})
        if doc:
            delivery_status = doc.get("delivery_status", "delivered")
            updated_at = doc.get("updated_at") or updated_at
            bounce_type = doc.get("bounce_type")

    return {
        "status": "success",
        "channel": "email",
        "message_id": message_id,
        "delivery_status": delivery_status,
        "bounce_type": bounce_type,
        "timestamp": updated_at,
        "error": None
    }

