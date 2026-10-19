"""
test_comm_security.py — Phase B.COMM-1 Communication Security Remediation Tests

Comprehensive security test suite covering all 20 Phase B.COMM-1 security verification points:
1. Missing authenticated user_id
2. Empty authenticated user_id
3. user_default rejection
4. Frontend-supplied user_id ignored/rejected
5. User A cannot access User B Gmail
6. User A cannot access User B Microsoft
7. User A cannot access User B WhatsApp
8. User A cannot access User B custom email
9. Hardcoded password absent
10. No plaintext credential relay
11. SSRF localhost blocked
12. SSRF 127.0.0.1 blocked
13. SSRF RFC1918 blocked
14. SSRF metadata IP blocked
15. IPv6 loopback blocked
16. DNS resolution failure handled safely
17. TLS verification remains enabled
18. No credential leakage in errors
19. No token leakage in responses
20. System OTP still functions through its separate path
"""

import os
import inspect
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token
from app.services.execution_service import ExecutionService
from app.executors.email_executor import EmailExecutor, validate_safe_mail_host
from app.executors.whatsapp_executor import WhatsAppExecutor
from app.capabilities.email_capability import EmailCapability
from app.capabilities.whatsapp_capability import WhatsAppCapability
from app.services.connected_account_service import connected_account_service


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test_jwt_secret_phase_b_comm_1_security_99999")
    monkeypatch.setenv("API_KEY", "test_api_key_mitra_123")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "kX8pZ_5vW1yT3uR0qL7mJ9nF2hD4gA6sB8cE0iK2mO4=")
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("ENVIRONMENT", "production")


def get_auth_headers(user_id: str):
    token = create_access_token({"user_id": user_id, "email": f"{user_id}@mitra.test"})
    return {"Authorization": f"Bearer {token}"}


# ── 1. Missing Authenticated user_id ────────────────────────────────────────

def test_1_missing_authenticated_user_id():
    """Verify ExecutionService rejects user-owned email and whatsapp when user_id is missing/None."""
    exec_svc = ExecutionService()

    # Email without user_id
    email_res = exec_svc.execute_action("email", {
        "to": "target@example.com",
        "message": "Hello world",
        # user_id omitted
    })
    assert email_res["status"] == "error"
    assert email_res.get("error_code") == "AUTH_REQUIRED"
    assert "authenticated, non-default user_id" in email_res["error"]

    # WhatsApp without user_id
    wa_res = exec_svc.execute_action("whatsapp", {
        "to": "+1234567890",
        "message": "Hello world",
        # user_id omitted
    })
    assert wa_res["status"] == "error"
    assert wa_res.get("error_code") == "AUTH_REQUIRED"
    assert "authenticated, non-default user_id" in wa_res["error"]


# ── 2. Empty Authenticated user_id ──────────────────────────────────────────

def test_2_empty_authenticated_user_id():
    """Verify ExecutionService and executors reject empty string or whitespace user_id."""
    exec_svc = ExecutionService()

    for empty_val in ("", "   "):
        res_email = exec_svc.execute_action("email", {
            "to": "target@example.com",
            "message": "Test empty",
            "user_id": empty_val
        })
        assert res_email["status"] == "error"
        assert res_email.get("error_code") == "AUTH_REQUIRED"

        res_wa = exec_svc.execute_action("whatsapp", {
            "to": "+1234567890",
            "message": "Test empty",
            "user_id": empty_val
        })
        assert res_wa["status"] == "error"
        assert res_wa.get("error_code") == "AUTH_REQUIRED"


# ── 3. user_default Rejection ───────────────────────────────────────────────

def test_3_user_default_rejection():
    """Verify ExecutionService explicitly rejects 'user_default', 'default', 'none', 'null'."""
    exec_svc = ExecutionService()

    for bad_id in ("user_default", "default", "none", "null", "USER_DEFAULT"):
        res = exec_svc.execute_action("email", {
            "to": "test@example.com",
            "message": "Hello",
            "user_id": bad_id
        })
        assert res["status"] == "error"
        assert res.get("error_code") == "AUTH_REQUIRED"

        res_wa = exec_svc.execute_action("whatsapp", {
            "to": "+1234567890",
            "message": "Hello",
            "user_id": bad_id
        })
        assert res_wa["status"] == "error"
        assert res_wa.get("error_code") == "AUTH_REQUIRED"


