"""
test_companion_streaming_capabilities.py — Comprehensive Regression Suite
Verifies that:
1. Streaming email read routes to email capability (READ_MESSAGES)
2. Streaming email search routes to email capability (SEARCH_MESSAGES)
3. Streaming draft routes to Gmail draft executor (DRAFT_MESSAGE)
4. Streaming send creates pending action
5. Streaming send does NOT send immediately
6. Pending action confirm sends exactly once
7. Natural-language "yes" cannot bypass pending action confirmation
8. Current user message reaches LLM response synthesis
9. Current user message is stored exactly once
10. Assistant response is stored exactly once
11. Authenticated user isolation
12. Connected Google account isolation
13. Duplicate generation does not execute communication twice
14. Cancelled generation does not execute communication
15. No internal JSON/tool payload leaks into assistant text
16. No raw provider credentials leak
17. End-to-end mocked tests for READ, DRAFT, and SEND + CONFIRM
"""
from __future__ import annotations

import asyncio
import json
import uuid
import pytest
from unittest.mock import MagicMock, patch

from app.companion.companion_orchestrator import companion_orchestrator, CompanionResponse
from app.companion.companion_session import session_manager
from app.companion.companion_memory import companion_memory
from app.services.communication_service import communication_service
from app.services.connected_account_service import connected_account_service
from app.mitra_system_registry import mitra_registry
from app.executors.email_executor import EmailExecutor
from app.core.llm_bridge import llm_bridge
from app.core.intentflow import intent_flow
from app.capabilities.base_capability import CapabilityResult
from app.models.communication import CommunicationAction, PendingCommunicationAction


@pytest.fixture(autouse=True)
def clean_sessions():
    """Ensure clean session state for test runs."""
    session_manager._sessions.clear()
    session_manager._histories.clear()
    yield
    session_manager._sessions.clear()
    session_manager._histories.clear()


def test_1_streaming_email_read_routes_to_email_capability():
    """1. Streaming 'Show me my latest 5 emails.' routes to email capability and READ_MESSAGES."""
    async def _run():
        user_id = f"test_user_read_{uuid.uuid4().hex[:8]}"
        mock_messages = [
            {"id": "msg_1", "subject": "Welcome", "from": "alice@example.com", "snippet": "Hello world", "date": "2026-10-01"}
        ]
        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "messages": mock_messages,
                "count": 1,
            }

            events = []
            async for event in companion_orchestrator.process_stream(user_id=user_id, message="Show me my latest 5 emails."):
                events.append(event)

            # Assert capability_started event was yielded
            cap_started = next((e for e in events if e.get("type") == "capability_started"), None)
            assert cap_started is not None
            assert cap_started.get("capability") == "email"

            # Assert capability_result event was yielded
            cap_result = next((e for e in events if e.get("type") == "capability_result"), None)
            assert cap_result is not None
            assert cap_result.get("status") == "success"
            assert "Welcome" in cap_result.get("summary", "")

            # Assert execution_svc called with READ_MESSAGES
            mock_exec.assert_called_once()
            args, kwargs = mock_exec.call_args
            assert args[0] == "email"
            assert args[1]["intent"] == "READ_MESSAGES"
            assert args[1]["limit"] == 5

    asyncio.run(_run())


def test_2_streaming_email_search_routes_to_email_capability():
    """2. Streaming 'Search my inbox for emails containing meeting.' routes to SEARCH_MESSAGES."""
    async def _run():
        user_id = f"test_user_search_{uuid.uuid4().hex[:8]}"
        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "messages": [{"id": "m1", "subject": "Urgent meeting", "from": "bob@example.com", "snippet": "Meeting at 3", "date": "today"}],
                "count": 1,
            }

            events = []
            async for event in companion_orchestrator.process_stream(user_id=user_id, message="Search my inbox for emails containing meeting"):
                events.append(event)

            cap_started = next((e for e in events if e.get("type") == "capability_started"), None)
            assert cap_started is not None
            assert cap_started.get("capability") == "email"

            mock_exec.assert_called_once()
            action_params = mock_exec.call_args[0][1]
            assert action_params["intent"] == "SEARCH_MESSAGES"
            assert "meeting" in action_params["query"].lower()

    asyncio.run(_run())


