"""
backend/tests/test_email_sender_contract.py — Phase 2 Issue #2 Regression Tests

Covers:
1. RFC 2822 sender parsing in email executor (parse_rfc_sender).
2. Normalization of Gmail messages producing both canonical and legacy alias fields.
3. Fallback message stub creation with all canonical and alias keys.
4. EmailCapability extraction of sender identity and date display (canonical vs legacy vs missing).
5. READ_MESSAGES formatting: no 'From: Unknown' when sender/timestamp present.
6. SEARCH_MESSAGES formatting: no 'From: Unknown' when sender/timestamp present.
7. Safe fallback handling when sender or date headers are completely missing or partial.
8. Backward compatibility with legacy payloads containing 'from' and 'date'.
"""

import pytest
import asyncio
from unittest.mock import MagicMock, patch
from typing import Dict, Any

from app.executors.email_executor import EmailExecutor, parse_rfc_sender
from app.capabilities.email_capability import EmailCapability
from app.capabilities.base_capability import CapabilityResult


# ── 1. RFC 2822 Sender Parsing Tests ──────────────────────────────────────────

def test_parse_rfc_sender_standard_name_and_address():
    name, addr, display = parse_rfc_sender("Jane Doe <jane.doe@example.com>")
    assert name == "Jane Doe"
    assert addr == "jane.doe@example.com"
    assert display == "Jane Doe <jane.doe@example.com>"


def test_parse_rfc_sender_bare_email():
    name, addr, display = parse_rfc_sender("jane.doe@example.com")
    assert name == ""
    assert addr == "jane.doe@example.com"
    assert display == "jane.doe@example.com"


def test_parse_rfc_sender_quoted_name():
    name, addr, display = parse_rfc_sender('"Doe, Jane" <jane.doe@example.com>')
    assert name == "Doe, Jane"
    assert addr == "jane.doe@example.com"
    assert display == "Doe, Jane <jane.doe@example.com>"


def test_parse_rfc_sender_mime_encoded():
    # "Jane Doe" encoded in UTF-8 base64 is SmFuZSBEb2U=
    name, addr, display = parse_rfc_sender("=?UTF-8?B?SmFuZSBEb2U=?= <jane@example.com>")
    assert name == "Jane Doe"
    assert addr == "jane@example.com"
    assert display == "Jane Doe <jane@example.com>"


def test_parse_rfc_sender_bare_name_without_email():
    name, addr, display = parse_rfc_sender("System Notification Service")
    assert name == "System Notification Service"
    assert addr == ""
    assert display == "System Notification Service"


def test_parse_rfc_sender_empty_and_none():
    assert parse_rfc_sender("") == ("", "", "")
    assert parse_rfc_sender("   ") == ("", "", "")
    assert parse_rfc_sender(None) == ("", "", "")


# ── 2. EmailExecutor Fallback Stub Tests ──────────────────────────────────────

def test_fallback_message_stub_contains_canonical_and_alias_fields():
    executor = EmailExecutor()
    stub = executor._create_fallback_message_stub("msg-123", "thread-456", labels=["INBOX"])

    # Canonical fields
    assert stub["id"] == "msg-123"
    assert stub["thread_id"] == "thread-456"
    assert stub["sender"] == ""
    assert stub["recipient"] == ""
    assert stub["subject"] == ""
    assert stub["snippet"] == ""
    assert stub["content"] == ""
    assert "timestamp" in stub and len(stub["timestamp"]) > 0
    assert stub["has_attachments"] is False
    assert stub["labels"] == ["INBOX"]

    # Legacy & structured compatibility aliases
    assert stub["message_id"] == "msg-123"
    assert stub["from"] == ""
    assert stub["to"] == ""
    assert stub["body"] == ""
    assert stub["date"] == stub["timestamp"]
    assert stub["sender_name"] == ""
    assert stub["sender_email"] == ""
    assert stub["sender_display"] == ""


# ── 3. EmailExecutor Message Normalization Tests ─────────────────────────────

