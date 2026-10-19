"""
backend/tests/test_comm_contract.py — Phase B.COMM-2 Unified Communication Contract Tests

Tests covering:
1. SEND_MESSAGE without user_id -> AUTH_REQUIRED
2. SEND_MESSAGE with user_default -> rejected
3. SEND_MESSAGE with another user's account_id -> rejected
4. SEND_MESSAGE without confirmation -> confirmation_required
5. SEND_MESSAGE with confirmation=true -> allowed to provider layer
6. DRAFT_MESSAGE -> no confirmation
7. READ_MESSAGES -> no confirmation
8. SEARCH_MESSAGES -> no confirmation
9. EMAIL contract normalization
10. WHATSAPP contract normalization
11. provider_message_id preserved
12. HTTP/provider acceptance does not become DELIVERED automatically
13. sensitive credentials never appear in confirmation payload
14. sensitive credentials never appear in normalized error
15. existing WHATSAPP_BUSINESS_REQUIRED behavior remains
16. client passing raw credentials in metadata rejected
"""

import pytest
from unittest.mock import MagicMock, patch

from app.models.communication import (
    CommunicationAction,
    CommunicationChannel,
    CommunicationConfirmationPayload,
    CommunicationIntent,
    CommunicationResult,
)
from app.services.communication_service import CommunicationService, communication_service
from app.services.connected_account_service import connected_account_service
from app.services.execution_service import ExecutionService


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test_jwt_secret_b_comm_2_contract_99999")
    monkeypatch.setenv("API_KEY", "test_api_key_mitra_123")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "kX8pZ_5vW1yT3uR0qL7mJ9nF2hD4gA6sB8cE0iK2mO4=")


# ── 1. SEND_MESSAGE without user_id -> AUTH_REQUIRED ───────────────────────

def test_1_send_message_without_user_id_rejected():
    with pytest.raises(ValueError, match="Authentication required"):
        CommunicationAction(
            intent=CommunicationIntent.SEND_MESSAGE,
            channel=CommunicationChannel.EMAIL,
            user_id="",
            recipient="test@example.com",
            content="Hello",
        )


# ── 2. SEND_MESSAGE with user_default -> rejected ──────────────────────────

def test_2_send_message_with_user_default_rejected():
    for bad_id in ("user_default", "default", "none", "null", "anonymous"):
        with pytest.raises(ValueError, match="Authentication required"):
            CommunicationAction(
                intent=CommunicationIntent.SEND_MESSAGE,
                channel=CommunicationChannel.EMAIL,
                user_id=bad_id,
                recipient="test@example.com",
                content="Hello",
            )


# ── 3. SEND_MESSAGE with another user's account_id -> rejected ──────────────

def test_3_send_message_with_another_users_account_rejected():
    user_a = "user_alpha_bcomm2"
    user_b = "user_beta_bcomm2"

    # User B owns account beta@gmail.com
    connected_account_service.create_connection(
        user_id=user_b,
        provider="gmail",
        email="beta@gmail.com",
        access_token="beta_token_123",
    )

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id=user_a,
        account_id="beta@gmail.com",  # Malicious attempt to use User B's account
        recipient="target@example.com",
        content="Hello from User A",
        confirmation_confirmed=True,
    )

    result = communication_service.execute_action(action)
    assert result.status == "failed"
    assert result.error_code == "ACCOUNT_NOT_AUTHORIZED"
    assert "does not belong to authenticated user" in (result.error or "")


# ── 4. SEND_MESSAGE without confirmation -> confirmation_required ───────────

def test_4_send_message_without_confirmation_returns_confirmation_required():
    user = "user_test_confirm_req"
    mock_email_exec = MagicMock()
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id=user,
        recipient="client@example.com",
        subject="Project Update",
        content="The deployment is ready for review.",
        confirmation_confirmed=False,  # Unconfirmed
    )

    result = comm_svc.execute_action(action)
    assert result.status == "confirmation_required"
    assert result.error_code == "CONFIRMATION_REQUIRED"
    assert result.delivery_state == "pending"
    assert result.confirmation is not None
    assert result.confirmation["type"] == "communication_confirmation"
    assert result.confirmation["recipient"] == "client@example.com"
    assert result.confirmation["subject"] == "Project Update"
    assert result.confirmation["content"] == "The deployment is ready for review."
    assert result.confirmation["requires_confirmation"] is True
    # Invariant: Provider executor MUST NOT be called!
    mock_email_exec.send_message.assert_not_called()