# ── 4. Frontend-Supplied user_id Ignored / Rejected ─────────────────────────

def test_4_frontend_supplied_user_id_ignored(client):
    """
    Verify client submitting {user_id: 'victim_user'} in request body cannot force
    MITRA to execute under victim's identity. The backend derives identity strictly from JWT.
    """
    user_attacker = "attacker_101"
    victim = "victim_202"
    headers = get_auth_headers(user_attacker)

    with patch("app.companion.companion_orchestrator.companion_orchestrator.process") as mock_proc:
        mock_proc.return_value = MagicMock(to_dict=lambda: {"status": "ok", "reply": "Done"})

        response = client.post(
            "/api/companion/chat",
            json={
                "message": "Send email to client",
                "user_id": victim  # Malicious spoof attempt in body
            },
            headers=headers
        )

        assert response.status_code == 200
        # Verify orchestrator was called with JWT user_id (attacker), NOT victim
        mock_proc.assert_called_once()
        called_kwargs = mock_proc.call_args[1]
        assert called_kwargs["user_id"] == user_attacker
        assert called_kwargs["user_id"] != victim


# ── 5. User A Cannot Access User B Gmail ────────────────────────────────────

def test_5_user_a_cannot_access_user_b_gmail():
    """Verify User A cannot access or send using User B's Gmail connection."""
    user_a = "user_alpha_test"
    user_b = "user_beta_test"

    # Seed User B with a connected Gmail account
    connected_account_service.create_connection(
        user_id=user_b,
        provider="gmail",
        email="beta@gmail.com",
        access_token="beta_secret_token_123",
        scopes=["https://mail.google.com/"]
    )

    # User A tries to lookup gmail connection
    conn_a = connected_account_service.get_user_connection(user_id=user_a, provider="gmail")
    assert conn_a is None

    # User B can see their own
    conn_b = connected_account_service.get_user_connection(user_id=user_b, provider="gmail")
    assert conn_b is not None
    assert conn_b["email"] == "beta@gmail.com"

    # User A attempting to execute email should NOT find User B's credentials
    email_exec = EmailExecutor()
    with patch.object(email_exec, "send_email_gmail_api") as mock_gmail_send:
        res = email_exec.send_message(
            to_email="recipient@example.com",
            subject="Test",
            message="Body",
            trace_id="t1",
            user_id=user_a
        )
        # Should fail with no account connected for user_a
        assert res["status"] == "error"
        assert "No connected email account found for authenticated user" in res["error"]
        mock_gmail_send.assert_not_called()


# ── 6. User A Cannot Access User B Microsoft ────────────────────────────────

def test_6_user_a_cannot_access_user_b_microsoft():
    """Verify User A cannot access or send using User B's Microsoft account."""
    user_a = "user_alpha_ms"
    user_b = "user_beta_ms"

    connected_account_service.create_connection(
        user_id=user_b,
        provider="microsoft",
        email="beta@outlook.com",
        access_token="beta_ms_token_999",
        scopes=["Mail.Send"]
    )

    # User A looks for microsoft connection
    conn_a = connected_account_service.get_user_connection(user_id=user_a, provider="microsoft")
    assert conn_a is None

    email_exec = EmailExecutor()
    res = email_exec.send_message(
        to_email="recipient@example.com",
        subject="Test",
        message="Body",
        trace_id="t2",
        user_id=user_a
    )
    assert res["status"] == "error"
    assert "No connected email account found for authenticated user" in res["error"]


# ── 7. User A Cannot Access User B WhatsApp ─────────────────────────────────