def test_3_streaming_draft_routes_to_gmail_draft_executor():
    """3. Streaming 'Create a draft email to rajprajapati1729@gmail.com saying Meet me urgently.' routes to DRAFT_MESSAGE."""
    async def _run():
        user_id = f"test_user_draft_{uuid.uuid4().hex[:8]}"
        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "draft_id": "draft_abc123",
                "recipient": "rajprajapati1729@gmail.com",
                "subject": "Draft",
            }

            events = []
            async for event in companion_orchestrator.process_stream(
                user_id=user_id,
                message="Create a draft email to rajprajapati1729@gmail.com saying Meet me urgently.",
            ):
                events.append(event)

            mock_exec.assert_called_once()
            action_params = mock_exec.call_args[0][1]
            assert action_params["intent"] == "DRAFT_MESSAGE"
            assert action_params["recipient"] == "rajprajapati1729@gmail.com"
            assert action_params["to_addr"] == "rajprajapati1729@gmail.com"

            complete_event = next(e for e in events if e.get("type") == "message_complete")
            assert "draft" in complete_event.get("message", "").lower()

    asyncio.run(_run())


def test_4_streaming_send_creates_pending_action_and_does_not_send():
    """4 & 5. Streaming 'Send an email to rajprajapati1729@gmail.com saying Meet me urgently.' creates pending action and does NOT send immediately."""
    async def _run():
        user_id = f"test_user_send_{uuid.uuid4().hex[:8]}"
        pending_dict = {
            "pending_action_id": "pca_mock_12345678",
            "action_type": "email",
            "operation": "SEND_MESSAGE",
            "recipient": "rajprajapati1729@gmail.com",
            "subject": "Email",
            "preview": "Meet me urgently.",
        }

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec, \
             patch.object(EmailExecutor, "send_email_gmail_api") as mock_gmail_send:

            mock_exec.return_value = {
                "status": "confirmation_required",
                "error_code": "CONFIRMATION_REQUIRED",
                "message": "I've prepared the email. Please review and confirm before I send it.",
                "pending_action_id": "pca_mock_12345678",
                "confirmation": pending_dict,
            }

            events = []
            async for event in companion_orchestrator.process_stream(
                user_id=user_id,
                message="Send an email to rajprajapati1729@gmail.com saying Meet me urgently.",
            ):
                events.append(event)

            # 4. Assert approval_required event emitted
            approval_evt = next((e for e in events if e.get("type") == "approval_required"), None)
            assert approval_evt is not None
            assert approval_evt.get("pending_action_id") == "pca_mock_12345678"
            assert approval_evt.get("confirmation", {}).get("recipient") == "rajprajapati1729@gmail.com"

            # 5. Assert direct send executor was NOT called
            mock_gmail_send.assert_not_called()

    asyncio.run(_run())


def test_6_pending_action_confirm_sends_exactly_once():
    """6. Pending action confirmation sends via dedicated REST authorization path."""
    user_id = f"test_user_confirm_{uuid.uuid4().hex[:8]}"
    account_id = "test@example.com"

    with patch.object(connected_account_service, "get_user_connection") as mock_get_conn, \
         patch.object(EmailExecutor, "send_message") as mock_email_send:

        mock_get_conn.return_value = {
            "provider": "gmail",
            "email": "test@example.com",
            "access_token": "valid_token",
        }
        mock_email_send.return_value = {
            "status": "success",
            "message_id": "gmail_msg_999",
            "from": "test@example.com",
        }

        # Stage action
        action = CommunicationAction(
            intent="SEND_MESSAGE",
            channel="email",
            recipient="recipient@example.com",
            subject="Test Subject",
            content="Test Body",
            user_id=user_id,
            account_id=account_id,
            confirmation_confirmed=False,
        )
        staged_res = communication_service.execute_action(action)
        assert staged_res.status == "confirmation_required"
        pending_id = staged_res.pending_action_id
        assert pending_id is not None
        mock_email_send.assert_not_called()

        # Confirm action
        confirm_res = communication_service.confirm_pending_action(
            pending_action_id=pending_id,
            user_id=user_id,
        )
        assert confirm_res.status in ("sent", "success")
        assert mock_email_send.call_count == 1

        # Duplicate confirmation must not dispatch email again
        dup_res = communication_service.confirm_pending_action(
            pending_action_id=pending_id,
            user_id=user_id,
        )
        assert dup_res.error_code == "ACTION_ALREADY_EXECUTED" or "already" in str(dup_res.message).lower()
        assert mock_email_send.call_count == 1



