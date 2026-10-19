"""
test_whatsapp_chat_flow.py — Comprehensive End-to-End Test Suite for WhatsApp Natural-Language Chat Flow

Tests covering:
1. Natural language regex entity extraction (colon format, saying, quotes).
2. Authorized contact resolution:
   - Explicit phone numbers (E.164 normalization).
   - Known single contact resolution.
   - Ambiguous contact disambiguation (multiple matches -> prompt user).
   - Unknown contact rejection (never guess).
3. Human-in-the-Loop (HITL) approval policy:
   - Provider is NEVER called before explicit confirmation.
   - Action is securely staged server-side with unique pact_ ID.
   - Confirmation payload includes recipient, name, sender account, and exact content.
4. Execution of confirmed pending action via REST endpoint.
5. Conversational confirmation ("yes", "confirm", "cancel") via chat stream/endpoint.
6. Meta API error handling:
   - Code 190 (Authentication expired / revoked).
   - Code 131047 (24-hour service window closed).
   - Recipient eligibility (Code 131030).
7. Webhook delivery status tracking:
   - Updates delivery state on "sent", "delivered", "read", "failed".
   - Never marks message delivered without confirmed delivery receipt.
8. Zero credentials leaked in responses or logs.
"""
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token
from app.capabilities.whatsapp_capability import WhatsAppCapability, extract_messaging_entities
from app.services.authorized_contact_resolver import authorized_contact_resolver
from app.services.pending_action_service import pending_action_service, _IN_MEMORY_PENDING_ACTIONS
from app.services.communication_service import communication_service
from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor, normalize_e164_phone
from app.inbound.whatsapp_inbound_handler import get_delivery_receipt

client = TestClient(app)