def test_normalize_gmail_message_canonical_and_alias_fields():
    executor = EmailExecutor()
    raw_gmail_payload = {
        "id": "18a1b2c3d4e5f6",
        "threadId": "18a1b2c3d4e5f6",
        "labelIds": ["INBOX", "UNREAD"],
        "snippet": "Test email snippet here...",
        "internalDate": "1710000000000",
        "payload": {
            "headers": [
                {"name": "From", "value": "Alice Smith <alice@example.org>"},
                {"name": "To", "value": "Bob Jones <bob@example.org>"},
                {"name": "Subject", "value": "Project Roadmap Review"},
                {"name": "Date", "value": "Mon, 19 Oct 2026 09:30:00 +0000"},
            ],
            "mimeType": "text/plain",
            "body": {
                "size": 25,
                # "Hello, let us sync up!" base64url encoded: SGVsbG8sIGxldCB1cyBzeW5jIHVwIQ==
                "data": "SGVsbG8sIGxldCB1cyBzeW5jIHVwIQ",
            },
        },
    }

    norm = executor._normalize_gmail_message(raw_gmail_payload)

    # Canonical fields
    assert norm["id"] == "18a1b2c3d4e5f6"
    assert norm["thread_id"] == "18a1b2c3d4e5f6"
    assert norm["sender"] == "Alice Smith <alice@example.org>"
    assert norm["recipient"] == "Bob Jones <bob@example.org>"
    assert norm["subject"] == "Project Roadmap Review"
    assert norm["snippet"] == "Test email snippet here..."
    assert norm["timestamp"] == "Mon, 19 Oct 2026 09:30:00 +0000"
    assert norm["has_attachments"] is False
    assert norm["labels"] == ["INBOX", "UNREAD"]

    # Legacy & structured alias fields
    assert norm["from"] == "Alice Smith <alice@example.org>"
    assert norm["to"] == "Bob Jones <bob@example.org>"
    assert norm["date"] == "Mon, 19 Oct 2026 09:30:00 +0000"
    assert norm["message_id"] == "18a1b2c3d4e5f6"
    assert norm["sender_name"] == "Alice Smith"
    assert norm["sender_email"] == "alice@example.org"
    assert norm["sender_display"] == "Alice Smith <alice@example.org>"


def test_normalize_gmail_message_missing_headers_safe_fallback():
    executor = EmailExecutor()
    raw_payload_no_headers = {
        "id": "msg-no-hdr",
        "threadId": "th-no-hdr",
        "labelIds": ["SENT"],
        "snippet": "No header snippet",
        "internalDate": "1710000000000",
        "payload": {
            "headers": [],
            "body": {"size": 0},
        },
    }

    norm = executor._normalize_gmail_message(raw_payload_no_headers)
    assert norm["sender"] == ""
    assert norm["from"] == ""
    assert norm["sender_name"] == ""
    assert norm["sender_email"] == ""
    assert norm["sender_display"] == ""
    assert norm["recipient"] == ""
    assert norm["to"] == ""
    assert norm["subject"] == ""
    # Should safely fallback to ISO date from internalDate
    assert norm["timestamp"] != ""
    assert norm["date"] == norm["timestamp"]


# ── 4. EmailCapability Extraction Helper Tests ────────────────────────────────

def test_capability_extract_sender_display_canonical():
    # Only canonical 'sender' present (Executor normalized output)
    msg = {"sender": "Dr. Sarah Connor <sarah@cyberdyne.com>"}
    display = EmailCapability._extract_sender_display(msg)
    assert display == "Dr. Sarah Connor <sarah@cyberdyne.com>"


def test_capability_extract_sender_display_legacy_from():
    # Only legacy 'from' present
    msg = {"from": "Kyle Reese <kyle@resistance.org>"}
    display = EmailCapability._extract_sender_display(msg)
    assert display == "Kyle Reese <kyle@resistance.org>"


def test_capability_extract_sender_display_structured_fields():
    # Only structured components present
    msg = {"sender_name": "T-800", "sender_email": "t800@skynet.com"}
    display = EmailCapability._extract_sender_display(msg)
    assert display == "T-800 <t800@skynet.com>"


def test_capability_extract_sender_display_missing_safely_unknown():
    assert EmailCapability._extract_sender_display({}) == "Unknown"
    assert EmailCapability._extract_sender_display({"sender": ""}) == "Unknown"
    assert EmailCapability._extract_sender_display({"from": ""}) == "Unknown"
    assert EmailCapability._extract_sender_display({"sender": "   ", "from": None}) == "Unknown"
    assert EmailCapability._extract_sender_display(None) == "Unknown"


def test_capability_extract_date_display_canonical():
    msg = {"timestamp": "2026-10-19T08:00:00Z"}
    assert EmailCapability._extract_date_display(msg) == "2026-10-19T08:00:00Z"


def test_capability_extract_date_display_legacy():
    msg = {"date": "Mon, 19 Oct 2026 08:00:00 GMT"}
    assert EmailCapability._extract_date_display(msg) == "Mon, 19 Oct 2026 08:00:00 GMT"


def test_capability_extract_date_display_missing_safely_empty():
    assert EmailCapability._extract_date_display({}) == ""
    assert EmailCapability._extract_date_display({"timestamp": ""}) == ""
    assert EmailCapability._extract_date_display({"date": None}) == ""
    assert EmailCapability._extract_date_display(None) == ""


# ── 5. EmailCapability READ_MESSAGES Execution Tests (Issue #2 Defect Fix) ────

