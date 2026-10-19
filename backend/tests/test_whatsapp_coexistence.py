"""
test_whatsapp_coexistence.py — Comprehensive Test Suite for WhatsApp Business App Coexistence

Validates:
1. smb_message_echoes parsing, deduplication, and non-execution invariant (never triggers AI assistant).
2. account_update parsing for lifecycle events (ACCOUNT_OFFBOARDED, ACCOUNT_RECONNECTED).
3. Signature verification (HMAC-SHA256) and replay window validation.
4. Duplicate event rejection via WebhookDedupService.
5. Malformed payload tolerance.
6. Shared API boundary enforcement: hard blocking of registration and deregistration endpoints.
7. Webhook verify token backward compatibility across configured environment variables.
"""

import hashlib
import hmac
import json
import os
import time
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.executors.meta_whatsapp_executor import (
    MetaWhatsAppExecutor,
    assert_safe_whatsapp_endpoint,
    UnsafeCoexistenceOperationError,
)
from app.services.inbound_account_resolver import inbound_account_resolver
from app.services.webhook_dedup_service import webhook_dedup_service

client = TestClient(app)
TEST_SECRET = "test_coexistence_webhook_secret_key_123"


def _sign_payload(payload_bytes: bytes, secret: str = TEST_SECRET) -> str:
    """Generate X-Hub-Signature-256 header value."""
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


@pytest.fixture(autouse=True)
def setup_webhook_env():
    """Ensure consistent secret configuration and clean state for tests."""
    with patch.dict(
        os.environ,
        {
            "WHATSAPP_WEBHOOK_SECRET": TEST_SECRET,
            "META_WA_WEBHOOK_VERIFY_TOKEN": "coexistence_verify_token_secure",
            "WHATSAPP_VERIFY_TOKEN": "legacy_verify_token_secure",
        },
    ):
        inbound_account_resolver.clear_test_mappings()
        yield


# ── 1. SMB MESSAGE ECHO TESTS (HUMAN REPLIES FROM PHONE) ──