# ── 5. SEND_MESSAGE with confirmation=true -> allowed to provider layer ─────

def test_5_send_message_with_confirmation_allowed_to_provider():
    user = "user_test_confirmed"
    mock_email_exec = MagicMock()
    mock_email_exec.send_message.return_value = {
        "status": "success",
        "provider": "gmail",
        "message_id": "msg_gmail_12345",
        "from": "user@gmail.com",
    }
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id=user,
        recipient="colleague@example.com",
        subject="Approved meeting",
        content="Confirmed meeting at 2 PM.",
        confirmation_confirmed=True,  # Confirmed!
    )

    result = comm_svc.execute_action(action)
    assert result.status == "sent"
    assert result.delivery_state == "sent"
    assert result.provider == "gmail"
    assert result.provider_message_id == "msg_gmail_12345"
    mock_email_exec.send_message.assert_called_once()


# ── 6. DRAFT_MESSAGE -> no confirmation ─────────────────────────────────────

def test_6_draft_message_no_confirmation_required():
    user = "user_test_draft"
    mock_email_exec = MagicMock()
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.DRAFT_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id=user,
        recipient="draft_recipient@example.com",
        content="Draft body",
        confirmation_confirmed=False,
    )

    result = comm_svc.execute_action(action)
    assert result.status == "accepted"
    assert result.delivery_state == "pending"
    # Draft must not invoke outbound delivery executor
    mock_email_exec.send_message.assert_not_called()


# ── 7. READ_MESSAGES -> no confirmation ─────────────────────────────────────

def test_7_read_messages_no_confirmation_required():
    user = "user_test_read"
    comm_svc = CommunicationService()

    action = CommunicationAction(
        intent=CommunicationIntent.READ_MESSAGES,
        channel=CommunicationChannel.EMAIL,
        user_id=user,
        confirmation_confirmed=False,
    )

    result = comm_svc.execute_action(action)
    assert result.status == "accepted"
    assert result.delivery_state == "unknown"


# ── 8. SEARCH_MESSAGES -> no confirmation ───────────────────────────────────

def test_8_search_messages_no_confirmation_required():
    user = "user_test_search"
    comm_svc = CommunicationService()

    action = CommunicationAction(
        intent=CommunicationIntent.SEARCH_MESSAGES,
        channel=CommunicationChannel.WHATSAPP,
        user_id=user,
        content="project deadline",
        confirmation_confirmed=False,
    )

    result = comm_svc.execute_action(action)
    assert result.status == "accepted"


# ── 9. EMAIL contract normalization ─────────────────────────────────────────

def test_9_email_contract_normalization():
    action = CommunicationAction(
        intent="SEND_EMAIL",  # String normalization test
        channel="GMAIL",      # String normalization test
        user_id="user_norm_test",
        recipient="norm@example.com",
        subject="Test Normalization",
        content="Content text",
    )
    assert action.intent == CommunicationIntent.SEND_MESSAGE
    assert action.channel == CommunicationChannel.EMAIL

    res = communication_service.execute_action(action)
    assert res.channel == CommunicationChannel.EMAIL
    assert res.status == "confirmation_required"
    assert res.confirmation["channel"] == "EMAIL"


# ── 10. WHATSAPP contract normalization ─────────────────────────────────────

def test_10_whatsapp_contract_normalization():
    action = CommunicationAction(
        intent="send_whatsapp",  # String normalization test
        channel="WA",            # String normalization test
        user_id="user_norm_wa",
        recipient="+919876543210",
        content="Hello on WhatsApp",
    )
    assert action.intent == CommunicationIntent.SEND_MESSAGE
    assert action.channel == CommunicationChannel.WHATSAPP

    res = communication_service.execute_action(action)
    assert res.channel == CommunicationChannel.WHATSAPP
    assert res.status == "confirmation_required"
    assert res.confirmation["channel"] == "WHATSAPP"