def test_read_messages_formats_canonical_sender_and_timestamp_without_unknown():
    """
    CRITICAL DEFECT REGRESSION:
    Previously, executor returned 'sender' and 'timestamp', while capability looked for 'from' and 'date'.
    This produced '**From:** Unknown' and empty '**Date:**'.
    This test verifies that canonical messages format the sender name and date cleanly.
    """
    async def _run():
        cap = EmailCapability()

        mock_execution_svc = MagicMock()
        mock_execution_svc.execute_action.return_value = {
            "status": "success",
            "messages": [
                {
                    "id": "msg-001",
                    "sender": "Alice Adams <alice@company.com>",
                    "subject": "Weekly Roadmap Checkin",
                    "timestamp": "Mon, 19 Oct 2026 10:00:00 +0000",
                    "snippet": "Let's review the milestones for Q4...",
                }
            ]
        }

        with patch("app.mitra_system_registry.mitra_registry") as mock_reg:
            mock_reg.execution_service = mock_execution_svc
            res = await cap.execute(
                intent="READ_MESSAGES",
                params={"user_id": "usr-123", "account_id": "google"},
                trace_id="tr-test-1",
            )

            assert res.status == "success"
            assert "**From:** Alice Adams <alice@company.com>" in res.summary
            assert "**Subject:** Weekly Roadmap Checkin" in res.summary
            assert "**Date:** Mon, 19 Oct 2026 10:00:00 +0000" in res.summary
            assert "**From:** Unknown" not in res.summary

    asyncio.run(_run())


def test_read_messages_backward_compatible_with_legacy_from_and_date():
    async def _run():
        cap = EmailCapability()

        mock_execution_svc = MagicMock()
        mock_execution_svc.execute_action.return_value = {
            "status": "success",
            "messages": [
                {
                    "id": "msg-002",
                    "from": "Bob Builder <bob@construct.com>",
                    "subject": "Site Inspection",
                    "date": "2026-10-18T14:22:00Z",
                    "snippet": "Foundation work completed...",
                }
            ]
        }

        with patch("app.mitra_system_registry.mitra_registry") as mock_reg:
            mock_reg.execution_service = mock_execution_svc
            res = await cap.execute(
                intent="READ_MESSAGES",
                params={"user_id": "usr-123"},
                trace_id="tr-test-2",
            )

            assert res.status == "success"
            assert "**From:** Bob Builder <bob@construct.com>" in res.summary
            assert "**Date:** 2026-10-18T14:22:00Z" in res.summary
            assert "**From:** Unknown" not in res.summary

    asyncio.run(_run())


def test_read_messages_missing_sender_and_date_safe_fallback():
    async def _run():
        cap = EmailCapability()

        mock_execution_svc = MagicMock()
        mock_execution_svc.execute_action.return_value = {
            "status": "success",
            "messages": [
                {
                    "id": "msg-003",
                    "subject": "Notification without Sender",
                    "snippet": "Automated alert",
                }
            ]
        }

        with patch("app.mitra_system_registry.mitra_registry") as mock_reg:
            mock_reg.execution_service = mock_execution_svc
            res = await cap.execute(
                intent="READ_MESSAGES",
                params={"user_id": "usr-123"},
                trace_id="tr-test-3",
            )

            assert res.status == "success"
            assert "**From:** Unknown" in res.summary
            assert "**Date:** \n" in res.summary or "**Date:** " in res.summary

    asyncio.run(_run())


# ── 6. EmailCapability SEARCH_MESSAGES Execution Tests ────────────────────────

def test_search_messages_formats_canonical_sender_and_timestamp():
    async def _run():
        cap = EmailCapability()

        mock_execution_svc = MagicMock()
        mock_execution_svc.execute_action.return_value = {
            "status": "success",
            "query": "invoice",
            "messages": [
                {
                    "id": "msg-s1",
                    "sender": "Billing Dept <billing@vendor.com>",
                    "subject": "Invoice #4819",
                    "timestamp": "Fri, 16 Oct 2026 11:00:00 GMT",
                    "snippet": "Please find attached your invoice...",
                }
            ]
        }

        with patch("app.mitra_system_registry.mitra_registry") as mock_reg:
            mock_reg.execution_service = mock_execution_svc
            res = await cap.execute(
                intent="SEARCH_MESSAGES",
                params={"user_id": "usr-123", "query": "invoice"},
                trace_id="tr-test-s1",
            )

            assert res.status == "success"
            assert "Found 1 emails matching 'invoice':" in res.summary
            assert "**From:** Billing Dept <billing@vendor.com>" in res.summary
            assert "**Subject:** Invoice #4819" in res.summary
            assert "**Date:** Fri, 16 Oct 2026 11:00:00 GMT" in res.summary
            assert "**From:** Unknown" not in res.summary

    asyncio.run(_run())


def test_search_messages_empty_results_handling():
    async def _run():
        cap = EmailCapability()

        mock_execution_svc = MagicMock()
        mock_execution_svc.execute_action.return_value = {
            "status": "success",
            "query": "nonexistent query",
            "messages": []
        }

        with patch("app.mitra_system_registry.mitra_registry") as mock_reg:
            mock_reg.execution_service = mock_execution_svc
            res = await cap.execute(
                intent="SEARCH_MESSAGES",
                params={"user_id": "usr-123", "query": "nonexistent query"},
                trace_id="tr-test-s2",
            )

            assert res.status == "success"
            assert res.summary == "No emails found matching 'nonexistent query'."

    asyncio.run(_run())