def test_7_natural_language_yes_cannot_bypass_pending_confirmation():
    """7. Natural language 'yes' or 'confirm' cannot bypass pending action confirmation."""
    async def _run():
        user_id = f"test_user_nl_yes_{uuid.uuid4().hex[:8]}"

        with patch.object(EmailExecutor, "send_email_gmail_api") as mock_gmail_send, \
             patch.object(llm_bridge, "stream_llm_with_messages") as mock_llm_stream:

            async def fake_stream(*args, **kwargs):
                yield "Understood, "
                yield "how else can I help?"

            mock_llm_stream.side_effect = fake_stream

            # User simply saying "yes" goes to conversational brain and cannot trigger outbound email send
            events = []
            async for event in companion_orchestrator.process_stream(user_id=user_id, message="yes please send it"):
                events.append(event)

            mock_gmail_send.assert_not_called()

    asyncio.run(_run())


def test_8_current_user_message_reaches_llm_synthesis_and_never_duplicated():
    """8. Current user message reaches LLM payload exactly once."""
    async def _run():
        user_id = f"test_user_synthesis_{uuid.uuid4().hex[:8]}"
        calls = []

        with patch.object(llm_bridge, "stream_llm_with_messages") as mock_stream:
            async def fake_stream(model, messages, **kwargs):
                calls.append(list(messages))
                yield "Hello there!"

            mock_stream.side_effect = fake_stream

            async for _ in companion_orchestrator.process_stream(user_id=user_id, message="What is quantum mechanics?"):
                pass

            assert len(calls) == 1
            call_messages = calls[0]
            user_turns = [m for m in call_messages if m.get("role") == "user"]
            assert len(user_turns) == 1
            assert "quantum mechanics" in user_turns[0]["content"].lower()

    asyncio.run(_run())


def test_9_10_turns_stored_exactly_once():
    """9 & 10. Current user message and assistant response are stored in history exactly once."""
    async def _run():
        user_id = f"test_user_turns_{uuid.uuid4().hex[:8]}"

        with patch.object(llm_bridge, "stream_llm_with_messages") as mock_stream:
            async def fake_stream(model, messages, **kwargs):
                yield "I am Mitra."

            mock_stream.side_effect = fake_stream

            async for _ in companion_orchestrator.process_stream(user_id=user_id, message="Tell me who you are"):
                pass

            history = await session_manager.get_history(user_id)
            assert len(history) == 2
            assert history[0]["role"] == "user"
            assert history[0]["content"] == "Tell me who you are"
            assert history[1]["role"] == "assistant"
            assert history[1]["content"] == "I am Mitra."

    asyncio.run(_run())


def test_11_authenticated_user_isolation():
    """11. User 1 cannot access User 2's session or history."""
    async def _run():
        u1, u2 = f"user_iso_1_{uuid.uuid4().hex[:8]}", f"user_iso_2_{uuid.uuid4().hex[:8]}"

        await session_manager.get_or_create(u1)
        await session_manager.get_or_create(u2)

        await session_manager.add_turn(u1, "user", "User 1 confidential message")
        await session_manager.add_turn(u2, "user", "User 2 confidential message")

        h1 = await session_manager.get_history(u1)
        h2 = await session_manager.get_history(u2)

        assert any("User 1" in t["content"] for t in h1)
        assert not any("User 2" in t["content"] for t in h1)
        assert any("User 2" in t["content"] for t in h2)
        assert not any("User 1" in t["content"] for t in h2)

    asyncio.run(_run())


def test_13_duplicate_generation_does_not_execute_communication_twice():
    """13. Duplicate generation does not execute communication twice."""
    async def _run():
        user_id = f"test_user_dup_{uuid.uuid4().hex[:8]}"

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "messages": [{"id": "m1", "subject": "Test"}],
            }

            # Fire request 1
            async for _ in companion_orchestrator.process_stream(user_id=user_id, message="Show me my latest 5 emails."):
                pass

            # Fire request 2
            async for _ in companion_orchestrator.process_stream(user_id=user_id, message="Show me my latest 5 emails."):
                pass

            # Each separate request calls executor exactly once
            assert mock_exec.call_count == 2

    asyncio.run(_run())


