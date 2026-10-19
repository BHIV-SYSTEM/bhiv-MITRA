import os
import smtplib
import socket
import requests
import email.utils
import email.header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
import logging
import base64
import json

logger = logging.getLogger(__name__)

def _get_db():
    """Synchronous MongoDB connection helper for saving email logs."""
    try:
        from pymongo import MongoClient
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        return client[db_name]
    except Exception:
        return None

import ipaddress

BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),      # IPv4 loopback
    ipaddress.ip_network("10.0.0.0/8"),       # RFC 1918 private
    ipaddress.ip_network("172.16.0.0/12"),    # RFC 1918 private
    ipaddress.ip_network("192.168.0.0/16"),   # RFC 1918 private
    ipaddress.ip_network("169.254.0.0/16"),   # Link-local / Cloud metadata (includes 169.254.169.254)
    ipaddress.ip_network("100.64.0.0/10"),    # Carrier-grade NAT
    ipaddress.ip_network("0.0.0.0/8"),        # Current network
    ipaddress.ip_network("224.0.0.0/4"),      # Multicast
    ipaddress.ip_network("240.0.0.0/4"),      # Reserved
    ipaddress.ip_network("::1/128"),          # IPv6 loopback
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
    ipaddress.ip_network("fc00::/7"),         # IPv6 unique local (private)
    ipaddress.ip_network("::/128"),           # IPv6 unspecified
]

