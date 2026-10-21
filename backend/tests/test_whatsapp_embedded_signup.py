"""
test_whatsapp_embedded_signup.py — Test Suite for Meta Embedded Signup (Coexistence)
Validates:
1. Server-side authorization code exchange (/api/whatsapp/embedded-signup/exchange).
2. Token inspection via /debug_token, WABA verification, and Phone Number details.
3. Automated webhook subscription (/{waba_id}/subscribed_apps).
4. Secure AES-256 encrypted storage against authenticated user (tenant isolation).
5. Sanitized response: no access token or app secret exposed.
6. Outbound send-message flow prioritizing user's connected account over system defaults.
7. Safeguard assertions ensuring no registration or deregistration endpoints are ever invoked.
"""

import os
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth_dependencies import get_current_user
from app.services.connected_account_service import connected_account_service
from app.executors.meta_whatsapp_executor import (
    MetaWhatsAppExecutor,
    assert_safe_whatsapp_endpoint,
    UnsafeCoexistenceOperationError
)

client = TestClient(app)

TEST_USER_ID = "mitra_test_user_777"
TEST_USER_OBJ = {
    "id": TEST_USER_ID,
    "user_id": TEST_USER_ID,
    "email": "user777@example.com",
    "name": "Test User 777",
    "is_guest": False
}


@pytest.fixture(autouse=True)
def clean_environment():
    """Ensure clean test environment and cleanup after each test."""
    test_env = {
        "META_APP_ID": "1325283592858854",
        "META_APP_SECRET": "mock_app_secret_abc123xyz789",
        "META_WA_API_VERSION": "v25.0",
        "META_WA_ACCESS_TOKEN": "system_fallback_access_token_global",
        "META_WA_PHONE_NUMBER_ID": "system_fallback_phone_global",
        "META_WA_WABA_ID": "system_fallback_waba_global",
    }
    with patch.dict(os.environ, test_env):
        try:
            connected_account_service.delete_connection(TEST_USER_ID, "whatsapp_business")
        except Exception:
            pass
        yield
        try:
            connected_account_service.delete_connection(TEST_USER_ID, "whatsapp_business")
        except Exception:
            pass


def test_embedded_signup_unauthenticated_rejected():
    """Requirement: Unauthenticated or guest users cannot connect WhatsApp Business."""
    def mock_guest_user():
        return {"id": "guest_user", "user_id": "guest_user", "is_guest": True}

    app.dependency_overrides[get_current_user] = mock_guest_user
    try:
        resp = client.post(
            "/api/whatsapp/embedded-signup/exchange",
            json={"code": "valid_auth_code_123"}
        )
        assert resp.status_code == 401
        assert "Authentication required" in resp.json().get("detail", "")
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_embedded_signup_missing_code_rejected():
    """Validation: Missing authorization code returns 422/400."""
    def mock_auth_user():
        return TEST_USER_OBJ

    app.dependency_overrides[get_current_user] = mock_auth_user
    try:
        resp = client.post(
            "/api/whatsapp/embedded-signup/exchange",
            json={"code": "   "}
        )
        assert resp.status_code in (400, 422)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@patch("requests.post")