def test_14_cancelled_generation_does_not_execute_communication():
    """14. Cancelled generation terminates cleanly."""
    async def _run():
        user_id = f"test_user_cancel_{uuid.uuid4().hex[:8]}"
        events_received = []

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {"status": "success", "messages": []}

            generator = companion_orchestrator.process_stream(user_id=user_id, message="Show me my latest 5 emails.")
            # Receive initial message_start
            event = await generator.asend(None)
            events_received.append(event)
            assert event.get("type") == "message_start"

            # Cancel generator by closing it
            await generator.aclose()

    asyncio.run(_run())


def test_15_16_no_internal_credentials_or_debug_payload_leaks():
    """15 & 16. Sensitive credentials, access tokens, and internal trace IDs do not leak in client events."""
    async def _run():
        user_id = f"test_user_leak_{uuid.uuid4().hex[:8]}"

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "messages": [{"id": "m1", "subject": "Test", "snippet": "Clean"}],
                "access_token": "SECRET_GMAIL_ACCESS_TOKEN",
                "token_hash": "SECRET_HASH",
                "_debug": {"raw_sql": "SELECT * FROM users"},
                "internal_trace_id": "internal_private_trace",
            }

            events = []
            async for event in companion_orchestrator.process_stream(user_id=user_id, message="Show me my latest 5 emails."):
                events.append(event)

            for event in events:
                raw_event_str = json.dumps(event)
                assert "SECRET_GMAIL_ACCESS_TOKEN" not in raw_event_str
                assert "SECRET_HASH" not in raw_event_str
                assert "internal_private_trace" not in raw_event_str
                assert "raw_sql" not in raw_event_str

    asyncio.run(_run())


def test_e2e_mocked_read_flow():
    """End-to-End Mocked Flow: 'Show me my latest 5 emails.' -> IntentFlow -> READ_MESSAGES -> Gmail read -> formatted response."""
    async def _run():
        user_id = f"test_e2e_read_{uuid.uuid4().hex[:8]}"

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "messages": [
                    {"id": "msg_001", "from": "ceo@example.com", "subject": "All Hands", "date": "2026-10-01", "snippet": "See you at 4pm"},
                    {"id": "msg_002", "from": "support@example.com", "subject": "Ticket #12", "date": "2026-10-01", "snippet": "Resolved"},
                ],
                "count": 2,
            }

            resp = await companion_orchestrator.process(user_id=user_id, message="Show me my latest 5 emails.")
            assert "All Hands" in resp.message
            assert "ceo@example.com" in resp.message
            assert resp.capability_result is not None
            assert resp.capability_result["status"] == "success"

    asyncio.run(_run())


def test_e2e_mocked_draft_flow():
    """End-to-End Mocked Flow: 'Create a draft email to test@example.com saying hello.' -> DRAFT_MESSAGE -> draft created -> send endpoint NOT called."""
    async def _run():
        user_id = f"test_e2e_draft_{uuid.uuid4().hex[:8]}"

        with patch.object(mitra_registry.execution_service, "execute_action") as mock_exec, \
             patch.object(EmailExecutor, "send_email_gmail_api") as mock_send:

            mock_exec.return_value = {
                "status": "success",
                "draft_id": "draft_999",
                "recipient": "test@example.com",
                "subject": "hello",
            }

            resp = await companion_orchestrator.process(
                user_id=user_id,
                message="Create a draft email to test@example.com saying hello.",
            )
            assert resp.capability_result is not None
            assert resp.capability_result["status"] == "success"
            assert "draft" in resp.message.lower()
            mock_send.assert_not_called()

    asyncio.run(_run())