def validate_safe_mail_host(hostname: str) -> str:
    """
    Validate that hostname does not resolve to loopback, private RFC 1918, link-local,
    or cloud metadata IP addresses (SSRF protection).
    Returns the resolved safe IPv4 address for socket connections.
    """
    if not hostname or not isinstance(hostname, str):
        raise ValueError("Invalid mail hostname: hostname is required.")

    clean_host = hostname.strip().lower()

    # Block localhost explicitly
    if clean_host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise ValueError(f"Connection to '{clean_host}' is blocked (SSRF protection).")

    # Resolve all addresses (both IPv4 and IPv6)
    try:
        addr_info = socket.getaddrinfo(clean_host, None)
    except socket.gaierror as e:
        raise ValueError(f"Failed to resolve mail host '{clean_host}': {e}")
    except Exception as e:
        raise ValueError(f"DNS resolution error for mail host '{clean_host}': {e}")

    if not addr_info:
        raise ValueError(f"No IP addresses resolved for mail host '{clean_host}'.")

    resolved_ipv4 = None

    for item in addr_info:
        ip_str = item[4][0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            raise ValueError(f"Invalid resolved IP '{ip_str}' for mail host '{clean_host}'.")

        # Check against all blocked networks and properties
        if (
            ip_obj.is_loopback
            or ip_obj.is_private
            or ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_reserved
            or ip_obj.is_unspecified
        ):
            raise ValueError(f"Connection to restricted network address '{ip_str}' is blocked (SSRF protection).")

        for net in BLOCKED_IP_NETWORKS:
            if ip_obj in net:
                raise ValueError(f"Connection to restricted network address '{ip_str}' in '{net}' is blocked (SSRF protection).")

        if isinstance(ip_obj, ipaddress.IPv4Address) and resolved_ipv4 is None:
            resolved_ipv4 = ip_str

    return resolved_ipv4 or addr_info[0][4][0]

def _get_ipv4_host(hostname: str) -> str:
    """Resolve and validate hostname with SSRF protection."""
    return validate_safe_mail_host(hostname)

def parse_rfc_sender(raw_sender: Any) -> Tuple[str, str, str]:
    """
    Parses an RFC 2822 sender string into (display_name, email_address, formatted_display).
    Handles MIME encoded words, quote stripping, bracket normalization, and bare addresses.
    Falls back gracefully when sender information is absent or non-standard.
    """
    if not raw_sender or not isinstance(raw_sender, str):
        return "", "", ""

    s = raw_sender.strip()
    if not s:
        return "", "", ""

    # Decode MIME encoded-words (=?UTF-8?B?...?= or =?UTF-8?Q?...?=) if present
    try:
        chunks = email.header.decode_header(s)
        parts = []
        for c, enc in chunks:
            if isinstance(c, bytes):
                parts.append(c.decode(enc or "utf-8", errors="replace"))
            else:
                parts.append(str(c))
        s = "".join(parts).strip()
    except Exception:
        pass

    try:
        name, addr = email.utils.parseaddr(s)
        name = name.strip("\"' ").strip()
        addr = addr.strip("<> ").strip()
        if "@" in addr:
            if name:
                return name, addr, f"{name} <{addr}>"
            return "", addr, addr
        clean = s.strip("<>\"' ").strip()
        return clean, "", clean
    except Exception:
        clean = s.strip("<>\"' ").strip()
        return clean, "", clean

class EmailExecutor:
    def _create_fallback_message_stub(
        self, msg_id: str, thread_id: str = "", labels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Creates a canonical empty fallback message stub for failed or partial item fetches."""
        now_iso = datetime.utcnow().isoformat()
        return {
            "id": msg_id,
            "message_id": msg_id,
            "thread_id": thread_id,
            "sender": "",
            "from": "",
            "sender_name": "",
            "sender_email": "",
            "sender_display": "",
            "recipient": "",
            "to": "",
            "subject": "",
            "snippet": "",
            "content": "",
            "body": "",
            "timestamp": now_iso,
            "date": now_iso,
            "has_attachments": False,
            "labels": labels if labels is not None else [],
        }

    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com").strip()
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.email_user = os.getenv("EMAIL_USER", "").strip()
        self.email_password = os.getenv("EMAIL_PASSWORD", "").strip()
        self.gmail_token = os.getenv("GMAIL_ACCESS_TOKEN")
        self.sendgrid_key = os.getenv("SENDGRID_API_KEY")
        self.sendgrid_from = os.getenv("SENDGRID_FROM_EMAIL", self.email_user)
        self.brevo_key = os.getenv("BREVO_API_KEY")
        self.brevo_from = os.getenv("BREVO_FROM_EMAIL", self.email_user)
        
    def _log_email_to_db(self, to_email: str, subject: str, message: str, method: str, status: str, trace_id: str):
        """Persist email log entry into MongoDB."""
        db = _get_db()
        if db is not None:
            try:
                db["email_logs"].insert_one({
                    "to": to_email,
                    "from": self.email_user or "user_connected_account",
                    "subject": subject,
                    "message": message,
                    "method": method,
                    "status": status,
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                })
            except Exception as e:
                logger.warning(f"Email DB log failed: {e}")

    def send_email_smtp(
        self,
        to_email: str,
        subject: str,
        message: str,
        trace_id: str,
        sender_email: Optional[str] = None,
        sender_pass: Optional[str] = None,
        smtp_server: Optional[str] = None,
        smtp_port: Optional[int] = None
    ) -> Dict[str, Any]:
        """Send email via SMTP with SSRF-safe hostname validation and TLS verification."""
        user = (sender_email or self.email_user or "").strip()
        password = (sender_pass or self.email_password or "").strip()
        host = (smtp_server or self.smtp_server or "").strip()
        port = smtp_port or self.smtp_port or 587

        if not user or not password:
            return {
                "status": "error",
                "error": "SMTP credentials not configured",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }

        try:
            target_host = _get_ipv4_host(host)
        except ValueError as ssrf_err:
            logger.warning("SMTP host SSRF rejection for '%s': %s", host, ssrf_err)
            return {
                "status": "error",
                "error": str(ssrf_err),
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }

        msg = MIMEMultipart()
        msg['From'] = user
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(message, 'plain'))
        text = msg.as_string()

        import ssl
        ssl_ctx = ssl.create_default_context()

        # 1. Try SSL port 465 if configured or default
        if port == 465:
            try:
                server = smtplib.SMTP_SSL(target_host, 465, context=ssl_ctx, timeout=8)
                server.login(user, password)
                server.sendmail(user, to_email, text)
                server.quit()
                logger.info(f"Email sent via SMTP SSL (465) to {to_email}")
                self._log_email_to_db(to_email, subject, message, "smtp_ssl", "success", trace_id)
                return {
                    "status": "success",
                    "to": to_email,
                    "subject": subject,
                    "message": message,
                    "method": "smtp_ssl",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "email"
                }
            except Exception as ssl_err:
                logger.warning(f"SMTP SSL 465 failed: {ssl_err}")
                return {
                    "status": "error",
                    "error": f"SMTP SSL delivery failed: {str(ssl_err)}",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat()
                }

        # 2. Try STARTTLS port 587
        try:
            server = smtplib.SMTP(target_host, port, timeout=8)
            server.ehlo(host)
            server.starttls(context=ssl_ctx)
            server.ehlo(host)
            server.login(user, password)
            server.sendmail(user, to_email, text)
            server.quit()
            logger.info(f"Email sent via SMTP TLS ({port}) to {to_email}")
            self._log_email_to_db(to_email, subject, message, "smtp_tls", "success", trace_id)
            return {
                "status": "success",
                "to": to_email,
                "subject": subject,
                "message": message,
                "method": "smtp_tls",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat(),
                "platform": "email"
            }
        except Exception as tls_err:
            logger.warning(f"SMTP TLS {port} failed: {tls_err}")
            return {
                "status": "error",
                "error": f"SMTP TLS delivery failed: {str(tls_err)}",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }

    def _map_gmail_error(self, res: requests.Response) -> Dict[str, Any]:
        """Maps Gmail API HTTP status codes and error responses to canonical error codes."""
        status_code = res.status_code
        try:
            err_body = res.json()
            err_detail = err_body.get("error", {})
            err_msg = err_detail.get("message") or res.text
            err_reason = ""
            if isinstance(err_detail.get("errors"), list) and err_detail["errors"]:
                err_reason = err_detail["errors"][0].get("reason", "")
        except Exception:
            err_msg = res.text
            err_reason = ""

        if status_code in (401, 403):
            if "scope" in err_msg.lower() or "permission" in err_msg.lower() or err_reason in ("insufficientPermissions", "forbidden"):
                return {"status": "error", "error_code": "GMAIL_REAUTH_REQUIRED", "error": f"Gmail permissions insufficient: {err_msg}"}
            elif err_reason in ("rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"):
                return {"status": "error", "error_code": "GMAIL_RATE_LIMITED", "error": "Gmail rate limit exceeded. Please try again later."}
            return {"status": "error", "error_code": "GMAIL_PERMISSION_DENIED", "error": f"Gmail authorization error: {err_msg}"}
        elif status_code == 404:
            return {"status": "error", "error_code": "GMAIL_NOT_FOUND", "error": f"Requested Gmail resource not found: {err_msg}"}
        elif status_code == 429:
            return {"status": "error", "error_code": "GMAIL_RATE_LIMITED", "error": "Gmail rate limit exceeded. Please try again later."}
        elif status_code == 400:
            return {"status": "error", "error_code": "GMAIL_INVALID_QUERY", "error": f"Invalid Gmail request or query: {err_msg}"}
        else:
            return {"status": "error", "error_code": "GMAIL_PROVIDER_ERROR", "error": f"Gmail API error ({status_code}): {err_msg}"}

    def _normalize_gmail_message(self, raw_msg: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalizes a raw Gmail API message item into MITRA's standard message schema:
        { id, thread_id, sender, recipient, subject, snippet, content, timestamp, has_attachments, labels }
        """
        from app.executors.mime_builder import sanitize_html_content

        msg_id = raw_msg.get("id", "")
        thread_id = raw_msg.get("threadId", "")
        snippet = raw_msg.get("snippet", "")
        labels = raw_msg.get("labelIds", [])

        # Extract headers
        headers = raw_msg.get("payload", {}).get("headers", [])
        header_map = {}
        for h in headers:
            header_map[h.get("name", "").lower()] = h.get("value", "")

        sender = header_map.get("from") or header_map.get("sender") or ""
        recipient = header_map.get("to") or header_map.get("delivered-to") or ""
        subject = header_map.get("subject", "")
        raw_date = header_map.get("date", "")

        timestamp = raw_date
        if not timestamp:
            internal_date = raw_msg.get("internalDate")
            if internal_date:
                try:
                    timestamp = datetime.utcfromtimestamp(int(internal_date) / 1000).isoformat()
                except Exception:
                    timestamp = datetime.utcnow().isoformat()
            else:
                timestamp = datetime.utcnow().isoformat()

        text_body = ""
        html_body = ""
        has_attachments = False
        attachment_list = []

        def _traverse_part(part: Dict[str, Any], depth: int = 0):
            nonlocal text_body, html_body, has_attachments, attachment_list
            if depth > 5:
                return

            mime_type = part.get("mimeType", "").lower()
            filename = part.get("filename", "")
            body = part.get("body", {})

            if filename and body.get("attachmentId"):
                has_attachments = True
                safe_name = os.path.basename(filename)
                attachment_list.append({
                    "filename": safe_name,
                    "mime_type": mime_type,
                    "size": body.get("size", 0),
                    "attachment_id": body.get("attachmentId")
                })
            elif mime_type == "text/plain" and not text_body:
                data = body.get("data")
                if data:
                    try:
                        text_body = base64.urlsafe_b64decode(data.encode("ascii")).decode("utf-8", errors="replace")
                    except Exception:
                        pass
            elif mime_type == "text/html" and not html_body:
                data = body.get("data")
                if data:
                    try:
                        html_body = base64.urlsafe_b64decode(data.encode("ascii")).decode("utf-8", errors="replace")
                    except Exception:
                        pass

            for subpart in part.get("parts", []):
                _traverse_part(subpart, depth + 1)

        payload = raw_msg.get("payload", {})
        _traverse_part(payload)

        # Prefer text/plain, then sanitized HTML, then snippet
        if text_body.strip():
            content = text_body.strip()
        elif html_body.strip():
            content = sanitize_html_content(html_body.strip())
        else:
            content = snippet

        sender_name, sender_email, sender_display = parse_rfc_sender(sender)

        norm = {
            "id": msg_id,
            "message_id": msg_id,
            "thread_id": thread_id,
            "sender": sender,
            "from": sender,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "sender_display": sender_display or sender,
            "recipient": recipient,
            "to": recipient,
            "subject": subject,
            "snippet": snippet,
            "content": content,
            "body": content,
            "timestamp": timestamp,
            "date": timestamp,
            "has_attachments": has_attachments,
            "labels": labels,
        }
        if attachment_list:
            norm["attachments"] = attachment_list
        return norm

    def send_email_gmail_api(self, access_token: str, to_email: str, subject: str, message: str, trace_id: str) -> Optional[Dict[str, Any]]:
        """Send email via official Google Gmail OAuth 2.0 API with safe MIME encoding."""
        try:
            from app.executors.mime_builder import build_safe_rfc2822_message
            try:
                raw_bytes = build_safe_rfc2822_message(to_email=to_email, subject=subject, text_body=message)
                raw_msg = base64.urlsafe_b64encode(raw_bytes).decode("ascii")
            except ValueError as val_err:
                logger.warning(f"Safe MIME build error in send_email_gmail_api: {val_err}")
                return {
                    "status": "error",
                    "error_code": "GMAIL_PROVIDER_ERROR",
                    "error": str(val_err),
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat()
                }

            url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            res = requests.post(url, json={"raw": raw_msg}, headers=headers, timeout=10)
            if res.status_code in [200, 201]:
                logger.info(f"Email sent via Google Gmail API to {to_email}")
                self._log_email_to_db(to_email, subject, message, "gmail_oauth_api", "success", trace_id)
                res_data = res.json() if res.content else {}
                return {
                    "status": "success",
                    "to": to_email,
                    "subject": subject,
                    "message": message,
                    "provider_message_id": res_data.get("id"),
                    "thread_id": res_data.get("threadId"),
                    "method": "gmail_oauth_api",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "email"
                }
            else:
                logger.warning(f"Gmail API error {res.status_code}: {res.text}")
                mapped = self._map_gmail_error(res)
                mapped["trace_id"] = trace_id
                mapped["timestamp"] = datetime.utcnow().isoformat()
                return mapped
        except Exception as e:
            logger.warning(f"Gmail API dispatch exception: {e}")
        return None

    def create_draft_gmail(
        self,
        user_id: str,
        to_email: str,
        subject: str,
        message: str,
        html_body: Optional[str] = None,
        cc: Optional[Any] = None,
        bcc: Optional[Any] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a Gmail draft via users/me/drafts.
        INVARIANT: Does NOT transmit or send the email.
        Requires authenticated user and gmail.compose scope.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service
        from app.executors.mime_builder import build_safe_rfc2822_message

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: user-owned draft action requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_compose_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail compose permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        try:
            raw_bytes = build_safe_rfc2822_message(
                to_email=to_email,
                subject=subject,
                text_body=message,
                html_body=html_body,
                cc=cc,
                bcc=bcc,
                attachments=attachments
            )
            raw_b64 = base64.urlsafe_b64encode(raw_bytes).decode("ascii")
        except ValueError as val_err:
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": str(val_err),
                "trace_id": trace_id
            }

        url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {"message": {"raw": raw_b64}}

        try:
            res = requests.post(url, json=payload, headers=headers, timeout=10)
            if res.status_code in (200, 201):
                data = res.json()
                draft_id = data.get("id")
                thread_id = data.get("message", {}).get("threadId")
                return {
                    "status": "success",
                    "draft_id": draft_id,
                    "thread_id": thread_id,
                    "message": f"Draft created successfully for {to_email}.",
                    "trace_id": trace_id
                }
            else:
                return self._map_gmail_error(res)
        except Exception as exc:
            logger.error(f"Gmail create_draft exception: {exc}")
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def get_draft_gmail(
        self,
        user_id: str,
        draft_id: str,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves a single Gmail draft by ID via users/me/drafts/{id}?format=full.
        Requires gmail.compose or gmail.readonly scope.
        Validates user identity and enforces user-bound Gmail connection isolation.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: draft retrieval requires valid user identity.",
                "trace_id": trace_id
            }

        # Verify Gmail compose or read access
        if not (connected_account_service.has_gmail_compose_access(clean_user_id) or connected_account_service.has_gmail_read_access(clean_user_id)):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail draft permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        clean_draft_id = str(draft_id or "").strip()
        if not clean_draft_id:
            return {
                "status": "error",
                "error_code": "GMAIL_NOT_FOUND",
                "error": "Draft ID is required.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        url = f"https://gmail.googleapis.com/gmail/v1/users/me/drafts/{clean_draft_id}?format=full"
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                msg_payload = data.get("message", {})
                normalized = self._normalize_gmail_message(msg_payload)
                return {
                    "status": "success",
                    "draft_id": clean_draft_id,
                    "draft": {
                        "id": clean_draft_id,
                        "message_id": normalized.get("id"),
                        "thread_id": normalized.get("thread_id"),
                        "recipient": normalized.get("recipient"),
                        "subject": normalized.get("subject"),
                        "content": normalized.get("content") or normalized.get("snippet", ""),
                        "snippet": normalized.get("snippet"),
                        "timestamp": normalized.get("timestamp"),
                        "has_attachments": normalized.get("has_attachments", False),
                    },
                    "trace_id": trace_id
                }
            else:
                return self._map_gmail_error(res)
        except Exception as exc:
            logger.error(f"Gmail get_draft exception: {exc}")
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def read_inbox_gmail(
        self,
        user_id: str,
        limit: int = 20,
        page_token: Optional[str] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reads user inbox messages via users/me/messages. Bounded result size.
        Requires gmail.readonly scope.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: reading Gmail inbox requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_read_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail read permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        bounded_limit = max(1, min(int(limit or 20), 100))
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
        headers = {"Authorization": f"Bearer {access_token}"}
        params: Dict[str, Any] = {"maxResults": bounded_limit, "q": "label:INBOX"}
        if page_token:
            params["pageToken"] = str(page_token).strip()

        try:
            res = requests.get(url, headers=headers, params=params, timeout=10)
            if res.status_code != 200:
                return self._map_gmail_error(res)

            data = res.json()
            raw_list = data.get("messages", [])
            next_page = data.get("nextPageToken")

            normalized_list = []
            for item in raw_list:
                msg_id = item.get("id")
                if not msg_id:
                    continue
                try:
                    msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
                    msg_res = requests.get(msg_url, headers=headers, timeout=10)
                    if msg_res.status_code == 200:
                        normalized_list.append(self._normalize_gmail_message(msg_res.json()))
                    else:
                        normalized_list.append(self._create_fallback_message_stub(msg_id, item.get("threadId", ""), labels=["INBOX"]))
                except Exception:
                    normalized_list.append(self._create_fallback_message_stub(msg_id, item.get("threadId", ""), labels=["INBOX"]))

            return {
                "status": "success",
                "messages": normalized_list,
                "next_page_token": next_page,
                "trace_id": trace_id
            }
        except Exception as exc:
            logger.error(f"Gmail read_inbox exception: {exc}")
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def search_messages_gmail(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
        page_token: Optional[str] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Searches user messages via users/me/messages?q=...
        Validates query and bounds result size.
        Requires gmail.readonly scope.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: searching Gmail requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_read_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail read permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        # Query validation
        clean_query = str(query or "").strip()
        if not clean_query:
            return {
                "status": "error",
                "error_code": "GMAIL_INVALID_QUERY",
                "error": "Search query cannot be empty.",
                "trace_id": trace_id
            }
        if "\r" in clean_query or "\n" in clean_query:
            return {
                "status": "error",
                "error_code": "GMAIL_INVALID_QUERY",
                "error": "Invalid search query: contains newline characters.",
                "trace_id": trace_id
            }
        if len(clean_query) > 500:
            return {
                "status": "error",
                "error_code": "GMAIL_INVALID_QUERY",
                "error": "Search query exceeds maximum allowed length of 500 characters.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        bounded_limit = max(1, min(int(limit or 20), 100))
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
        headers = {"Authorization": f"Bearer {access_token}"}
        params: Dict[str, Any] = {"maxResults": bounded_limit, "q": clean_query}
        if page_token:
            params["pageToken"] = str(page_token).strip()

        try:
            res = requests.get(url, headers=headers, params=params, timeout=10)
            if res.status_code != 200:
                return self._map_gmail_error(res)

            data = res.json()
            raw_list = data.get("messages", [])
            next_page = data.get("nextPageToken")

            normalized_list = []
            for item in raw_list:
                msg_id = item.get("id")
                if not msg_id:
                    continue
                try:
                    msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
                    msg_res = requests.get(msg_url, headers=headers, timeout=10)
                    if msg_res.status_code == 200:
                        normalized_list.append(self._normalize_gmail_message(msg_res.json()))
                    else:
                        normalized_list.append(self._create_fallback_message_stub(msg_id, item.get("threadId", ""), labels=[]))
                except Exception:
                    normalized_list.append(self._create_fallback_message_stub(msg_id, item.get("threadId", ""), labels=[]))

            return {
                "status": "success",
                "messages": normalized_list,
                "next_page_token": next_page,
                "query": clean_query,
                "trace_id": trace_id
            }
        except Exception as exc:
            logger.error(f"Gmail search_messages exception: {exc}")
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def get_message_gmail(self, user_id: str, message_id: str, trace_id: Optional[str] = None) -> Dict[str, Any]:
        """Retrieves a single message by ID via users/me/messages/{messageId}."""
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: message retrieval requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_read_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail read permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        clean_msg_id = str(message_id or "").strip()
        if not clean_msg_id:
            return {
                "status": "error",
                "error_code": "GMAIL_NOT_FOUND",
                "error": "Message ID is required.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{clean_msg_id}?format=full"
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                normalized = self._normalize_gmail_message(res.json())
                return {
                    "status": "success",
                    "message": normalized,
                    "trace_id": trace_id
                }
            else:
                return self._map_gmail_error(res)
        except Exception as exc:
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def get_thread_gmail(self, user_id: str, thread_id: str, trace_id: Optional[str] = None) -> Dict[str, Any]:
        """Retrieves a message thread by ID via users/me/threads/{threadId}."""
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: thread retrieval requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_read_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail read permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        clean_thread_id = str(thread_id or "").strip()
        if not clean_thread_id:
            return {
                "status": "error",
                "error_code": "GMAIL_NOT_FOUND",
                "error": "Thread ID is required.",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        url = f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{clean_thread_id}?format=full"
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                raw_msgs = data.get("messages", [])
                normalized_msgs = [self._normalize_gmail_message(m) for m in raw_msgs]
                return {
                    "status": "success",
                    "thread_id": clean_thread_id,
                    "messages": normalized_msgs,
                    "trace_id": trace_id
                }
            else:
                return self._map_gmail_error(res)
        except Exception as exc:
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def download_gmail_attachment(
        self,
        user_id: str,
        message_id: str,
        attachment_id: str,
        filename: Optional[str] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Downloads a specific attachment payload on demand.
        Enforces path traversal protection, user scoping, and 25MB maximum size.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service

        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null", "anonymous"):
            return {
                "status": "error",
                "error_code": "AUTH_REQUIRED",
                "error": "Authentication required: attachment download requires valid user identity.",
                "trace_id": trace_id
            }

        if not connected_account_service.has_gmail_read_access(clean_user_id):
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Gmail read permission required. Please upgrade Gmail access in Settings.",
                "trace_id": trace_id
            }

        clean_msg_id = str(message_id or "").strip()
        clean_att_id = str(attachment_id or "").strip()
        if not clean_msg_id or not clean_att_id:
            return {
                "status": "error",
                "error_code": "GMAIL_INVALID_ATTACHMENT",
                "error": "Both message_id and attachment_id are required.",
                "trace_id": trace_id
            }

        # Safe filename extraction (no path traversal, no absolute paths)
        raw_name = filename or "attachment.bin"
        safe_filename = os.path.basename(raw_name).strip()
        if not safe_filename or safe_filename in (".", "..") or "/" in safe_filename or "\\" in safe_filename:
            return {
                "status": "error",
                "error_code": "GMAIL_INVALID_ATTACHMENT",
                "error": f"Invalid or unsafe attachment filename: '{filename}'",
                "trace_id": trace_id
            }

        access_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
        if not access_token:
            return {
                "status": "error",
                "error_code": "GMAIL_REAUTH_REQUIRED",
                "error": "Failed to obtain valid Google access token. Please re-authenticate your Google account.",
                "trace_id": trace_id
            }

        url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{clean_msg_id}/attachments/{clean_att_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            res = requests.get(url, headers=headers, timeout=15)
            if res.status_code == 200:
                att_json = res.json()
                size = att_json.get("size", 0)
                if size > 25 * 1024 * 1024:
                    return {
                        "status": "error",
                        "error_code": "GMAIL_ATTACHMENT_TOO_LARGE",
                        "error": f"Attachment size ({size} bytes) exceeds maximum allowable size of 25MB.",
                        "trace_id": trace_id
                    }
                return {
                    "status": "success",
                    "attachment_id": clean_att_id,
                    "message_id": clean_msg_id,
                    "filename": safe_filename,
                    "size": size,
                    "data_base64": att_json.get("data"),
                    "trace_id": trace_id
                }
            else:
                return self._map_gmail_error(res)
        except Exception as exc:
            return {
                "status": "error",
                "error_code": "GMAIL_PROVIDER_ERROR",
                "error": f"Failed communicating with Gmail API: {str(exc)}",
                "trace_id": trace_id
            }

    def send_email_outlook_api(self, access_token: str, to_email: str, subject: str, message: str, trace_id: str) -> Optional[Dict[str, Any]]:
        """Send email via official Microsoft Graph API."""
        try:
            url = "https://graph.microsoft.com/v1.0/me/sendMail"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            payload = {
                "message": {
                    "subject": subject,
                    "body": {
                        "contentType": "Text",
                        "content": message
                    },
                    "toRecipients": [
                        {
                            "emailAddress": {
                                "address": to_email
                            }
                        }
                    ]
                },
                "saveToSentItems": "true"
            }
            res = requests.post(url, json=payload, headers=headers, timeout=10)
            if res.status_code in [200, 202]:
                logger.info(f"Email sent via Microsoft Graph Outlook API to {to_email}")
                self._log_email_to_db(to_email, subject, message, "outlook_oauth_api", "success", trace_id)
                return {
                    "status": "success",
                    "to": to_email,
                    "subject": subject,
                    "message": message,
                    "method": "outlook_oauth_api",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "email"
                }
            else:
                logger.warning(f"Microsoft Graph sendMail error {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Outlook API dispatch exception: {e}")
        return None

    def send_message(
        self,
        to_email: str,
        subject: str,
        message: str,
        trace_id: str,
        user_id: Optional[str] = None,
        is_system_action: bool = False
    ) -> Dict[str, Any]:
        """
        Send email message.
        - For user-owned actions (is_system_action=False): requires valid user_id and an authorized
          connected account (Google OAuth, Microsoft OAuth, or verified user SMTP).
          NEVER falls back to system credentials or another user's credentials.
        - For system actions (is_system_action=True): uses system SMTP credentials if configured.
        """
        from app.services.connected_account_service import connected_account_service
        from app.services.token_refresh_service import token_refresh_service
        from app.core.encryption import decrypt_secret, is_encrypted

        clean_user_id = str(user_id).strip() if user_id else ""

        # 1. Enforce user ownership for user-directed communication
        if not is_system_action:
            if not clean_user_id or clean_user_id.lower() in ("user_default", "default", "none", "null"):
                logger.warning(
                    "EmailExecutor rejected user action: missing or invalid authenticated user_id '%s'",
                    clean_user_id
                )
                return {
                    "status": "error",
                    "error": "Authentication required: user-owned email actions require a valid authenticated user identity.",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat()
                }

            # 1a. Try Google OAuth
            try:
                oauth_token = token_refresh_service.get_valid_access_token(clean_user_id, "google")
                if oauth_token:
                    res_gmail = self.send_email_gmail_api(oauth_token, to_email, subject, message, trace_id)
                    if res_gmail and res_gmail.get("status") == "success":
                        res_gmail["user_connected_account"] = True
                        return res_gmail
                    elif res_gmail and res_gmail.get("status") == "error":
                        return res_gmail
            except Exception as e:
                logger.warning("Google OAuth dispatch error for %s: %s", clean_user_id, e)

            # 1b. Try Microsoft OAuth
            try:
                ms_token = token_refresh_service.get_valid_access_token(clean_user_id, "microsoft")
                if ms_token:
                    res_outlook = self.send_email_outlook_api(ms_token, to_email, subject, message, trace_id)
                    if res_outlook and res_outlook.get("status") == "success":
                        res_outlook["user_connected_account"] = True
                        return res_outlook
                    elif res_outlook and res_outlook.get("status") == "error":
                        return res_outlook
            except Exception as e:
                logger.warning("Microsoft OAuth dispatch error for %s: %s", clean_user_id, e)

            # 1c. Try canonical connected_account_service app password
            try:
                conn = connected_account_service.get_user_connection(clean_user_id, "gmail", include_decrypted_tokens=True)
                if conn and conn.get("status") == "connected" and conn.get("access_token"):
                    sender_email = conn.get("email") or ""
                    sender_pass = conn.get("access_token")
                    logger.info("Using user '%s' connected personal Gmail (%s) via connected_account_service.", clean_user_id, sender_email)
                    res = self.send_email_smtp(
                        to_email=to_email,
                        subject=subject,
                        message=message,
                        trace_id=trace_id,
                        sender_email=sender_email,
                        sender_pass=sender_pass,
                        smtp_server="smtp.gmail.com",
                        smtp_port=587
                    )
                    res["user_connected_account"] = True
                    return res
            except Exception as exc:
                logger.warning("Connected account app password error for %s: %s", clean_user_id, exc)

            # 1d. Try connected custom SMTP
            try:
                conn_smtp = connected_account_service.get_user_connection(clean_user_id, "smtp", include_decrypted_tokens=True)
                if conn_smtp and conn_smtp.get("status") == "connected" and conn_smtp.get("access_token"):
                    extra = conn_smtp.get("extra_data", {})
                    smtp_server = extra.get("smtp_server") or self.smtp_server
                    smtp_port = int(extra.get("smtp_port") or 587)
                    res = self.send_email_smtp(
                        to_email=to_email,
                        subject=subject,
                        message=message,
                        trace_id=trace_id,
                        sender_email=conn_smtp.get("email"),
                        sender_pass=conn_smtp.get("access_token"),
                        smtp_server=smtp_server,
                        smtp_port=smtp_port
                    )
                    res["user_connected_account"] = True
                    return res
            except Exception as exc:
                logger.warning("Connected custom SMTP error for %s: %s", clean_user_id, exc)

            # 1e. Fallback to legacy user_integrations with decryption
            db = _get_db()
            if db is not None:
                try:
                    user_integration = db["user_integrations"].find_one({"user_id": clean_user_id})
                    if user_integration and "gmail" in user_integration and user_integration["gmail"].get("connected"):
                        user_gmail = user_integration["gmail"]
                        sender_email = user_gmail.get("email") or ""
                        pass_val = user_gmail.get("encrypted_app_password") or user_gmail.get("app_password")
                        sender_pass = decrypt_secret(pass_val) if is_encrypted(pass_val) else pass_val
                        logger.info("Using user '%s' personal Gmail (%s) from user_integrations.", clean_user_id, sender_email)
                        res = self.send_email_smtp(
                            to_email=to_email,
                            subject=subject,
                            message=message,
                            trace_id=trace_id,
                            sender_email=sender_email,
                            sender_pass=sender_pass,
                            smtp_server="smtp.gmail.com",
                            smtp_port=587
                        )
                        res["user_connected_account"] = True
                        return res
                    elif user_integration and "smtp" in user_integration and user_integration["smtp"].get("connected"):
                        user_smtp = user_integration["smtp"]
                        sender_email = user_smtp.get("email") or ""
                        raw_p = user_smtp.get("password") or ""
                        sender_pass = decrypt_secret(raw_p) if is_encrypted(raw_p) else raw_p
                        smtp_server = user_smtp.get("smtp_server") or self.smtp_server
                        smtp_port = int(user_smtp.get("smtp_port") or 587)
                        res = self.send_email_smtp(
                            to_email=to_email,
                            subject=subject,
                            message=message,
                            trace_id=trace_id,
                            sender_email=sender_email,
                            sender_pass=sender_pass,
                            smtp_server=smtp_server,
                            smtp_port=smtp_port
                        )
                        res["user_connected_account"] = True
                        return res
                except Exception as exc:
                    logger.warning("Failed loading user integration for %s: %s", clean_user_id, exc)

            # Non-production development fallback to configured system SMTP
            env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
            if env not in ("production", "prod") and self.email_user and self.email_password:
                logger.info("Non-production environment: falling back to system SMTP (%s) for user '%s'", self.email_user, clean_user_id)
                res = self.send_email_smtp(
                    to_email=to_email,
                    subject=subject,
                    message=message,
                    trace_id=trace_id,
                    sender_email=self.email_user,
                    sender_pass=self.email_password,
                    smtp_server=self.smtp_server,
                    smtp_port=self.smtp_port
                )
                res["user_connected_account"] = True
                res["fallback_system_account"] = True
                return res

            # STRICT NO-FALLBACK RULE for Production: Never fall back to system credentials for user-owned communication
            return {
                "status": "error",
                "error": "No connected email account found for authenticated user. Please connect your Gmail, Microsoft, or SMTP account in Settings.",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }

        # 2. System Actions ONLY: Uses system SMTP credentials
        if not self.email_user or not self.email_password:
            return {
                "status": "error",
                "error": "System SMTP credentials not configured in environment.",
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }

        res = self.send_email_smtp(
            to_email=to_email,
            subject=subject,
            message=message,
            trace_id=trace_id,
            sender_email=self.email_user,
            sender_pass=self.email_password,
            smtp_server=self.smtp_server,
            smtp_port=self.smtp_port
        )
        res["user_connected_account"] = False
        return res