# ── 11. provider_message_id preserved ───────────────────────────────────────

def test_11_provider_message_id_preserved():
    mock_email_exec = MagicMock()
    mock_email_exec.send_message.return_value = {
        "status": "success",
        "provider": "gmail",
        "message_id": "1894a7cb08901abc",
        "from": "alice@gmail.com",
    }
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id="alice_user",
        recipient="bob@example.com",
        content="Meeting notes",
        confirmation_confirmed=True,
    )
    result = comm_svc.execute_action(action)
    assert result.provider_message_id == "1894a7cb08901abc"


# ── 12. HTTP/provider acceptance does not become DELIVERED automatically ─────

def test_12_provider_acceptance_not_automatically_delivered():
    """
    CRITICAL INVARIANT:
    HTTP 200 / provider API acceptance MUST NOT automatically be represented as DELIVERED.
    For asynchronous channels, SENT/ACCEPTED -> pending/sent, NEVER delivered.
    """
    mock_email_exec = MagicMock()
    mock_email_exec.send_message.return_value = {
        "status": "success",
        "provider": "gmail",
        "message_id": "msg_001",
    }
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id="user_async_check",
        recipient="test@example.com",
        content="Async check",
        confirmation_confirmed=True,
    )
    result = comm_svc.execute_action(action)
    assert result.status == "sent"
    # MUST NOT be delivered
    assert result.delivery_state != "delivered"
    assert result.delivery_state in ("sent", "pending")


# ── 13. Sensitive credentials never appear in confirmation payload ──────────

def test_13_sensitive_credentials_never_in_confirmation_payload():
    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id="user_sec_check",
        recipient="recipient@example.com",
        content="Secret message",
        confirmation_confirmed=False,
    )
    result = communication_service.execute_action(action)
    assert result.confirmation is not None

    conf_str = str(result.confirmation)
    for forbidden in ("password", "access_token", "refresh_token", "auth_token", "client_secret"):
        assert forbidden not in conf_str.lower()


# ── 14. Sensitive credentials never appear in normalized error ──────────────

def test_14_sensitive_credentials_never_in_normalized_error():
    mock_email_exec = MagicMock()
    mock_email_exec.send_message.return_value = {
        "status": "error",
        "error": "Authentication failed for user account",
    }
    comm_svc = CommunicationService(email_executor=mock_email_exec)

    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.EMAIL,
        user_id="user_err_check",
        recipient="target@example.com",
        content="Body",
        confirmation_confirmed=True,
    )
    result = comm_svc.execute_action(action)
    assert result.status == "failed"
    err_str = str(result.to_dict())
    for forbidden in ("password", "access_token", "refresh_token", "auth_token"):
        assert forbidden not in err_str.lower()


# ── 15. Existing WHATSAPP_BUSINESS_REQUIRED behavior remains ────────────────

def test_15_existing_whatsapp_business_required_remains():
    action = CommunicationAction(
        intent=CommunicationIntent.SEND_MESSAGE,
        channel=CommunicationChannel.WHATSAPP,
        user_id="user_wa_biz_test",
        recipient="+1234567890",
        content="Hello",
        confirmation_confirmed=True,  # Even when confirmed
    )
    result = communication_service.execute_action(action)
    assert result.status == "failed"
    assert result.error_code == "CREDENTIALS_MISSING"
    assert "credentials not configured" in (result.error or "").lower()


# ── 16. Client passing raw credentials in metadata rejected ─────────────────

def test_16_client_passing_raw_credentials_in_metadata_rejected():
    for bad_key in ("password", "access_token", "refresh_token", "auth_token", "api_key", "secret"):
        with pytest.raises(ValueError, match="client-supplied credential"):
            CommunicationAction(
                intent=CommunicationIntent.SEND_MESSAGE,
                channel=CommunicationChannel.EMAIL,
                user_id="user_valid_id",
                recipient="test@example.com",
                content="Hello",
                metadata={bad_key: "forbidden_secret_value"},
            )