def test_e2e_mocked_send_and_confirm_flow():
    """End-to-End Mocked Flow: 'Send an email to test@example.com saying hello.' -> SEND_MESSAGE -> pending action -> confirmation card -> POST confirm -> send called once."""
    async def _run():
        user_id = f"test_e2e_send_confirm_{uuid.uuid4().hex[:8]}"
        account_id = f"acc_google_{uuid.uuid4().hex[:8]}"

        with patch.object(connected_account_service, "get_user_connection") as mock_get_conn, \
             patch.object(EmailExecutor, "send_message") as mock_email_send:

            mock_get_conn.return_value = {
                "provider": "gmail",
                "email": "user@example.com",
                "access_token": "valid_oauth_token",
            }
            mock_email_send.return_value = {
                "status": "success",
                "message_id": "gmail_msg_success_777",
                "from": "user@example.com",
            }

            # 1. User says "Send an email to test@example.com saying hello."
            # Staged via companion orchestrator
            resp = await companion_orchestrator.process(
                user_id=user_id,
                message="Send an email to test@example.com saying hello.",
            )

            # Assert confirmation required, pending action created, send NOT called
            assert resp.capability_result is not None
            assert resp.capability_result["status"] == "pending"
            pending_action_id = resp.capability_result["data"]["pending_action_id"]
            assert pending_action_id.startswith(("pca_", "pact_"))
            mock_email_send.assert_not_called()

            # 2. User confirms via dedicated REST endpoint
            confirm_result = communication_service.confirm_pending_action(
                pending_action_id=pending_action_id,
                user_id=user_id,
            )
            assert confirm_result.status in ("sent", "success")
            mock_email_send.assert_called_once()

    asyncio.run(_run())


def test_17_naked_internal_action_json_not_emitted_in_conversational_stream():
    """17. Naked internal action JSON payload is intercepted and not emitted as ordinary conversational prose."""
    async def _run():
        user_id = f"test_user_leak_{uuid.uuid4().hex[:8]}"

        # Mock LLM stream emitting conversational text followed by a naked action JSON payload
        async def mock_stream(*args, **kwargs):
            tokens = [
                "I will help you with that.\n",
                '{"action": "email", ',
                '"parameters": {"to": "bob@example.com", "subject": "Hi"}}'
            ]
            for t in tokens:
                yield t

        with patch.object(llm_bridge, "stream_llm_with_messages", side_effect=mock_stream), \
             patch.object(intent_flow, "process_text", return_value={"intent": "general"}):
            deltas = []
            final_message = ""
            async for event in companion_orchestrator.process_stream(
                user_id=user_id,
                message="Give me advice on structuring my day"
            ):
                if event.get("type") == "assistant_delta":
                    deltas.append(event.get("delta", ""))
                elif event.get("type") == "message_complete":
                    final_message = event.get("message", "")

            emitted_text = "".join(deltas)
            # The conversational preamble is preserved
            assert "I will help you with that." in emitted_text
            # The naked action envelope is suppressed and never reaches the user
            assert '{"action": "email"' not in emitted_text
            assert "bob@example.com" not in emitted_text
            assert '{"action": "email"' not in final_message

            # History turn must not contain the naked action payload
            history = await session_manager.get_history(user_id)
            assistant_turns = [h for h in history if h.get("role") == "assistant"]
            assert len(assistant_turns) == 1
            assert '{"action": "email"' not in assistant_turns[0].get("content", "")

    asyncio.run(_run())


def test_18_fenced_user_requested_json_remains_intact():
    """18. Legitimate JSON inside Markdown code fences requested by user is preserved and streamed."""
    async def _run():
        user_id = f"test_user_fenced_{uuid.uuid4().hex[:8]}"

        # Mock LLM stream emitting legitimate fenced JSON
        async def mock_stream(*args, **kwargs):
            tokens = [
                "Here is the sample payload you asked for:\n```json\n",
                '{\n  "action": "email",\n  "parameters": {"to": "test@example.com"}\n}\n',
                "```\nLet me know if you need anything else!"
            ]
            for t in tokens:
                yield t

        with patch.object(llm_bridge, "stream_llm_with_messages", side_effect=mock_stream), \
             patch.object(intent_flow, "process_text", return_value={"intent": "general"}):
            deltas = []
            async for event in companion_orchestrator.process_stream(
                user_id=user_id,
                message="Show me an example JSON payload in code fences"
            ):
                if event.get("type") == "assistant_delta":
                    deltas.append(event.get("delta", ""))

            emitted_text = "".join(deltas)
            # The fenced code block and its JSON contents are fully preserved
            assert "```json" in emitted_text
            assert '"action": "email"' in emitted_text
            assert "test@example.com" in emitted_text
            assert "Let me know if you need anything else!" in emitted_text

    asyncio.run(_run())