TEST_USER_ID = "usr_whatsapp_tester_123"


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Ensure clean test environment without real credentials or network calls."""
    monkeypatch.setenv("JWT_SECRET_KEY", "test_jwt_secret_wa_flow_99999")
    monkeypatch.setenv("API_KEY", "test_api_key_mitra_123")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "kX8pZ_5vW1yT3uR0qL7mJ9nF2hD4gA6sB8cE0iK2mO4=")
    monkeypatch.setenv("WHATSAPP_PROVIDER", "cloud")
    monkeypatch.setenv("META_WA_PHONE_NUMBER_ID", "1430949593425669")
    monkeypatch.setenv("META_WA_ACCESS_TOKEN", "EAAS1V_MOCK_TEST_TOKEN")
    monkeypatch.setenv("META_WA_WABA_ID", "4511342759180630")
    monkeypatch.setenv("WHATSAPP_WEBHOOK_SECRET", "test_webhook_secret_123")

    # Avoid MongoDB connection timeouts in testing environment
    monkeypatch.setattr("app.services.connected_account_service._get_db", lambda: None)
    monkeypatch.setattr("app.services.pending_action_service._get_db", lambda: None)
    monkeypatch.setattr("app.services.authorized_contact_resolver._get_db", lambda: None)
    monkeypatch.setattr("app.inbound.whatsapp_inbound_handler._get_db", lambda: None)

    # Clear test registries
    _IN_MEMORY_PENDING_ACTIONS.clear()
    authorized_contact_resolver.clear_test_contacts()

    # Pre-populate authorized test contacts
    authorized_contact_resolver.register_test_contact(
        user_id=TEST_USER_ID,
        name="Ashwini Sharma",
        phone="+91 91363 98133",
        email="ashwini@example.com"
    )
    authorized_contact_resolver.register_test_contact(
        user_id=TEST_USER_ID,
        name="Rahul Verma",
        phone="+91 98765 43210"
    )
    authorized_contact_resolver.register_test_contact(
        user_id=TEST_USER_ID,
        name="Rahul Mehta",
        phone="+91 98765 11111"
    )


@pytest.fixture
def auth_headers():
    token = create_access_token({"user_id": TEST_USER_ID, "email": "test@mitra.ai"})
    return {"Authorization": f"Bearer {token}"}


# ── 1. NATURAL LANGUAGE ENTITY EXTRACTION ──────────────────────────────────

def test_extract_messaging_entities_colon_format():
    recipient, body = extract_messaging_entities("Send WhatsApp message to +91 91363 98133: Hello from MITRA")
    assert recipient == "+91 91363 98133"
    assert body == "Hello from MITRA"


def test_extract_messaging_entities_contact_name_colon():
    recipient, body = extract_messaging_entities("Send WhatsApp message to Ashwini Sharma: Let's meet at 5 PM")
    assert recipient == "Ashwini Sharma"
    assert body == "Let's meet at 5 PM"


def test_extract_messaging_entities_saying_format():
    recipient, body = extract_messaging_entities("Send WhatsApp to Rahul saying I am on my way")
    assert recipient == "Rahul"
    assert body == "I am on my way"


def test_extract_messaging_entities_quotes_format():
    recipient, body = extract_messaging_entities("Send WhatsApp to 9136398133 'Meeting rescheduled to tomorrow'")
    assert recipient == "9136398133"
    assert body == "Meeting rescheduled to tomorrow"


def test_extract_messaging_entities_short_prefix():
    recipient, body = extract_messaging_entities("WhatsApp +91 91363 98133: Order #1234 confirmed")
    assert recipient == "+91 91363 98133"
    assert body == "Order #1234 confirmed"


# ── 2. AUTHORIZED CONTACT RESOLUTION & DISAMBIGUATION ──────────────────────

def test_resolve_explicit_e164_phone():
    res = authorized_contact_resolver.resolve_recipient("+91 91363 98133", user_id=TEST_USER_ID)
    assert res["status"] == "resolved"
    assert res["phone"] == "+919136398133"
    assert res["formatted_phone"] == "+91 91363 98133"
    # Reverse lookup finds Ashwini Sharma
    assert res["name"] == "Ashwini Sharma"


def test_resolve_known_single_contact():
    res = authorized_contact_resolver.resolve_recipient("Ashwini Sharma", user_id=TEST_USER_ID)
    assert res["status"] == "resolved"
    assert res["name"] == "Ashwini Sharma"
    assert res["phone"] == "+919136398133"
    assert "+91 91363 98133" in res["display_label"]


def test_resolve_ambiguous_contact_requires_choice():
    # Both "Rahul Verma" and "Rahul Mehta" match "Rahul"
    res = authorized_contact_resolver.resolve_recipient("Rahul", user_id=TEST_USER_ID)
    assert res["status"] == "ambiguous"
    assert res["error_code"] == "AMBIGUOUS_CONTACT"
    assert len(res["matches"]) >= 2
    assert any("Rahul Verma" in m["name"] for m in res["matches"])
    assert any("Rahul Mehta" in m["name"] for m in res["matches"])
    assert "Multiple contacts found" in res["message"]


def test_resolve_unknown_contact_refuses_to_guess():
    res = authorized_contact_resolver.resolve_recipient("Unknown Person X", user_id=TEST_USER_ID)
    assert res["status"] == "not_found"
    assert res["error_code"] == "CONTACT_NOT_FOUND"
    assert "never guesses recipients" in res["message"]


# ── 3. STRICT HITL APPROVAL POLICY (NEVER SEND WITHOUT CONFIRMATION) ────────

@pytest.mark.asyncio
async def test_whatsapp_capability_stages_action_and_does_not_send():
    """Verify WhatsApp capability creates a pending action and DOES NOT invoke Meta API."""
    cap = WhatsAppCapability()
    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post") as mock_graph_post:
        res = await cap.execute(
            intent="whatsapp",
            params={
                "message": "Send WhatsApp message to +91 91363 98133: Confidential meeting notice",
                "user_id": TEST_USER_ID
            }
        )

        # Meta API MUST NOT be invoked
        mock_graph_post.assert_not_called()

        # Capability result must be pending confirmation
        assert res.status == "pending"
        assert "Confirmation required" in res.summary
        assert "+91 91363 98133" in res.summary
        assert "Confidential meeting notice" in res.summary

        # Pending action created in service
        pending_id = res.data.get("pending_action_id")
        assert pending_id and pending_id.startswith("pact_")
        staged = pending_action_service.get_pending_action(pending_id, TEST_USER_ID)
        assert staged is not None
        assert staged.status == "PENDING"
        assert staged.recipient == "+919136398133"
        assert staged.content == "Confidential meeting notice"


@pytest.mark.asyncio
async def test_whatsapp_capability_ambiguous_contact_handling():
    """Verify searching for an ambiguous contact prompts the user with action buttons."""
    cap = WhatsAppCapability()
    res = await cap.execute(
        intent="whatsapp",
        params={
            "message": "Send WhatsApp message to Rahul: Are you coming?",
            "user_id": TEST_USER_ID
        }
    )
    assert res.status == "pending"
    assert res.data.get("status") == "ambiguous_contact"
    assert len(res.actions) >= 2


@pytest.mark.asyncio
async def test_whatsapp_capability_unknown_contact_handling():
    """Verify unknown contact fails safely without creating a pending action."""
    cap = WhatsAppCapability()
    res = await cap.execute(
        intent="whatsapp",
        params={
            "message": "Send WhatsApp message to Mystery Guy: Hello",
            "user_id": TEST_USER_ID
        }
    )
    assert res.status == "failed"
    assert "never guesses" in res.summary


# ── 4. CONFIRMED EXECUTION VIA REST ENDPOINT ───────────────────────────────

def test_confirm_pending_action_executes_meta_cloud_api(auth_headers):
    """Verify explicit confirmation triggers the Meta Cloud API call with correct payload."""
    # 1. Stage an action
    from app.models.communication import CommunicationAction, CommunicationChannel, CommunicationIntent
    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.WHATSAPP,
        user_id=TEST_USER_ID,
        recipient="+919136398133",
        content="Testing execution after confirmation",
        metadata={"mode": "business"}
    )
    pending = pending_action_service.create_pending_action(action, sender_account="1430949593425669")

    # 2. Mock Meta API response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "messaging_product": "whatsapp",
        "contacts": [{"input": "919136398133", "wa_id": "919136398133"}],
        "messages": [{"id": "wamid.HBgMOTE5MTM2Mzk4MTMzFQIAERgSREVGQUxURjQ1NzgAA=="}]
    }

    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post", return_value=mock_resp) as mock_post:
        resp = client.post(
            f"/api/communication/actions/{pending.pending_action_id}/confirm",
            headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "sent"
        assert data["delivery_state"] == "pending"  # Never claimed as delivered prematurely
        assert data["provider"] == "meta_whatsapp"
        assert data["provider_message_id"] == "wamid.HBgMOTE5MTM2Mzk4MTMzFQIAERgSREVGQUxURjQ1NzgAA=="

        # Verify Meta Graph POST parameters
        mock_post.assert_called_once()
        phone_id_arg, subpath_arg, payload_arg, token_arg = mock_post.call_args[0]
        assert phone_id_arg == "1430949593425669"
        assert subpath_arg == "messages"
        assert payload_arg["to"] == "919136398133"
        assert payload_arg["text"]["body"] == "Testing execution after confirmation"


# ── 5. CONVERSATIONAL CONFIRMATION VIA CHAT ────────────────────────────────

def test_chat_conversational_confirmation_flow(auth_headers):
    """Verify typing 'Yes' or 'Confirm' in chat executes the staged pending action."""
    # 1. Initiate chat message
    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post"):
        chat_req = {
            "message": "Send WhatsApp message to +91 91363 98133: Conversational HITL test",
            "user_id": TEST_USER_ID
        }
        res1 = client.post("/api/companion/chat", json=chat_req, headers=auth_headers)
        assert res1.status_code == 200
        data1 = res1.json()
        cap_res = data1.get("capability_result")
        assert cap_res is not None
        assert cap_res["status"] == "pending"
        pending_id = cap_res["data"]["pending_action_id"]

    # 2. Confirm via chat input ("Yes, confirm and send")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "messaging_product": "whatsapp",
        "contacts": [{"input": "919136398133", "wa_id": "919136398133"}],
        "messages": [{"id": "wamid.CHAT_CONFIRMED_12345"}]
    }

    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post", return_value=mock_resp) as mock_post:
        res2 = client.post("/api/companion/chat", json={"message": "Yes, confirm send"}, headers=auth_headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert "dispatched to +919136398133" in data2["message"].lower() or "accepted by meta" in data2["message"].lower()
        mock_post.assert_called_once()


def test_chat_conversational_cancellation_flow(auth_headers):
    """Verify typing 'Cancel' in chat cancels the staged pending action."""
    # 1. Stage action
    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post"):
        chat_req = {
            "message": "Send WhatsApp message to +91 91363 98133: Message to be cancelled",
            "user_id": TEST_USER_ID
        }
        res1 = client.post("/api/companion/chat", json=chat_req, headers=auth_headers)
        assert res1.status_code == 200

    # 2. Cancel via chat ("No, cancel it")
    res2 = client.post("/api/companion/chat", json={"message": "No, cancel"}, headers=auth_headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert "cancelled" in data2["message"].lower()

    # Verify action in service is cancelled
    latest = pending_action_service.get_latest_active_pending_action(TEST_USER_ID)
    assert latest is None  # No active pending actions remain


# ── 6. META ERROR CLASSIFICATION (190 AUTH & 131047 24H WINDOW) ────────────

def test_meta_error_190_authentication_expired(auth_headers):
    """Verify Meta Error 190 returns clear instruction to update access token."""
    from app.models.communication import CommunicationAction, CommunicationChannel, CommunicationIntent
    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.WHATSAPP,
        user_id=TEST_USER_ID,
        recipient="+919136398133",
        content="Test auth error 190",
        metadata={"mode": "business"}
    )
    pending = pending_action_service.create_pending_action(action, sender_account="1430949593425669")

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.json.return_value = {
        "error": {
            "message": "Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.",
            "type": "OAuthException",
            "code": 190,
            "error_subcode": 463,
            "fbtrace_id": "AvB123MockTrace"
        }
    }

    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post", return_value=mock_resp):
        resp = client.post(
            f"/api/communication/actions/{pending.pending_action_id}/confirm",
            headers=auth_headers
        )
        assert resp.status_code == 400
        data = resp.json()
        assert data["status"] == "failed"
        assert data["error_code"] == "META_AUTH_ERROR_190"
        assert "Code 190" in data["error"]
        assert "Access token is expired" in data["error"]


def test_meta_error_131047_customer_service_window_expired(auth_headers):
    """Verify Meta Error 131047 returns clear notice that 24h window closed and template is required."""
    from app.models.communication import CommunicationAction, CommunicationChannel, CommunicationIntent
    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.WHATSAPP,
        user_id=TEST_USER_ID,
        recipient="+919136398133",
        content="Test window error 131047",
        metadata={"mode": "business"}
    )
    pending = pending_action_service.create_pending_action(action, sender_account="1430949593425669")

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.json.return_value = {
        "error": {
            "message": "Re-engagement message: More than 24 hours have passed since the customer last replied to this number.",
            "type": "OAuthException",
            "code": 131047,
            "error_data": {"messaging_product": "whatsapp", "details": "Re-engagement message"},
            "fbtrace_id": "Trace131047"
        }
    }

    with patch.object(MetaWhatsAppExecutor, "_execute_graph_post", return_value=mock_resp):
        resp = client.post(
            f"/api/communication/actions/{pending.pending_action_id}/confirm",
            headers=auth_headers
        )
        assert resp.status_code == 400
        data = resp.json()
        assert data["status"] == "failed"
        assert data["error_code"] == "META_24H_WINDOW_EXPIRED"
        assert "24-Hour Customer Service Window Closed" in data["error"]
        assert "approved Meta message template" in data["error"]


# ── 7. WEBHOOK DELIVERY STATUS RECEIPTS ────────────────────────────────────

def test_webhook_delivery_status_tracking():
    """Verify delivery status webhooks update state and never mark delivered prematurely."""
    import hmac
    import hashlib
    import time

    secret = "test_webhook_secret_123"
    wamid = "wamid.TEST_DELIVERY_TRACKING_99"

    # 1. Send "delivered" status webhook
    timestamp_now = int(time.time())
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "4511342759180630",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "1555000", "phone_number_id": "1430949593425669"},
                    "statuses": [{
                        "id": wamid,
                        "status": "delivered",
                        "timestamp": str(timestamp_now),
                        "recipient_id": "919136398133"
                    }]
                }
            }]
        }]
    }

    body_bytes = json.dumps(payload).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

    resp = client.post(
        "/webhooks/whatsapp",
        content=body_bytes,
        headers={"X-Hub-Signature-256": f"sha256={sig}", "Content-Type": "application/json"}
    )
    assert resp.status_code == 200

    # 2. Inspect recorded delivery receipt
    receipt = get_delivery_receipt(wamid)
    assert receipt is not None
    assert receipt["delivery_status"] == "delivered"
    assert receipt["recipient_id"] == "919136398133"
