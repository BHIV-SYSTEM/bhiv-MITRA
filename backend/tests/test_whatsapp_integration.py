"""
test_whatsapp_integration.py — Comprehensive Test Suite for Dual-Mode WhatsApp Integration
Covers:
1. E.164 Phone Normalization & Validation
2. Personal WhatsApp Click-to-Chat URL Generation & Safety Notices
3. AI Draft Synthesizer Endpoint
4. Meta WhatsApp Business API Status, Connect, Disconnect
5. Meta Webhook Verification (hub.challenge) and Event Delivery
6. Dual-Mode WhatsApp Executor & CommunicationService Integration
"""

import os
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.executors.meta_whatsapp_executor import (
    normalize_e164_phone,
    generate_personal_wa_link,
    MetaWhatsAppExecutor
)
from app.executors.whatsapp_executor import WhatsAppExecutor


client = TestClient(app)


# ── 1. PHONE NORMALIZATION & VALIDATION TESTS ──

def test_normalize_indian_10_digit_phone():
    res = normalize_e164_phone("9876543210")
    assert res["valid"] is True
    assert res["e164"] == "+919876543210"
    assert res["clean_digits"] == "919876543210"


def test_normalize_phone_with_leading_zero():
    res = normalize_e164_phone("09876543210")
    assert res["valid"] is True
    assert res["e164"] == "+919876543210"
    assert res["clean_digits"] == "919876543210"


def test_normalize_international_e164():
    res = normalize_e164_phone("+1 415 555 2671")
    assert res["valid"] is True
    assert res["e164"] == "+14155552671"
    assert res["clean_digits"] == "14155552671"


def test_normalize_invalid_short_phone():
    res = normalize_e164_phone("12345")
    assert res["valid"] is False
    assert "Invalid phone number length" in res["error"]


def test_normalize_invalid_letters_phone():
    res = normalize_e164_phone("abcdefghij")
    assert res["valid"] is False


# ── 2. PERSONAL WHATSAPP CLICK TO CHAT TESTS ──

def test_generate_personal_wa_link_encoding():
    message = "Hello Rahul! Are we meeting at 5 PM? Let's confirm & meet."
    res = generate_personal_wa_link("9876543210", message)
    assert res["status"] == "ready"
    assert res["phone_e164"] == "+919876543210"
    assert "https://wa.me/919876543210?text=" in res["url"]
    # Check proper RFC 3986 encoding: spaces encoded as %20 or +, & encoded as %26
    assert "%26" in res["url"]
    assert "review" in res["notice"].lower()
    assert res["manual_send_required"] is True