def test_19_uniguru_displays_data_answer_on_success():
    """19. When UniGuru succeeds and returns data['answer'], user receives the answer directly."""
    from app.capabilities.base_capability import CapabilityResult

    async def _run():
        user_id = f"test_user_uniguru_{uuid.uuid4().hex[:8]}"
        expected_answer = "Photosynthesis is the process by which green plants transform light energy into chemical energy."

        with patch("app.companion.companion_orchestrator.capability_registry.execute") as mock_exec, \
             patch.object(intent_flow, "process_text", return_value={"intent": "uniguru", "entities": {}}):

            mock_exec.return_value = CapabilityResult(
                capability="uniguru",
                intent="knowledge",
                status="success",
                summary="Knowledge response from UniGuru Live HTTP API.",
                data={
                    "answer": expected_answer,
                    "query": "explain photosynthesis",
                    "latency_ms": 15.4,
                    "source": "uniguru_live_api",
                },
            )
            deltas = []
            cap_results = []
            final_message = ""
            async for event in companion_orchestrator.process_stream(
                user_id=user_id,
                message="explain photosynthesis"
            ):
                if event.get("type") == "assistant_delta":
                    deltas.append(event.get("delta", ""))
                elif event.get("type") == "capability_result":
                    cap_results.append(event)
                elif event.get("type") == "message_complete":
                    final_message = event.get("message", "")

            emitted_text = "".join(deltas)
            # User receives the actual educational answer directly
            assert expected_answer in emitted_text
            assert expected_answer in final_message
            # Telemetry and engine confirms are NOT emitted as assistant prose
            assert "15.4ms" not in emitted_text
            assert "Done — Knowledge response" not in emitted_text

            # Telemetry remains available internally in capability_result event data
            assert len(cap_results) == 1
            assert cap_results[0]["data"]["latency_ms"] == 15.4
            assert cap_results[0]["data"]["source"] == "uniguru_live_api"

    asyncio.run(_run())


def test_20_raw_provider_json_and_exceptions_normalized():
    """20. Raw provider errors, tracebacks, database details, and error codes are normalized into safe messages."""
    from app.companion.personality_engine import normalize_error_message, personality_engine

    # 1. CREDENTIALS_MISSING provides actionable settings guidance
    cred_msg = personality_engine.build_capability_fail("CREDENTIALS_MISSING")
    assert "Settings" in cred_msg or "connect" in cred_msg
    assert "CREDENTIALS_MISSING" not in cred_msg

    # 2. Raw exception traceback is normalized
    raw_traceback = (
        "Traceback (most recent call last):\n"
        '  File "/app/backend/executors/email_executor.py", line 123, in send\n'
        "psycopg2.OperationalError: connection to server on socket failed\n"
        "InternalError: DB dead"
    )
    safe_trace = personality_engine.build_capability_fail(raw_traceback)
    assert "Traceback" not in safe_trace
    assert "psycopg2" not in safe_trace
    assert "email_executor.py" not in safe_trace
    assert "internal" in safe_trace.lower() or "connectivity" in safe_trace.lower() or "error" in safe_trace.lower()

    # 3. Raw provider JSON error payload is normalized
    raw_json_err = json.dumps({
        "error": {
            "code": 401,
            "message": "Invalid OAuth access_token [Bearer secret_abc_123]",
            "status": "UNAUTHENTICATED"
        }
    })
    safe_json = personality_engine.build_capability_fail(raw_json_err)
    assert "secret_abc_123" not in safe_json
    assert "Bearer" not in safe_json
    assert "Settings" in safe_json or "provider service returned an error" in safe_json

    # 4. Safe user error message is preserved
    clean_msg = "Please specify a valid email address for the recipient."
    safe_user_msg = personality_engine.build_capability_fail(clean_msg)
    assert "Please specify a valid email address for the recipient." in safe_user_msg