@patch("requests.get")
def test_embedded_signup_successful_exchange_and_coexistence_storage(mock_get, mock_post):
    """
    Requirements 5, 6, 8, 9, 10:
    - Server-side exchange of auth code via Meta Graph API v25.0
    - Token inspection via /debug_token
    - Subscribes WABA to webhooks
    - Stores connection in ConnectedAccountService with coexistence_mode=True
    - Sanitizes response: NEVER exposes user_access_token or app_secret
    """
    def mock_auth_user():
        return TEST_USER_OBJ

    app.dependency_overrides[get_current_user] = mock_auth_user

    mock_user_token = "EAABw_USER_MOCK_TOKEN_XYZ"
    mock_waba_id = "112233445566778"
    mock_phone_id = "998877665544332"
    mock_display_phone = "+1 555-0199"

    # Define mock responses for requests.get
    def get_router(url, *args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "oauth/access_token" in url:
            resp.json.return_value = {
                "access_token": mock_user_token,
                "token_type": "bearer"
            }
        elif "debug_token" in url:
            resp.json.return_value = {
                "data": {
                    "app_id": "1325283592858854",
                    "is_valid": True,
                    "scopes": ["whatsapp_business_management", "whatsapp_business_messaging"],
                    "granular_scopes": [
                        {
                            "scope": "whatsapp_business_management",
                            "target_ids": [mock_waba_id]
                        }
                    ]
                }
            }
        elif f"/{mock_waba_id}" in url and "phone_numbers" not in url:
            resp.json.return_value = {
                "id": mock_waba_id,
                "name": "Acme Coexistence Store"
            }
        elif f"/{mock_phone_id}" in url:
            resp.json.return_value = {
                "id": mock_phone_id,
                "display_phone_number": mock_display_phone,
                "verified_name": "Acme Coexistence Store",
                "quality_rating": "GREEN"
            }
        else:
            resp.json.return_value = {}
        return resp

    mock_get.side_effect = get_router

    # Define mock response for requests.post (WABA webhook subscription)
    mock_sub_resp = MagicMock()
    mock_sub_resp.status_code = 200
    mock_sub_resp.json.return_value = {"success": True}
    mock_post.return_value = mock_sub_resp

    try:
        response = client.post(
            "/api/whatsapp/embedded-signup/exchange",
            json={
                "code": "test_meta_authorization_code_456",
                "waba_id": mock_waba_id,
                "phone_number_id": mock_phone_id
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Check sanitized response (No access_token or app_secret)
        assert data["status"] == "connected"
        assert data["provider"] == "whatsapp_business"
        assert data["phone_number_id"] == mock_phone_id
        assert data["waba_id"] == mock_waba_id
        assert data["display_phone_number"] == mock_display_phone
        assert data["verified_name"] == "Acme Coexistence Store"
        assert data["coexistence_mode"] is True
        assert "access_token" not in data
        assert "app_secret" not in data

        # Verify webhook subscription was called for this WABA
        mock_post.assert_called_once()
        sub_call_url = mock_post.call_args[0][0]
        assert f"/{mock_waba_id}/subscribed_apps" in sub_call_url

        # Verify connection was encrypted and stored in ConnectedAccountService
        stored = connected_account_service.get_user_connection(
            user_id=TEST_USER_ID,
            provider="whatsapp_business",
            include_decrypted_tokens=True
        )
        assert stored is not None
        assert stored["status"] == "connected"
        assert stored["access_token"] == mock_user_token
        assert stored["extra_data"]["coexistence_mode"] is True
        assert stored["extra_data"]["phone_number_id"] == mock_phone_id

        # Verify status endpoint reflects connection for this authenticated user
        status_resp = client.get("/api/whatsapp/business/status")
        assert status_resp.status_code == 200
        st_data = status_resp.json()
        assert st_data["status"] == "connected"
        assert st_data["source"] == "user_connected_account"
        assert st_data["can_send"] is True
        assert st_data["coexistence_mode"] is True
        assert st_data["phone_number_id"] == mock_phone_id
        assert st_data["display_phone_number"] == mock_display_phone

    finally:
        app.dependency_overrides.pop(get_current_user, None)


@patch("requests.post")
def test_send_message_prioritizes_connected_user_account_over_system(mock_post):
    """
    Requirement 7:
    Verify that existing MITRA WhatsApp send-message flow uses the authenticated
    user's connected account, NOT the system default, global account, or manual OTP fallback.
    """
    def mock_auth_user():
        return TEST_USER_OBJ

    app.dependency_overrides[get_current_user] = mock_auth_user

    # Setup user's connected account
    user_token = "EAABw_USER_SPECIFIC_TOKEN_999"
    user_phone_id = "888877776666"
    connected_account_service.create_connection(
        user_id=TEST_USER_ID,
        provider="whatsapp_business",
        email="+1 555-0199",
        access_token=user_token,
        provider_account_id=user_phone_id,
        extra_data={
            "phone_number_id": user_phone_id,
            "waba_id": "777766665555",
            "coexistence_mode": True
        }
    )

    # Mock Graph API send response
    mock_send_resp = MagicMock()
    mock_send_resp.status_code = 200
    mock_send_resp.json.return_value = {
        "messaging_product": "whatsapp",
        "contacts": [{"input": "919876543210", "wa_id": "919876543210"}],
        "messages": [{"id": "wamid.USER_SENT_MSG_123"}]
    }
    mock_post.return_value = mock_send_resp

    try:
        # 1. Test via API endpoint /api/whatsapp/business/send
        res = client.post(
            "/api/whatsapp/business/send",
            json={
                "to_phone": "+919876543210",
                "message": "Hello client, testing Coexistence message from user account."
            }
        )

        assert res.status_code == 200
        res_data = res.json()
        assert res_data["status"] == "success"
        assert res_data["source"] == "user_connected_account"
        assert res_data["message_id"] == "wamid.USER_SENT_MSG_123"

        # Verify exact call arguments: targeted user phone_id and user bearer token
        call_url = mock_post.call_args[0][0]
        call_headers = mock_post.call_args[1]["headers"]
        assert f"/{user_phone_id}/messages" in call_url
        assert call_headers["Authorization"] == f"Bearer {user_token}"
        # Ensure system fallback was NOT used
        assert "system_fallback" not in call_url
        assert "system_fallback" not in call_headers["Authorization"]

        # 2. Test via direct MetaWhatsAppExecutor Python instance with user_id
        executor = MetaWhatsAppExecutor()
        creds = executor.get_credentials(user_id=TEST_USER_ID)
        assert creds["source"] == "user_connected_account"
        assert creds["phone_number_id"] == user_phone_id
        assert creds["access_token"] == user_token

        # Unconnected user must fall back to system
        other_creds = executor.get_credentials(user_id="other_unconnected_user")
        assert other_creds["source"] == "system_env"
        assert other_creds["phone_number_id"] == "system_fallback_phone_global"

    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_coexistence_safeguards_block_registration_and_deregistration():
    """
    Requirement 9:
    Confirm no registration, deregistration, migration, or verification-code endpoint
    is ever invoked or accessible.
    """
    forbidden_endpoints = [
        "104829104928104/register",
        "104829104928104/deregister",
        "104829104928104/request_code",
        "104829104928104/verify_code",
        "https://graph.facebook.com/v25.0/104829104928104/register",
        "https://graph.facebook.com/v25.0/104829104928104/deregister",
        "https://graph.facebook.com/v25.0/104829104928104/request_code",
        "https://graph.facebook.com/v25.0/104829104928104/verify_code"
    ]

    for ep in forbidden_endpoints:
        with pytest.raises(UnsafeCoexistenceOperationError):
            assert_safe_whatsapp_endpoint(ep)

    # Valid messaging endpoint must pass boundary
    assert_safe_whatsapp_endpoint("104829104928104/messages")
    assert_safe_whatsapp_endpoint("https://graph.facebook.com/v25.0/104829104928104/messages")