def test_7_user_a_cannot_access_user_b_whatsapp():
    """Verify User A cannot access or use User B's WhatsApp connection."""
    user_a = "user_alpha_wa"
    user_b = "user_beta_wa"

    connected_account_service.create_connection(
        user_id=user_b,
        provider="whatsapp",
        email="+19876543210",
        provider_account_id="+19876543210"
    )

    # User A cannot find connection
    conn_a = connected_account_service.get_user_connection(user_id=user_a, provider="whatsapp")
    assert conn_a is None

    wa_exec = WhatsAppExecutor()
    res = wa_exec.send_message(
        to_number="+15555555555",
        message="Hello",
        trace_id="t3",
        user_id=user_a,
        is_system_otp=False
    )
    # User-owned messaging requires Meta WhatsApp Business
    assert res["status"] == "error"
    assert res.get("error_code") == "CREDENTIALS_MISSING"
    assert "credentials not configured" in res.get("error", "").lower()


# ── 8. User A Cannot Access User B Custom Email ─────────────────────────────

def test_8_user_a_cannot_access_user_b_custom_email():
    """Verify User A cannot access custom SMTP credentials configured for User B."""
    user_a = "user_alpha_smtp"
    user_b = "user_beta_smtp"

    email_exec = EmailExecutor()
    with patch("app.executors.email_executor._get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        # DB has credentials for user_b only
        def find_one_side_effect(query):
            if query.get("user_id") == user_b:
                return {
                    "user_id": user_b,
                    "smtp": {
                        "host": "mail.beta-domain.com",
                        "port": 587,
                        "username": "beta@beta-domain.com",
                        "password": "encrypted_password_b"
                    }
                }
            return None

        mock_db.__getitem__.return_value.find_one.side_effect = find_one_side_effect

        # User A executes
        res = email_exec.send_message(
            to_email="recipient@example.com",
            subject="Test",
            message="Body",
            trace_id="t4",
            user_id=user_a
        )
        assert res["status"] == "error"
        assert "No connected email account found for authenticated user" in res["error"]


# ── 9. Hardcoded Password Absent ────────────────────────────────────────────

def test_9_hardcoded_password_absent():
    """Verify the hardcoded fallback app password 'ejcotfrrxmesnebv' is purged from codebase."""
    import app.executors.email_executor as ee_mod
    src = inspect.getsource(ee_mod)
    assert "ejcotfrrxmesnebv" not in src
    assert "blackholeinfiverse20@gmail.com" not in src


# ── 10. No Plaintext Credential Relay ───────────────────────────────────────

def test_10_no_plaintext_credential_relay():
    """Verify send_email_vercel_relay is completely removed and no plaintext relay exists."""
    import app.executors.email_executor as ee_mod
    assert not hasattr(ee_mod, "send_email_vercel_relay")
    assert not hasattr(ee_mod.EmailExecutor, "send_email_vercel_relay")
    src = inspect.getsource(ee_mod)
    assert "vercel.app" not in src
    assert "email-relay" not in src


# ── 11. SSRF Localhost Blocked ──────────────────────────────────────────────

def test_11_ssrf_localhost_blocked():
    """Verify validate_safe_mail_host blocks 'localhost'."""
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("localhost")


# ── 12. SSRF 127.0.0.1 Blocked ──────────────────────────────────────────────

def test_12_ssrf_127_0_0_1_blocked():
    """Verify validate_safe_mail_host blocks loopback IPv4 '127.0.0.1' and entire 127.0.0.0/8."""
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("127.0.0.1")
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("127.0.1.5")


# ── 13. SSRF RFC1918 Blocked ────────────────────────────────────────────────

def test_13_ssrf_rfc1918_blocked():
    """Verify validate_safe_mail_host blocks 10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16."""
    blocked_hosts = ["10.0.0.1", "10.254.1.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.168.100.50"]
    for host in blocked_hosts:
        with pytest.raises(ValueError, match="SSRF protection"):
            validate_safe_mail_host(host)


# ── 14. SSRF Metadata IP Blocked ────────────────────────────────────────────

def test_14_ssrf_metadata_ip_blocked():
    """Verify validate_safe_mail_host blocks cloud metadata IP 169.254.169.254 and link-local range."""
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("169.254.169.254")
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("169.254.1.1")


# ── 15. IPv6 Loopback Blocked ───────────────────────────────────────────────

def test_15_ipv6_loopback_blocked():
    """Verify validate_safe_mail_host blocks IPv6 loopback ::1 and link-local fe80::/10."""
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("::1")
    with pytest.raises(ValueError, match="SSRF protection"):
        validate_safe_mail_host("fe80::1")


# ── 16. DNS Resolution Failure Handled Safely ───────────────────────────────

def test_16_dns_resolution_failure_handled_safely():
    """Verify non-existent host raises clean ValueError without unhandled exceptions."""
    with pytest.raises(ValueError, match="Failed to resolve mail host|DNS resolution error"):
        validate_safe_mail_host("non-existent-domain-xyz-999-unresolvable.invalid")


# ── 17. TLS Verification Remains Enabled ────────────────────────────────────

def test_17_tls_verification_remains_enabled():
    """Verify send_email_smtp creates secure SSL context with cert verification."""
    email_exec = EmailExecutor()
    src = inspect.getsource(email_exec.send_email_smtp)
    assert "ssl.create_default_context" in src
    # Ensure CERT_NONE or check_hostname=False is NOT set
    assert "CERT_NONE" not in src
    assert "check_hostname = False" not in src


# ── 18. No Credential Leakage in Errors ──────────────────────────────────────

def test_18_no_credential_leakage_in_errors():
    """Verify errors returned by ExecutionService and executors never leak secrets."""
    secret_pass = "super_secret_app_password_999!"
    exec_svc = ExecutionService()

    # Pass malicious or failing payload with credential
    res = exec_svc.execute_action("email", {
        "user_id": "test_user",
        "to": "test@example.com",
        "secret_token": secret_pass
    })

    # The error string must never echo raw secret
    err_str = str(res)
    assert secret_pass not in err_str


# ── 19. No Token Leakage in Responses ───────────────────────────────────────

def test_19_no_token_leakage_in_responses(client):
    """Verify /api/integrations responses never include access tokens, refresh tokens, or app passwords."""
    user_id = "test_user_safe_resp"
    headers = get_auth_headers(user_id)

    connected_account_service.create_connection(
        user_id=user_id,
        provider="gmail",
        email="safe@gmail.com",
        access_token="secret_access_token_never_leak_xyz",
        refresh_token="secret_refresh_token_never_leak_abc"
    )

    response = client.get("/api/integrations", headers=headers)
    assert response.status_code == 200
    data = response.json()
    resp_text = response.text

    assert "secret_access_token_never_leak_xyz" not in resp_text
    assert "secret_refresh_token_never_leak_abc" not in resp_text
    assert "access_token" not in resp_text
    assert "refresh_token" not in resp_text


# ── 20. System OTP Still Functions Through Separate Path ────────────────────

def test_20_system_otp_functions_through_separate_path():
    """
    Verify WhatsAppExecutor.send_message with is_system_otp=True executes
    through the system Twilio path and does not require a user-owned connected account.
    """
    wa_exec = WhatsAppExecutor()

    # Mock Twilio response
    with patch("requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"sid": "SM_test_otp_sid_12345"}
        mock_post.return_value = mock_response

        # Temporary system credentials for test
        wa_exec.account_sid = "AC_test_system_account"
        wa_exec.auth_token = "auth_test_system_token"

        res = wa_exec.send_message(
            to_number="+15551234567",
            message="Your OTP is 123456",
            trace_id="test_otp_trace",
            is_system_otp=True  # System Authentication OTP Gateway
        )

        assert res["status"] == "success"
        assert res.get("channel") == "system_otp"
        assert res.get("message_sid") == "SM_test_otp_sid_12345"
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["data"]["From"] == wa_exec.whatsapp_number
        assert "whatsapp:+15551234567" in call_kwargs["data"]["To"]