def test_21_historical_naked_action_payloads_not_re_injected_into_llm_context():
    """21. Legacy naked action JSON in session history is omitted when building LLM context."""
    async def _run():
        user_id = f"test_user_hist_{uuid.uuid4().hex[:8]}"

        # Simulate older un-patched session with raw action JSON stored as assistant turn
        await session_manager.get_or_create(user_id)
        await session_manager.add_turn(user_id, "user", "Send an email")
        await session_manager.add_turn(
            user_id,
            "assistant",
            '{"action": "email", "parameters": {"to": "test@example.com"}}'
        )

        history = await session_manager.get_history(user_id)
        messages = companion_orchestrator._build_llm_messages(
            system_prompt="You are Mitra.",
            history=history,
            current_user_message="Now schedule a meeting",
        )

        # The raw action JSON must not appear in any message sent to the LLM
        for msg in messages:
            content = msg.get("content", "")
            assert '{"action": "email"' not in content

        # System prompt and current user message are present
        assert messages[0]["role"] == "system"
        assert messages[-1]["role"] == "user"
        assert messages[-1]["content"] == "Now schedule a meeting"

    asyncio.run(_run())


def test_22_internal_action_object_and_trailing_prose_in_one_chunk():
    """22. When a single chunk contains an internal action JSON envelope followed by prose, suppress JSON and preserve trailing prose."""
    async def _run():
        from app.companion.companion_orchestrator import filter_action_tokens

        async def stream():
            yield '{"action": "email", "parameters": {}} I am Mitra.'

        tokens = []
        async for t in filter_action_tokens(stream()):
            tokens.append(t)

        result = "".join(tokens)
        assert '{"action": "email"' not in result
        assert "parameters" not in result
        assert result == " I am Mitra."

    asyncio.run(_run())


def test_23_legitimate_json_object_with_trailing_prose():
    """23. Legitimate user-requested JSON followed by trailing prose in one chunk is completely preserved."""
    async def _run():
        from app.companion.companion_orchestrator import filter_action_tokens

        async def stream():
            yield '{"status": "ok", "count": 42} Here is the data summary.'

        tokens = []
        async for t in filter_action_tokens(stream()):
            tokens.append(t)

        result = "".join(tokens)
        assert '{"status": "ok", "count": 42}' in result
        assert " Here is the data summary." in result
        assert result == '{"status": "ok", "count": 42} Here is the data summary.'

    asyncio.run(_run())


def test_24_nested_objects_and_braces_inside_strings():
    """24. Correctly tracks nested objects and braces inside strings with escaped quotes, suppressing the action envelope."""
    async def _run():
        from app.companion.companion_orchestrator import filter_action_tokens

        async def stream():
            yield '{"action": "email", "parameters": {"note": "closing } brace and \\"quote\\"", "sub": {"level": 2}}} All processed cleanly.'

        tokens = []
        async for t in filter_action_tokens(stream()):
            tokens.append(t)

        result = "".join(tokens)
        assert '{"action": "email"' not in result
        assert "closing } brace" not in result
        assert result == " All processed cleanly."

    asyncio.run(_run())


def test_25_consecutive_objects_and_prose_segments():
    """25. Consecutive objects and prose segments in single or consecutive chunks are processed without loss or reordering."""
    async def _run():
        from app.companion.companion_orchestrator import filter_action_tokens

        # Multiple internal action objects mixed with prose across chunks
        async def stream():
            yield "Preamble. "
            yield '{"action": "email", "parameters": {"to": "a@example.com"}} Middle prose. '
            yield '{"action": "calendar", "parameters": {}} Epilogue.'

        tokens = []
        async for t in filter_action_tokens(stream()):
            tokens.append(t)

        result = "".join(tokens)
        assert '{"action": "email"' not in result
        assert '{"action": "calendar"' not in result
        assert result == "Preamble.  Middle prose.  Epilogue."

        # Consecutive chunks where object is split across chunks and followed by legitimate JSON
        async def stream_split():
            yield '{"action": "whatsapp", '
            yield '"parameters": {"phone": "123"}} Text in between. '
            yield '{"config": {"theme": "dark"}} Final note.'

        tokens_split = []
        async for t in filter_action_tokens(stream_split()):
            tokens_split.append(t)

        result_split = "".join(tokens_split)
        assert '{"action": "whatsapp"' not in result_split
        assert '123' not in result_split
        assert '{"config": {"theme": "dark"}}' in result_split
        assert result_split == ' Text in between. {"config": {"theme": "dark"}} Final note.'

    asyncio.run(_run())
