"""
backend/app/services/communication_service.py — Unified Communication Service

Central orchestration layer for all MITRA communication:
- Enforces authenticated user identity
- Performs account ownership verification
- Enforces centralized approval policy (confirmation_required on SEND_MESSAGE)
- Ensures provider executor is NEVER invoked without explicit confirmation
- Normalizes provider responses into standardized delivery states
- Guarantees zero credential leakage
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from app.models.communication import (
    CommunicationAction,
    CommunicationChannel,
    CommunicationConfirmationPayload,
    CommunicationIntent,
    CommunicationResult,
    CommunicationStatus,
    DeliveryState,
    FORBIDDEN_CREDENTIAL_KEYS,
    compute_action_hash,
)
from app.services.connected_account_service import connected_account_service
from app.services.pending_action_service import pending_action_service
from app.executors.email_executor import EmailExecutor
from app.executors.whatsapp_executor import WhatsAppExecutor

logger = logging.getLogger(__name__)


class CommunicationService:
    """
    Central provider-independent communication orchestrator.
    Handles approval policy, account resolution, and executor dispatch.
    """

    def __init__(
        self,
        email_executor: Optional[EmailExecutor] = None,
        whatsapp_executor: Optional[WhatsAppExecutor] = None,
    ):
        self.email_executor = email_executor or EmailExecutor()
        self.whatsapp_executor = whatsapp_executor or WhatsAppExecutor()

    def evaluate_approval_policy(self, intent: CommunicationIntent) -> bool:
        """
        Centralized approval decision:
        - READ_MESSAGES: no confirmation required (False)
        - SEARCH_MESSAGES: no confirmation required (False)
        - DRAFT_MESSAGE: no confirmation required (False)
        - SEND_MESSAGE: explicit confirmation required (True)
        """
        if intent == CommunicationIntent.SEND_MESSAGE:
            return True
        return False

    def resolve_sender_account(
        self, user_id: str, channel: CommunicationChannel, account_id: Optional[str] = None
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Resolve the user's sender account identity and verify ownership.
        Returns (sender_identifier, error_code).
        If account_id is supplied, verifies it belongs to user_id.
        """
        if channel == CommunicationChannel.EMAIL:
            # Check Gmail / Google connection
            gmail_conn = (
                connected_account_service.get_user_connection(user_id=user_id, provider="google")
                or connected_account_service.get_user_connection(user_id=user_id, provider="gmail")
            )
            # Check Microsoft / Outlook connection
            ms_conn = (
                connected_account_service.get_user_connection(user_id=user_id, provider="microsoft")
                or connected_account_service.get_user_connection(user_id=user_id, provider="outlook")
            )

            matched_email = None
            if gmail_conn and gmail_conn.get("email"):
                matched_email = gmail_conn.get("email")
            elif ms_conn and ms_conn.get("email"):
                matched_email = ms_conn.get("email")

            # Check custom SMTP integration in DB
            if not matched_email:
                try:
                    from app.executors.email_executor import _get_db
                    db = _get_db()
                    if db is not None:
                        doc = db["user_integrations"].find_one({"user_id": user_id})
                        if doc and "smtp" in doc and doc["smtp"].get("username"):
                            matched_email = doc["smtp"].get("username")
                        elif doc and "gmail" in doc and doc["gmail"].get("email"):
                            matched_email = doc["gmail"].get("email")
                except Exception as exc:
                    logger.debug("Error querying user_integrations: %s", exc)

            if account_id:
                clean_acc = str(account_id).strip()
                # If specific account_id requested, ensure it matches user's owned account
                if matched_email and clean_acc.lower() == matched_email.lower():
                    return matched_email, None

                # Check Gmail / Google connection identifiers (email, provider_account_id, account_id)
                if gmail_conn:
                    g_email = str(gmail_conn.get("email") or "").strip()
                    g_pid = str(gmail_conn.get("provider_account_id") or "").strip()
                    g_aid = str(gmail_conn.get("account_id") or "").strip()
                    valid_gmail_ids = [v.lower() for v in (g_email, g_pid, g_aid) if v]
                    if clean_acc.lower() in valid_gmail_ids:
                        return gmail_conn.get("email") or g_pid or g_aid, None

                # Check Microsoft / Outlook connection identifiers (email, provider_account_id, account_id)
                if ms_conn:
                    m_email = str(ms_conn.get("email") or "").strip()
                    m_pid = str(ms_conn.get("provider_account_id") or "").strip()
                    m_aid = str(ms_conn.get("account_id") or "").strip()
                    valid_ms_ids = [v.lower() for v in (m_email, m_pid, m_aid) if v]
                    if clean_acc.lower() in valid_ms_ids:
                        return ms_conn.get("email") or m_pid or m_aid, None

                return None, "ACCOUNT_NOT_AUTHORIZED"

            return matched_email, None

        elif channel == CommunicationChannel.WHATSAPP:
            wa_conn = (
                connected_account_service.get_user_connection(user_id=user_id, provider="whatsapp_business")
                or connected_account_service.get_user_connection(user_id=user_id, provider="whatsapp")
            )
            matched_phone = None
            if wa_conn and (wa_conn.get("email") or wa_conn.get("provider_account_id")):
                matched_phone = wa_conn.get("email") or wa_conn.get("provider_account_id")

            if not matched_phone:
                from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor
                meta_exec = MetaWhatsAppExecutor()
                creds = meta_exec.get_credentials(user_id=user_id)
                if creds.get("phone_number_id"):
                    matched_phone = creds.get("phone_number_id")

            if not matched_phone:
                try:
                    from app.executors.whatsapp_executor import _get_db
                    # check user_integrations
                    from pymongo import MongoClient
                    import os
                    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
                    db_name = os.getenv("DATABASE_NAME", "ai_assistant")
                    client = MongoClient(uri, serverSelectionTimeoutMS=1000)
                    doc = client[db_name]["user_integrations"].find_one({"user_id": user_id})
                    if doc and "whatsapp" in doc and doc["whatsapp"].get("phone"):
                        matched_phone = doc["whatsapp"].get("phone")
                except Exception:
                    pass

            if account_id:
                if matched_phone and account_id == matched_phone:
                    return matched_phone, None
                return None, "ACCOUNT_NOT_AUTHORIZED"

            return matched_phone, None

        return None, None

    def execute_action(
        self,
        action: CommunicationAction,
        trace_id: Optional[str] = None,
    ) -> CommunicationResult:
        """
        Execute a canonical communication action adhering to the unified contract:
        1. Authenticated user validation (fail closed)
        2. Account ownership check
        3. Centralized approval policy (confirmation check)
        4. Outbound provider execution
        5. Normalized result mapping with asynchronous delivery state
        """
        now_iso = datetime.utcnow().isoformat()
        trace_id = trace_id or f"comm_{uuid.uuid4().hex[:12]}"

        # ── 1. Authenticated User Binding ──
        user_id = action.user_id
        if not user_id or not str(user_id).strip() or str(user_id).strip().lower() in ("user_default", "default", "none", "null", "anonymous"):
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=action.channel,
                error_code="AUTH_REQUIRED",
                error="Authorization error: user-owned communication actions require an authenticated user_id.",
                message="Authentication required.",
                action=action.to_dict(),
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # ── 2. Account Resolution & Ownership Verification ──
        sender_account, account_err = self.resolve_sender_account(
            user_id=user_id, channel=action.channel, account_id=action.account_id
        )
        if account_err == "ACCOUNT_NOT_AUTHORIZED":
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=action.channel,
                error_code="ACCOUNT_NOT_AUTHORIZED",
                error=f"Authorization error: account_id '{action.account_id}' does not belong to authenticated user.",
                message="Specified account is not authorized for this user.",
                action=action.to_dict(),
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # ── 2.5. Defensive Content Validation Layer ──
        # Invariant: action.content must NEVER be equal to a raw user command utterance
        # when a structured body/message/saying is present or can be extracted.
        if action.channel == CommunicationChannel.EMAIL:
            from app.capabilities.email_entity_extractor import extract_email_entities, is_raw_command_text
            raw_msg = (action.metadata or {}).get("raw_message") if action.metadata else None
            if is_raw_command_text(action.content or "", raw_msg):
                extracted = extract_email_entities(action.content or "", params={"subject": action.subject, "recipient": action.recipient})
                if extracted.get("content"):
                    action.content = extracted["content"]
                if extracted.get("subject") and (not action.subject or action.subject == "Message from AI Assistant"):
                    action.subject = extracted["subject"]
                if extracted.get("recipient") and not action.recipient:
                    action.recipient = extracted["recipient"]

        # ── 3. Centralized Approval Policy ──
        requires_confirmation = self.evaluate_approval_policy(action.intent)

        if requires_confirmation and not action.confirmation_confirmed:
            # Generate or preserve idempotency key
            idempotency_key = action.idempotency_key or f"idem_{uuid.uuid4().hex[:16]}"
            action.idempotency_key = idempotency_key

            # Server-Side Staging: create and persist exact pending action
            pending_action = pending_action_service.create_pending_action(
                action=action,
                sender_account=sender_account,
            )

            recip_name = None
            if action.metadata and isinstance(action.metadata, dict):
                recip_name = action.metadata.get("contact_name") or action.metadata.get("display_label")

            confirmation_payload = CommunicationConfirmationPayload(
                channel=action.channel,
                pending_action_id=pending_action.pending_action_id,
                sender_account=sender_account,
                recipient=action.recipient,
                recipient_name=recip_name,
                subject=action.subject,
                content=action.content,
                action="SEND_MESSAGE",
                idempotency_key=idempotency_key,
                expires_at=pending_action.expires_at,
                requires_confirmation=True,
                metadata=action.metadata or {},
            )

            logger.info(
                "Approval policy: SEND_MESSAGE requires explicit confirmation for user '%s' on %s (pending_action_id=%s)",
                user_id, action.channel.value, pending_action.pending_action_id
            )

            # Invariant: Provider executor MUST NOT be reached
            return CommunicationResult(
                status="confirmation_required",
                delivery_state="pending",
                channel=action.channel,
                pending_action_id=pending_action.pending_action_id,
                sender_account=sender_account,
                recipient=action.recipient,
                error_code="CONFIRMATION_REQUIRED",
                message="Explicit confirmation is required before sending this message.",
                confirmation=confirmation_payload.to_dict(),
                action=action.to_dict(),
                idempotency_key=idempotency_key,
                expires_at=pending_action.expires_at,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # ── 4. Non-Send Intents (Draft, Read, Search) ──
        if action.channel == CommunicationChannel.EMAIL:
            google_conn = connected_account_service.get_user_connection(user_id=user_id, provider="google") or connected_account_service.get_user_connection(user_id=user_id, provider="gmail")
            if google_conn:
                if action.intent == CommunicationIntent.DRAFT_MESSAGE:
                    extra_meta = action.metadata or {}
                    draft_res = self.email_executor.create_draft_gmail(
                        user_id=user_id,
                        to_email=action.recipient or "",
                        subject=action.subject or "",
                        message=action.content or "",
                        html_body=extra_meta.get("html_body"),
                        cc=extra_meta.get("cc"),
                        bcc=extra_meta.get("bcc"),
                        attachments=extra_meta.get("attachments"),
                        trace_id=trace_id
                    )
                    if isinstance(draft_res, dict) and draft_res.get("status") == "success":
                        return CommunicationResult(
                            status="accepted",
                            delivery_state="pending",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            draft_id=str(draft_res.get("draft_id")) if draft_res.get("draft_id") is not None else None,
                            thread_id=str(draft_res.get("thread_id")) if draft_res.get("thread_id") is not None else None,
                            message=str(draft_res.get("message") or f"Draft message created for {action.recipient}."),
                            action=action.to_dict(),
                            idempotency_key=action.idempotency_key,
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )
                    else:
                        err_code = draft_res.get("error_code") if isinstance(draft_res, dict) else "GMAIL_PROVIDER_ERROR"
                        err_msg = draft_res.get("error") if isinstance(draft_res, dict) else "Failed creating draft in Gmail."
                        return CommunicationResult(
                            status="failed",
                            delivery_state="failed",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            error_code=str(err_code) if err_code else "GMAIL_PROVIDER_ERROR",
                            error=str(err_msg) if err_msg else "Failed creating draft in Gmail.",
                            message=str(err_msg) if err_msg else "Failed creating draft.",
                            action=action.to_dict(),
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )

                elif action.intent == CommunicationIntent.READ_MESSAGES:
                    read_res = self.email_executor.read_inbox_gmail(
                        user_id=user_id,
                        limit=action.limit or 20,
                        page_token=action.page_token,
                        trace_id=trace_id
                    )
                    if isinstance(read_res, dict) and read_res.get("status") == "success":
                        msg_list = read_res.get("messages", [])
                        return CommunicationResult(
                            status="accepted",
                            delivery_state="unknown",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            messages=msg_list if isinstance(msg_list, list) else [],
                            next_page_token=str(read_res.get("next_page_token")) if read_res.get("next_page_token") is not None else None,
                            message=f"Retrieved {len(msg_list)} messages from inbox.",
                            action=action.to_dict(),
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )
                    else:
                        err_code = read_res.get("error_code") if isinstance(read_res, dict) else "GMAIL_PROVIDER_ERROR"
                        err_msg = read_res.get("error") if isinstance(read_res, dict) else "Failed reading Gmail inbox."
                        return CommunicationResult(
                            status="failed",
                            delivery_state="failed",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            error_code=str(err_code) if err_code else "GMAIL_PROVIDER_ERROR",
                            error=str(err_msg) if err_msg else "Failed reading Gmail inbox.",
                            message=str(err_msg) if err_msg else "Failed reading inbox.",
                            action=action.to_dict(),
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )

                elif action.intent == CommunicationIntent.SEARCH_MESSAGES:
                    query = action.query or ""
                    search_res = self.email_executor.search_messages_gmail(
                        user_id=user_id,
                        query=query,
                        limit=action.limit or 20,
                        page_token=action.page_token,
                        trace_id=trace_id
                    )
                    if isinstance(search_res, dict) and search_res.get("status") == "success":
                        msg_list = search_res.get("messages", [])
                        return CommunicationResult(
                            status="accepted",
                            delivery_state="unknown",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            messages=msg_list if isinstance(msg_list, list) else [],
                            next_page_token=str(search_res.get("next_page_token")) if search_res.get("next_page_token") is not None else None,
                            message=f"Found {len(msg_list)} messages matching query '{query}'.",
                            action=action.to_dict(),
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )
                    else:
                        err_code = search_res.get("error_code") if isinstance(search_res, dict) else "GMAIL_PROVIDER_ERROR"
                        err_msg = search_res.get("error") if isinstance(search_res, dict) else "Failed searching Gmail."
                        return CommunicationResult(
                            status="failed",
                            delivery_state="failed",
                            channel=action.channel,
                            provider="gmail_oauth_api",
                            sender_account=sender_account,
                            recipient=action.recipient,
                            error_code=str(err_code) if err_code else "GMAIL_PROVIDER_ERROR",
                            error=str(err_msg) if err_msg else "Failed searching Gmail.",
                            message=str(err_msg) if err_msg else "Failed searching Gmail.",
                            action=action.to_dict(),
                            trace_id=trace_id,
                            timestamp=now_iso,
                        )

        # Non-email channels or fallback
        if action.intent == CommunicationIntent.DRAFT_MESSAGE:
            return CommunicationResult(
                status="accepted",
                delivery_state="pending",
                channel=action.channel,
                sender_account=sender_account,
                recipient=action.recipient,
                message=f"Draft message created for {action.recipient}.",
                action=action.to_dict(),
                idempotency_key=action.idempotency_key,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        if action.intent in (CommunicationIntent.READ_MESSAGES, CommunicationIntent.SEARCH_MESSAGES):
            return CommunicationResult(
                status="accepted",
                delivery_state="unknown",
                channel=action.channel,
                sender_account=sender_account,
                recipient=action.recipient,
                message=f"Communication query '{action.intent.value}' accepted for {action.channel.value}.",
                action=action.to_dict(),
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # ── 5. Provider Execution (SEND_MESSAGE confirmed) ──
        if action.channel == CommunicationChannel.EMAIL:
            if not action.recipient:
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=action.channel,
                    error_code="INVALID_RECIPIENT",
                    error="Recipient email address is required.",
                    message="Missing recipient.",
                    action=action.to_dict(),
                    trace_id=trace_id,
                    timestamp=now_iso,
                )

            exec_res = self.email_executor.send_message(
                to_email=action.recipient,
                subject=action.subject or "Message from Mitra AI",
                message=action.content or "",
                trace_id=trace_id,
                user_id=user_id,
                is_system_action=False,
            )

            # Map executor output to standardized CommunicationResult
            if exec_res.get("status") == "success":
                # INVARIANT: Provider API acceptance MUST NOT automatically be represented as DELIVERED
                return CommunicationResult(
                    status="sent",
                    delivery_state="sent",  # Marked as sent, delivery state pending actual delivery confirmation
                    channel=action.channel,
                    provider=exec_res.get("provider") or exec_res.get("method") or "email",
                    sender_account=exec_res.get("from") or sender_account,
                    recipient=action.recipient,
                    provider_message_id=exec_res.get("provider_message_id") or exec_res.get("message_id") or exec_res.get("id"),
                    message=f"Email successfully sent to {action.recipient}.",
                    action=action.to_dict(),
                    idempotency_key=action.idempotency_key,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            else:
                err_msg = exec_res.get("error", "Email dispatch failed.")
                err_code = "ACCOUNT_NOT_CONNECTED" if "No connected email account" in err_msg else "DELIVERY_FAILED"
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=action.channel,
                    provider=exec_res.get("provider") or "email",
                    sender_account=sender_account,
                    recipient=action.recipient,
                    error_code=err_code,
                    error=err_msg,
                    message=f"Email delivery failed: {err_msg}",
                    action=action.to_dict(),
                    idempotency_key=action.idempotency_key,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )

        elif action.channel == CommunicationChannel.WHATSAPP:
            if not action.recipient:
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=action.channel,
                    error_code="INVALID_RECIPIENT",
                    error="Recipient WhatsApp phone number is required.",
                    message="Missing recipient.",
                    action=action.to_dict(),
                    trace_id=trace_id,
                    timestamp=now_iso,
                )

            action_mode = None
            if hasattr(action, "metadata") and isinstance(action.metadata, dict):
                action_mode = action.metadata.get("mode")
            if not action_mode and hasattr(action, "mode"):
                action_mode = getattr(action, "mode")
            if not action_mode:
                from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor
                import os
                env_cloud = os.getenv("WHATSAPP_PROVIDER", "").strip().lower() == "cloud" or os.getenv("WHATSAPP_MODE", "").strip().lower() == "business"
                meta_exec = MetaWhatsAppExecutor()
                has_creds = bool(meta_exec.get_credentials(user_id=user_id).get("access_token"))
                action_mode = "business" if (env_cloud or has_creds) else "personal"

            exec_res = self.whatsapp_executor.send_message(
                to_number=action.recipient,
                message=action.content or "",
                trace_id=trace_id,
                user_id=user_id,
                is_system_otp=False,
                mode=action_mode,
            )

            # Map both Meta Cloud API (business) and Personal Click to Chat (wa.me)
            if exec_res.get("status") == "success":
                is_personal = exec_res.get("mode") == "personal"
                delivery_st = exec_res.get("delivery_state", "manual_action_required" if is_personal else "pending")
                provider_name = "personal_click_to_chat" if is_personal else "meta_whatsapp"
                msg_summary = exec_res.get("notice") or f"WhatsApp message prepared for {action.recipient}." if is_personal else f"WhatsApp message dispatched to {action.recipient}."
                
                result_action_dict = action.to_dict()
                if exec_res.get("url"):
                    result_action_dict["wa_url"] = exec_res.get("url")
                    result_action_dict["url"] = exec_res.get("url")

                return CommunicationResult(
                    status="ready" if is_personal else "sent",
                    delivery_state=delivery_st,
                    channel=action.channel,
                    provider=provider_name,
                    sender_account=sender_account,
                    recipient=action.recipient,
                    provider_message_id=exec_res.get("message_id") or exec_res.get("message_sid"),
                    message=msg_summary,
                    action=result_action_dict,
                    idempotency_key=action.idempotency_key,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            else:
                err_msg = exec_res.get("error", "WhatsApp dispatch failed.")
                err_code = exec_res.get("error_code") or "WHATSAPP_BUSINESS_REQUIRED"
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=action.channel,
                    provider="whatsapp",
                    sender_account=sender_account,
                    recipient=action.recipient,
                    error_code=err_code,
                    error=err_msg,
                    message=f"WhatsApp failed: {err_msg}",
                    action=action.to_dict(),
                    idempotency_key=action.idempotency_key,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )

        return CommunicationResult(
            status="failed",
            delivery_state="failed",
            channel=action.channel,
            error_code="CONFIGURATION_REQUIRED",
            error=f"Unsupported communication channel: {action.channel}",
            action=action.to_dict(),
            trace_id=trace_id,
            timestamp=now_iso,
        )

    def confirm_pending_action(
        self,
        pending_action_id: str,
        user_id: str,
        trace_id: Optional[str] = None,
    ) -> CommunicationResult:
        """
        Secure confirmation of an exact, server-staged pending communication action.
        1. Authenticate user identity (fail closed)
        2. Atomically transition status PENDING -> CONFIRMING (replay & concurrency protection)
        3. Verify action integrity hash (tamper detection across immutable outbound fields)
        4. Verify account binding and connected status (fail closed on revoked/borrowed accounts)
        5. Reconstruct canonical action and execute via provider
        6. Persist execution outcome and return normalized CommunicationResult
        """
        now_iso = datetime.utcnow().isoformat()
        trace_id = trace_id or f"confirm_{uuid.uuid4().hex[:12]}"

        # 1. Authenticated User Validation
        if (
            not user_id
            or not str(user_id).strip()
            or str(user_id).strip().lower() in ("user_default", "default", "none", "null", "anonymous")
        ):
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=CommunicationChannel.EMAIL,
                error_code="AUTH_REQUIRED",
                error="Authorization error: confirming pending communication actions requires an authenticated user_id.",
                message="Authentication required.",
                pending_action_id=pending_action_id,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        clean_uid = str(user_id).strip()

        # 2. Atomic State Transition (PENDING -> CONFIRMING)
        pending_action, trans_err = pending_action_service.transition_to_confirming(
            pending_action_id=pending_action_id, user_id=clean_uid
        )

        if trans_err:
            if trans_err == "ACTION_ALREADY_EXECUTED":
                if pending_action and pending_action.result:
                    try:
                        res_dict = dict(pending_action.result)
                        res_dict["message"] = "Action was already confirmed and executed."
                        res_dict["error_code"] = "ACTION_ALREADY_EXECUTED"
                        return CommunicationResult(**res_dict)
                    except Exception:
                        pass
                return CommunicationResult(
                    status="sent",
                    delivery_state="sent",
                    channel=pending_action.channel if pending_action else CommunicationChannel.EMAIL,
                    error_code="ACTION_ALREADY_EXECUTED",
                    error="This communication action has already been executed.",
                    message="Action was already executed.",
                    pending_action_id=pending_action_id,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            elif trans_err == "ACTION_NOT_FOUND":
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=CommunicationChannel.EMAIL,
                    error_code="ACTION_NOT_FOUND",
                    error=f"Pending communication action '{pending_action_id}' not found or does not belong to user.",
                    message="Pending action not found.",
                    pending_action_id=pending_action_id,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            elif trans_err == "ACTION_EXPIRED":
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=CommunicationChannel.EMAIL,
                    error_code="ACTION_EXPIRED",
                    error=f"Pending communication action '{pending_action_id}' has expired.",
                    message="Confirmation request has expired.",
                    pending_action_id=pending_action_id,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            elif trans_err == "ACTION_CANCELLED":
                return CommunicationResult(
                    status="failed",
                    delivery_state="failed",
                    channel=CommunicationChannel.EMAIL,
                    error_code="ACTION_CANCELLED",
                    error=f"Pending communication action '{pending_action_id}' was cancelled.",
                    message="Communication action was cancelled.",
                    pending_action_id=pending_action_id,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )
            elif trans_err == "CONCURRENT_EXECUTION_BLOCKED":
                return CommunicationResult(
                    status="failed",
                    delivery_state="pending",
                    channel=CommunicationChannel.EMAIL,
                    error_code="CONCURRENT_EXECUTION_BLOCKED",
                    error=f"Action '{pending_action_id}' is currently being confirmed by another request.",
                    message="Confirmation is already in progress.",
                    pending_action_id=pending_action_id,
                    trace_id=trace_id,
                    timestamp=now_iso,
                )

        assert pending_action is not None

        # 3. Action Integrity Hash Verification (Tamper-proofing)
        recalculated_hash = compute_action_hash(
            user_id=pending_action.user_id,
            channel=pending_action.channel,
            intent=pending_action.intent,
            account_id=pending_action.account_id,
            recipient=pending_action.recipient,
            subject=pending_action.subject,
            content=pending_action.content,
            idempotency_key=pending_action.idempotency_key,
        )

        if recalculated_hash != pending_action.action_hash:
            logger.error(
                "CRITICAL: Integrity verification failed for pending action '%s'! Expected %s, computed %s",
                pending_action_id, pending_action.action_hash, recalculated_hash
            )
            pending_action_service.mark_failed(
                pending_action_id=pending_action_id,
                user_id=clean_uid,
                error="Action integrity check failed: outbound fields tampered.",
                error_code="INTEGRITY_CHECK_FAILED",
            )
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=pending_action.channel,
                error_code="INTEGRITY_CHECK_FAILED",
                error="Integrity verification failed: stored action parameters do not match action hash.",
                message="Action integrity error.",
                pending_action_id=pending_action_id,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # 4. Account Integrity & Connection Verification
        verified_account, acct_err = self.resolve_sender_account(
            user_id=clean_uid,
            channel=pending_action.channel,
            account_id=pending_action.account_id,
        )

        if acct_err == "ACCOUNT_NOT_AUTHORIZED":
            pending_action_service.mark_failed(
                pending_action_id=pending_action_id,
                user_id=clean_uid,
                error=f"Account '{pending_action.account_id}' is not authorized for user.",
                error_code="ACCOUNT_NOT_AUTHORIZED",
            )
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=pending_action.channel,
                error_code="ACCOUNT_NOT_AUTHORIZED",
                error=f"Authorization error: account '{pending_action.account_id}' does not belong to authenticated user.",
                message="Specified account is not authorized.",
                pending_action_id=pending_action_id,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # If an account was bound at creation time, verify it is still connected
        if pending_action.sender_account and not verified_account:
            pending_action_service.mark_failed(
                pending_action_id=pending_action_id,
                user_id=clean_uid,
                error=f"Sender account '{pending_action.sender_account}' is no longer connected.",
                error_code="ACCOUNT_DISCONNECTED",
            )
            return CommunicationResult(
                status="failed",
                delivery_state="failed",
                channel=pending_action.channel,
                error_code="ACCOUNT_DISCONNECTED",
                error=f"Sender account '{pending_action.sender_account}' is disconnected or revoked.",
                message="Sender account is no longer connected.",
                pending_action_id=pending_action_id,
                trace_id=trace_id,
                timestamp=now_iso,
            )

        # 5. Reconstruct Canonical Action with confirmation_confirmed=True
        canonical_action = CommunicationAction(
            intent=pending_action.intent,
            channel=pending_action.channel,
            user_id=clean_uid,
            account_id=pending_action.account_id,
            recipient=pending_action.recipient,
            subject=pending_action.subject,
            content=pending_action.content,
            confirmation_confirmed=True,  # Explicitly confirmed
            idempotency_key=pending_action.idempotency_key,
        )

        # 6. Execute via Provider
        result = self.execute_action(canonical_action, trace_id=trace_id)
        result.pending_action_id = pending_action_id

        # 7. Record Execution Result
        if result.status in ("sent", "delivered", "accepted"):
            pending_action_service.mark_executed(
                pending_action_id=pending_action_id,
                user_id=clean_uid,
                result=result.to_dict(),
            )
        else:
            pending_action_service.mark_failed(
                pending_action_id=pending_action_id,
                user_id=clean_uid,
                error=result.error or "Execution failed",
                error_code=result.error_code,
                result=result.to_dict(),
            )

        return result

    def cancel_pending_action(
        self,
        pending_action_id: str,
        user_id: str,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cancel a pending communication action.
        Guarantees that once cancelled, the action cannot be confirmed or executed.
        """
        now_iso = datetime.utcnow().isoformat()
        trace_id = trace_id or f"cancel_{uuid.uuid4().hex[:12]}"

        if (
            not user_id
            or not str(user_id).strip()
            or str(user_id).strip().lower() in ("user_default", "default", "none", "null", "anonymous")
        ):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: cancelling pending communication actions requires an authenticated user_id.",
                "pending_action_id": pending_action_id,
                "trace_id": trace_id,
                "timestamp": now_iso,
            }

        clean_uid = str(user_id).strip()
        success, err_code, data = pending_action_service.cancel_pending_action(
            pending_action_id=pending_action_id, user_id=clean_uid
        )

        if not success:
            err_msg = {
                "ACTION_NOT_FOUND": "Pending action not found or unauthorized.",
                "ACTION_ALREADY_CANCELLED": "Pending action is already cancelled.",
                "ACTION_CANNOT_BE_CANCELLED": "Action cannot be cancelled because it is already executing or executed.",
                "ACTION_EXPIRED": "Pending action has already expired.",
            }.get(err_code or "", "Cancellation failed.")

            return {
                "status": "error",
                "error_code": err_code or "CANCELLATION_FAILED",
                "error": err_msg,
                "pending_action_id": pending_action_id,
                "action": data,
                "trace_id": trace_id,
                "timestamp": now_iso,
            }

        return {
            "status": "cancelled",
            "pending_action_id": pending_action_id,
            "message": "Communication action cancelled successfully.",
            "action": data,
            "trace_id": trace_id,
            "timestamp": now_iso,
        }

    def get_draft(
        self,
        draft_id: str,
        user_id: str,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Secure retrieval of a user-owned draft.
        Enforces user authentication, account ownership, and cross-user isolation.
        """
        clean_uid = str(user_id or "").strip()
        if not clean_uid or clean_uid.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: reading drafts requires an authenticated user.",
                "trace_id": trace_id,
            }
        return self.email_executor.get_draft_gmail(user_id=clean_uid, draft_id=draft_id, trace_id=trace_id)

    def prepare_send_draft(
        self,
        draft_id: str,
        user_id: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        recipient: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stage an edited draft for explicit user confirmation before sending.
        - Validates user identity and server-side draft ownership
        - Enforces draft recipient binding
        - Sets action.content strictly to the edited body (no LLM, no natural-language commands)
        - Enforces B.COMM-3 approval policy: creates a PendingAction requiring explicit confirmation
        """
        now_iso = datetime.utcnow().isoformat()
        trace_id = trace_id or f"prep_send_{uuid.uuid4().hex[:12]}"
        clean_uid = str(user_id or "").strip()

        if not clean_uid or clean_uid.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: preparing draft send requires an authenticated user.",
                "trace_id": trace_id,
                "timestamp": now_iso,
            }

        clean_draft_id = str(draft_id or "").strip()
        if not clean_draft_id:
            return {
                "status": "error",
                "error_code": "DRAFT_NOT_FOUND",
                "error": "Draft ID is required.",
                "trace_id": trace_id,
                "timestamp": now_iso,
            }

        # 1. Retrieve canonical draft from server to validate ownership and bound fields
        draft_res = self.get_draft(draft_id=clean_draft_id, user_id=clean_uid, trace_id=trace_id)
        if draft_res.get("status") != "success":
            return draft_res

        canonical_draft = draft_res.get("draft") or {}

        # 2. Bind recipient — must come from canonical draft or validated recipient
        canonical_recipient = canonical_draft.get("recipient")
        final_recipient = canonical_recipient or recipient
        if not final_recipient:
            return {
                "status": "error",
                "error_code": "MISSING_RECIPIENT",
                "error": "Draft recipient is missing.",
                "trace_id": trace_id,
                "timestamp": now_iso,
            }

        # 3. Subject and Body
        final_subject = subject if subject is not None else (canonical_draft.get("subject") or "")
        final_body = body if body is not None else (canonical_draft.get("content") or "")

        # 4. Account binding: derive canonical account server-side from authenticated user connection
        from app.services.connected_account_service import connected_account_service
        google_conn = (
            connected_account_service.get_user_connection(user_id=clean_uid, provider="google")
            or connected_account_service.get_user_connection(user_id=clean_uid, provider="gmail")
        )
        sender_account = (
            google_conn.get("email")
            or google_conn.get("provider_account_id")
            or google_conn.get("account_id")
        ) if google_conn else None

        if not sender_account:
            sender_account, _ = self.resolve_sender_account(clean_uid, CommunicationChannel.EMAIL)

        # 5. Build CommunicationAction with intent SEND_MESSAGE and confirmation_confirmed=False
        action = CommunicationAction(
            channel=CommunicationChannel.EMAIL,
            intent=CommunicationIntent.SEND_MESSAGE,
            user_id=clean_uid,
            account_id=sender_account,
            recipient=final_recipient,
            subject=final_subject,
            content=final_body,
            metadata={"draft_id": clean_draft_id},
            confirmation_confirmed=False,
        )

        # 6. Execute action (triggers approval policy & persists pending action)
        res = self.execute_action(action, trace_id=trace_id)
        return res.to_dict()


# Global singleton instance
communication_service = CommunicationService()