def test_personal_prepare_api_endpoint():
    payload = {
        "phone": "+91 9876543210",
        "message": "I will arrive by 5 PM.",
        "country_code": "91"
    }
    response = client.post("/api/whatsapp/personal/prepare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["mode"] == "personal"
    assert data["manual_send_required"] is True
    assert data["delivery_verifiable"] is False
    assert "https://wa.me/919876543210" in data["wa_url"]


def test_personal_prepare_invalid_phone_returns_400():
    payload = {
        "phone": "invalid_number",
        "message": "Test"
    }
    response = client.post("/api/whatsapp/personal/prepare", json=payload)
    assert response.status_code == 400


# ── 3. AI DRAFT GENERATOR TESTS ──

def test_ai_draft_running_late():
    payload = {
        "instruction": "Tell Rahul I am running late and will arrive at 6:30 PM",
        "recipient_name": "Rahul",
        "tone": "friendly"
    }
    response = client.post("/api/whatsapp/personal/draft", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Rahul" in data["draft"]
    assert "6:30 PM" in data["draft"]
    assert "late" in data["draft"].lower()


def test_ai_draft_reschedule():
    payload = {
        "instruction": "Ask Priya to reschedule the meeting",
        "recipient_name": "Priya",
        "tone": "professional"
    }
    response = client.post("/api/whatsapp/personal/draft", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "reschedule" in data["draft"].lower()


# ── 4. BUSINESS WHATSAPP PLATFORM TESTS ──

def test_business_status_disconnected_by_default():
    with patch.dict(os.environ, {"META_WA_ACCESS_TOKEN": "", "META_WA_PHONE_NUMBER_ID": ""}, clear=True):
        response = client.get("/api/whatsapp/business/status?user_id=test_unconnected_user")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "disconnected"
        assert data["mode"] == "business"
        assert data["can_send"] is False


def test_business_connect_and_status():
    connect_payload = {
        "phone_number_id": "104829104928104",
        "waba_id": "192837465019283",
        "access_token": "EAABw_TEST_TOKEN_1234567890",
        "phone_display_number": "+1 555-0100"
    }
    response = client.post("/api/whatsapp/business/connect?user_id=test_user_wa", json=connect_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "connected"
    assert data["phone_number_id"] == "104829104928104"

    # Status check
    status_res = client.get("/api/whatsapp/business/status?user_id=test_user_wa")
    assert status_res.status_code == 200
    st_data = status_res.json()
    assert st_data["status"] == "connected"
    assert st_data["can_send"] is True
    # Invariant: Secret token must be masked, not exposed raw
    assert st_data["masked_token"].startswith("EAABw_...")
    assert "TEST_TOKEN" not in st_data["masked_token"]


def test_business_disconnect():
    disc_res = client.post("/api/whatsapp/business/disconnect?user_id=test_user_wa")
    assert disc_res.status_code == 200
    assert disc_res.json()["status"] == "disconnected"


# ── 5. META WEBHOOK CHALLENGE VERIFICATION TESTS ──

def test_meta_webhook_challenge_verification_success():
    verify_token = "mitra_wa_verify_token_secure"
    with patch.dict(os.environ, {"META_WA_WEBHOOK_VERIFY_TOKEN": verify_token}):
        response = client.get(f"/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=test_challenge_code_123&hub.verify_token={verify_token}")
        assert response.status_code == 200
        assert response.text == "test_challenge_code_123"


def test_meta_webhook_challenge_verification_failure():
    response = client.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=test&hub.verify_token=wrong_token")
    assert response.status_code == 403


def test_meta_webhook_event_receiver():
    event_payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "192837465019283",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15550100", "phone_number_id": "104829104928104"},
                    "statuses": [{
                        "id": "wamid.HBgLMTU1NTAxMDA",
                        "status": "delivered",
                        "timestamp": "1618317000",
                        "recipient_id": "919876543210"
                    }]
                },
                "field": "messages"
            }]
        }]
    }
    response = client.post("/api/whatsapp/webhook", json=event_payload)
    assert response.status_code == 200
    assert response.json()["status"] == "EVENT_RECEIVED"


# ── 6. DUAL-MODE EXECUTOR INTEGRATION TESTS ──

def test_whatsapp_executor_personal_mode_returns_click_to_chat():
    executor = WhatsAppExecutor()
    res = executor.send_message(
        to_number="9876543210",
        message="Hello Mitra Personal test",
        trace_id="test_trace_1",
        mode="personal"
    )
    assert res["status"] == "success"
    assert res["mode"] == "personal"
    assert res["delivery_state"] == "manual_action_required"
    assert "https://wa.me/919876543210" in res["url"]
    assert "notice" in res


def test_whatsapp_executor_business_mode_without_creds_fails_safely():
    executor = WhatsAppExecutor()
    with patch.dict(os.environ, {"META_WA_ACCESS_TOKEN": "", "META_WA_PHONE_NUMBER_ID": ""}, clear=True):
        res = executor.send_message(
            to_number="9876543210",
            message="Hello Mitra Business test",
            trace_id="test_trace_2",
            user_id="unregistered_biz_user",
            mode="business"
        )
        assert res["status"] == "error"
        assert res["error_code"] == "CREDENTIALS_MISSING"
        assert "credentials not configured" in res["error"].lower()