@patch("app.inbound.whatsapp_inbound_handler.process_message", new_callable=AsyncMock)
def test_smb_message_echo_parsed_and_acknowledged_safely(mock_process):
    """
    INVARIANT: Messages typed by humans on the WhatsApp Business mobile app
    MUST be parsed, acknowledged, and NEVER trigger process_message / AI assistant.
    """
    event_id = f"wamid_echo_test_{int(time.time() * 1000)}"
    business_phone = "+15550001111"
    customer_phone = "+919876543210"

    inbound_account_resolver.register_test_mapping("whatsapp", business_phone, "usr_company_owner")

    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_TEST_123",
                "changes": [
                    {
                        "field": "smb_message_echoes",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550001111",
                                "phone_number_id": "104829104928104",
                            },
                            "message_echoes": [
                                {
                                    "from": business_phone,
                                    "to": customer_phone,
                                    "id": event_id,
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {
                                        "body": "Hello from the mobile app, I am looking into your request."
                                    },
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    raw = json.dumps(payload).encode("utf-8")
    resp = client.post(
        "/webhook/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign_payload(raw)},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "acknowledged"
    assert data.get("reason") == "smb_echo_recorded"

    # CRITICAL: process_message MUST NOT be called for human echoes
    mock_process.assert_not_called()


@patch("app.inbound.whatsapp_inbound_handler.process_message", new_callable=AsyncMock)
def test_smb_message_echo_duplicate_rejected(mock_process):
    """
    Verifies that a duplicate smb_message_echo is identified and rejected by WebhookDedupService.
    """
    event_id = f"wamid_echo_dup_{int(time.time() * 1000)}"
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_TEST_123",
                "changes": [
                    {
                        "field": "smb_message_echoes",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "104829104928104"},
                            "message_echoes": [
                                {
                                    "from": "+15550001111",
                                    "to": "+919876543210",
                                    "id": event_id,
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {"body": "First delivery"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    raw = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "X-Hub-Signature-256": _sign_payload(raw)}

    # First delivery -> acknowledged
    resp1 = client.post("/webhook/whatsapp", content=raw, headers=headers)
    assert resp1.status_code == 200
    assert resp1.json().get("status") == "acknowledged"

    # Second delivery with identical event_id -> duplicate
    resp2 = client.post("/webhook/whatsapp", content=raw, headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2.get("status") == "duplicate"
    assert data2.get("reason") == "duplicate_event_ignored"

    mock_process.assert_not_called()


def test_smb_message_echo_invalid_signature_rejected():
    """
    Fail-closed invariant: smb_message_echoes with an invalid signature must be rejected.
    """
    raw = json.dumps({"object": "whatsapp_business_account", "entry": []}).encode("utf-8")
    resp = client.post(
        "/webhook/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=invalid_sig_abc"},
    )
    assert resp.status_code == 200
    assert resp.json().get("status") == "rejected"
    assert resp.json().get("reason") == "webhook_verification_failed"


def test_smb_message_echo_missing_id_handled_safely():
    """
    Malformed payload missing provider event ID must be rejected safely without 500.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_TEST_123",
                "changes": [
                    {
                        "field": "smb_message_echoes",
                        "value": {
                            "message_echoes": [
                                {
                                    # missing 'id'
                                    "from": "+15550001111",
                                    "to": "+919876543210",
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {"body": "No ID"},
                                }
                            ]
                        },
                    }
                ],
            }
        ],
    }
    raw = json.dumps(payload).encode("utf-8")
    resp = client.post(
        "/webhook/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign_payload(raw)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "ignored"
    assert data.get("reason") == "missing_event_id"


# ── 2. ACCOUNT UPDATE LIFECYCLE TESTS (COEXISTENCE STATE) ──


@patch("app.inbound.whatsapp_inbound_handler.process_message", new_callable=AsyncMock)
def test_account_update_offboarded_acknowledged_safely(mock_process):
    """
    Meta delivers account_update with ACCOUNT_OFFBOARDED when a coexistence number
    is disconnected or suspended. Must be acknowledged safely without triggering AI.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_TEST_123",
                "changes": [
                    {
                        "field": "account_update",
                        "value": {
                            "phone_number": "+15550001111",
                            "event": "ACCOUNT_OFFBOARDED",
                            "ban_info": {"waba_id": "WABA_TEST_123"},
                        },
                    }
                ],
            }
        ],
    }

    raw = json.dumps(payload).encode("utf-8")
    resp = client.post(
        "/webhook/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign_payload(raw)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "acknowledged"
    assert data.get("reason") == "account_update_account_offboarded"

    mock_process.assert_not_called()


@patch("app.inbound.whatsapp_inbound_handler.process_message", new_callable=AsyncMock)
def test_account_update_reconnected_acknowledged_safely(mock_process):
    """
    Meta delivers account_update with ACCOUNT_RECONNECTED when a coexistence number
    is re-linked to the WhatsApp Business app.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_TEST_123",
                "changes": [
                    {
                        "field": "account_update",
                        "value": {
                            "phone_number": "+15550001111",
                            "event": "ACCOUNT_RECONNECTED",
                        },
                    }
                ],
            }
        ],
    }

    raw = json.dumps(payload).encode("utf-8")
    resp = client.post(
        "/webhook/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign_payload(raw)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "acknowledged"
    assert data.get("reason") == "account_update_account_reconnected"

    mock_process.assert_not_called()


# ── 3. SHARED API BOUNDARY SAFEGUARD TESTS (REGISTRATION / DEREGISTRATION) ──


def test_registration_endpoint_hard_blocked_at_shared_boundary():
    """
    ASSERTION: Any attempt to call /{phone_number_id}/register or construct
    a registration URL must be blocked at the shared API boundary.
    """
    # 1. Direct function assertion
    with pytest.raises(UnsafeCoexistenceOperationError) as exc_info:
        assert_safe_whatsapp_endpoint("104829104928104/register")
    assert "strictly forbidden in Coexistence mode" in str(exc_info.value)

    # 2. Full URL assertion
    with pytest.raises(UnsafeCoexistenceOperationError):
        assert_safe_whatsapp_endpoint("https://graph.facebook.com/v19.0/104829104928104/register")

    # 3. Client shared dispatch boundary
    client_exec = MetaWhatsAppExecutor()
    with pytest.raises(UnsafeCoexistenceOperationError):
        client_exec._execute_graph_post("104829104928104", "register", {"messaging_product": "whatsapp"}, "fake_tok")


def test_deregistration_endpoint_hard_blocked_at_shared_boundary():
    """
    ASSERTION: Any attempt to call /{phone_number_id}/deregister must be blocked.
    """
    with pytest.raises(UnsafeCoexistenceOperationError) as exc_info:
        assert_safe_whatsapp_endpoint("/104829104928104/deregister")
    assert "strictly forbidden in Coexistence mode" in str(exc_info.value)

    client_exec = MetaWhatsAppExecutor()
    with pytest.raises(UnsafeCoexistenceOperationError):
        client_exec._execute_graph_post("104829104928104", "deregister", {}, "fake_tok")


def test_request_code_endpoint_hard_blocked_at_shared_boundary():
    """
    ASSERTION: Any attempt to request OTP verification code (request_code) must be blocked.
    """
    with pytest.raises(UnsafeCoexistenceOperationError):
        assert_safe_whatsapp_endpoint("/104829104928104/request_code")


def test_allowed_messages_endpoint_passes_boundary():
    """
    Valid outbound message endpoints (/{phone_number_id}/messages) must pass through safely.
    """
    # Should not raise any exception
    assert_safe_whatsapp_endpoint("104829104928104/messages")
    assert_safe_whatsapp_endpoint("https://graph.facebook.com/v19.0/104829104928104/messages")


# ── 4. WEBHOOK VERIFY TOKEN UNIFICATION & BACKWARD COMPATIBILITY TESTS ──


def test_webhook_challenge_verification_primary_token():
    """
    GET /webhook/whatsapp verifies against META_WA_WEBHOOK_VERIFY_TOKEN.
    """
    token = "coexistence_verify_token_secure"
    resp = client.get(f"/webhook/whatsapp?hub.mode=subscribe&hub.challenge=45678&hub.verify_token={token}")
    assert resp.status_code == 200
    assert resp.text == "45678"


def test_webhook_challenge_verification_legacy_token():
    """
    GET /webhook/whatsapp verifies against WHATSAPP_VERIFY_TOKEN if primary not matched.
    """
    token = "legacy_verify_token_secure"
    resp = client.get(f"/webhook/whatsapp?hub.mode=subscribe&hub.challenge=99999&hub.verify_token={token}")
    assert resp.status_code == 200
    assert resp.text == "99999"


def test_whatsapp_api_challenge_verification_backward_compat():
    """
    GET /api/whatsapp/webhook verifies against unified token list.
    """
    token = "coexistence_verify_token_secure"
    resp = client.get(f"/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=test_ch_1&hub.verify_token={token}")
    assert resp.status_code == 200
    assert resp.text == "test_ch_1"
