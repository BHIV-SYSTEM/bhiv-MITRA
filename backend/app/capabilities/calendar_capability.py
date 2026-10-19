"""
calendar_capability.py — Mitra Calendar Capability

Creates, views, and manages calendar events.
Events are PERSISTED to MongoDB so they show in the calendar panel.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from app.capabilities.base_capability import BaseCapability, CapabilityResult
import logging

logger = logging.getLogger(__name__)


def _save_event_to_db(user_id: str, title: str, date_str: str, time_str: str, trace_id: str,
                      provider: Optional[str] = None, provider_event_id: Optional[str] = None,
                      sync_status: str = "Saved only in Mitra") -> Optional[str]:
    """Save calendar event to MongoDB with provider synchronization status. Returns event_id or None."""
    try:
        from pymongo import MongoClient
        import os
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        db = client[db_name]

        now = datetime.now(timezone.utc)
        event_id = f"ev_{uuid4().hex[:8]}"

        # Parse date/time
        try:
            if date_str and "T" in date_str:
                start = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            elif date_str:
                start = datetime.fromisoformat(date_str)
            else:
                start = now + timedelta(hours=1)
        except Exception:
            start = now + timedelta(hours=1)

        end = start + timedelta(hours=1)

        doc = {
            "_id": event_id,
            "user_id": user_id,
            "title": title,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "color": "#7c5cfc",
            "description": f"Created via Mitra companion",
            "location": "",
            "trace_id": trace_id,
            "provider": provider,
            "provider_event_id": provider_event_id,
            "sync_status": sync_status,
            "created_at": now.isoformat(),
        }

        db["calendar_events"].insert_one(doc)
        logger.info(f"Calendar event saved to DB: {event_id} — {title} [{sync_status}]")
        return event_id
    except Exception as e:
        logger.warning(f"Failed to save calendar event to DB: {e}")
        return None


def _get_user_events_from_db(user_id: str) -> List[Dict[str, Any]]:
    """Fetch calendar events for user from MongoDB with strict enterprise user data isolation."""
    try:
        from pymongo import MongoClient
        import os
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.getenv("DATABASE_NAME", "ai_assistant")
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        db = client[db_name]
        docs = list(db["calendar_events"].find({"user_id": user_id}).sort("created_at", -1).limit(20))
        filtered = []
        dummy_exact = {"what is the calendar", "create a calendar event", "new event", "calendar", "check my calendar"}
        for doc in docs:
            t_lower = (doc.get("title") or "").lower().strip()
            if t_lower in dummy_exact or t_lower.startswith("what is the calendar"):
                continue
            doc["id"] = str(doc.get("_id"))
            doc.pop("_id", None)
            filtered.append(doc)
        return filtered
    except Exception as e:
        logger.warning(f"Failed to fetch calendar events from DB: {e}")
        return []


def _parse_event_datetime_and_title(message: str) -> tuple[str, datetime, datetime]:
    """Parse clean title, start datetime (UTC), and end datetime (UTC) from natural language query."""
    import re
    now = datetime.now(timezone.utc)
    # Estimate local machine date (e.g. IST = UTC+5:30)
    local_now = now + timedelta(hours=5, minutes=30)
    target_date = local_now.date()
    msg_lower = message.lower()

    # 1. Date Parsing (tomorrow, today, day after tomorrow)
    if "tomorrow" in msg_lower and "day after" not in msg_lower:
        target_date = (local_now + timedelta(days=1)).date()
    elif "day after tomorrow" in msg_lower:
        target_date = (local_now + timedelta(days=2)).date()

    # 2. Time Parsing (e.g., 4 pm, 4:00 pm, 10 am, 16:00)
    target_hour = (local_now.hour + 1) % 24
    target_minute = 0

    time_match = re.search(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b', msg_lower)
    if time_match:
        hr = int(time_match.group(1))
        mn = int(time_match.group(2)) if time_match.group(2) else 0
        ampm = time_match.group(3)
        if ampm == "pm" and hr < 12:
            hr += 12
        elif ampm == "am" and hr == 12:
            hr = 0
        target_hour = hr
        target_minute = mn
    else:
        time_24 = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', msg_lower)
        if time_24:
            target_hour = int(time_24.group(1))
            target_minute = int(time_24.group(2))

    # Construct local datetime & convert to UTC for Google Calendar ISO strings
    local_start = datetime(target_date.year, target_date.month, target_date.day, target_hour, target_minute)
    utc_start = local_start - timedelta(hours=5, minutes=30)
    utc_end = utc_start + timedelta(hours=1)

    # 3. Clean Title Extraction
    clean_title = message
    clean_title = re.sub(r'(?i)^(create|schedule|add)\s+(a\s+)?(calendar\s+)?(event|meeting)?\s*', '', clean_title).strip()
    clean_title = re.sub(r'(?i)\b(tomorrow|today|day after tomorrow)\b', '', clean_title)
    clean_title = re.sub(r'(?i)\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b', '', clean_title)
    clean_title = re.sub(r'(?i)\b\d{1,2}(?::\d{2})?\s*(am|pm)\b', '', clean_title)
    clean_title = re.sub(r'[\s:.,-]+$', '', clean_title).strip()
    clean_title = re.sub(r'^\s*[\s:.,-]+', '', clean_title).strip()

    if not clean_title or len(clean_title) < 2:
        clean_title = "Meeting / Event"

    return clean_title, utc_start, utc_end


class CalendarCapability(BaseCapability):
    @property
    def name(self) -> str:
        return "calendar"

    @property
    def description(self) -> str:
        return "Create, view, and manage calendar events and meetings."

    @property
    def supported_intents(self) -> List[str]:
        return ["calendar", "create_event", "update_event", "list_events", "check_availability", "schedule_meeting"]

    async def execute(self, intent: str, params: Dict[str, Any], trace_id: Optional[str] = None) -> CapabilityResult:
        try:
            user_id = params.get("user_id", "user_default")
            message = params.get("message", "").strip()
            msg_lower = message.lower()
            dates = params.get("dates", {})
            date_str = dates.get("resolved_date", "")
            time_str = dates.get("time", "")

            # Differentiate READ / CHECK queries from CREATE actions
            read_keywords = (
                "check", "what", "show", "view", "list", "get", "see",
                "do i have", "any event", "my schedule", "my calendar", "upcoming"
            )
            create_keywords = ("create", "add", "schedule", "book", "set")

            is_read_query = any(k in msg_lower for k in read_keywords) and not any(msg_lower.startswith(k) for k in create_keywords)

            if is_read_query or intent in ("list_events", "check_availability"):
                events = _get_user_events_from_db(user_id)
                if events:
                    event_list_str = ", ".join([f"'{e.get('title')}'" for e in events[:5]])
                    summary = f"You have {len(events)} event(s) on your calendar: {event_list_str}."
                else:
                    summary = "Your calendar is clear! You have no upcoming events scheduled."

                return CapabilityResult(
                    capability=self.name,
                    intent="list_events",
                    status="success",
                    summary=summary,
                    data={"events": events, "count": len(events)},
                    trace_id=trace_id,
                    actions=[{"label": "Add to calendar", "action": "Add to calendar"}],
                )

            # Smart Natural Language Datetime & Clean Title Parsing
            title, start_dt, end_dt = _parse_event_datetime_and_title(message)

# Save to MongoDB
            event_id = _save_event_to_db(user_id, title, start_dt.isoformat(), time_str, trace_id or "")

            # Fetch user's preferred calendar provider from DB or Cache
            from app.api.integrations import _CALENDAR_PREF_CACHE
            preferred_provider = _CALENDAR_PREF_CACHE.get(user_id, "google")
            try:
                from pymongo import MongoClient
                import os
                uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
                db_name = os.getenv("DATABASE_NAME", "ai_assistant")
                client = MongoClient(uri, serverSelectionTimeoutMS=2000)
                db = client[db_name]
                user_doc = db["user_integrations"].find_one({"user_id": user_id})
                if user_doc and "calendar" in user_doc and user_doc["calendar"].get("preferred_provider"):
                    preferred_provider = user_doc["calendar"]["preferred_provider"].lower().strip()
            except Exception as e:
                logger.warning(f"Could not fetch user calendar preference from DB: {e}")

            # Generate Native Device Calendar Sync URLs (Google, Outlook, Apple iCal, Zoho Calendar)

# Parse start and end time
            now = datetime.now(timezone.utc)
            if date_str and "T" in date_str:
                try:
                    start_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    start_dt = now + timedelta(hours=1)
            elif date_str:
                try:
                    start_dt = datetime.fromisoformat(date_str)
                except Exception:
                    start_dt = now + timedelta(hours=1)
            else:
                start_dt = now + timedelta(hours=1)

            end_dt = start_dt + timedelta(hours=1)
            user_tz = params.get("timezone", "UTC")
            attendees = params.get("attendees")

            # Execute via CalendarExecutor for Google/Microsoft synchronization
            from app.executors.calendar_executor import CalendarExecutor
            from app.core.gateway_auth import GatewayAuth

            gw_token = GatewayAuth.issue(
                trace_id=trace_id or f"tr_cal_{uuid4().hex[:8]}",
                platform="calendar",
                action="create_event",
                decision="allow"
            )

            cal_exec = CalendarExecutor()
            exec_res = cal_exec.create_event(
                title=title,
                start_time=start_dt.isoformat(),
                end_time=end_dt.isoformat(),
                description="Scheduled via MITRA Companion Engine",
                trace_id=trace_id or "",
                gateway_auth=gw_token,
                user_id=user_id,
                timezone=user_tz,
                attendees=attendees
            )

            sync_status = exec_res.get("sync_status", "Saved only in Mitra")
            provider = exec_res.get("provider")
            provider_event_id = exec_res.get("provider_event_id")
            synchronized = bool(exec_res.get("synchronized", False))

            # Save to MongoDB
            event_id = _save_event_to_db(
                user_id=user_id,
                title=title,
                date_str=start_dt.isoformat(),
                time_str=time_str,
                trace_id=trace_id or "",
                provider=provider,
                provider_event_id=provider_event_id,
                sync_status=sync_status
            )

            # Generate Native Device Calendar Sync URLs (Google, Outlook)
            import urllib.parse
            start_iso = start_dt.strftime("%Y%m%dT%H%M%SZ")
            end_iso = end_dt.strftime("%Y%m%dT%H%M%SZ")
            encoded_title = urllib.parse.quote(title)
            encoded_details = urllib.parse.quote("Scheduled via MITRA Universal Companion Engine")

            google_url = f"https://calendar.google.com/calendar/render?action=TEMPLATE&text={encoded_title}&dates={start_iso}/{end_iso}&details={encoded_details}"
            apple_url = f"webcal://localhost:8000/api/calendar/feed.ics?user_id={urllib.parse.quote(user_id)}"
            outlook_url = f"https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject={encoded_title}&startdt={start_dt.isoformat()}&enddt={end_dt.isoformat()}&body={encoded_details}"
            zoho_url = f"https://calendar.zoho.com/calendar/export/event?title={encoded_title}&start={start_iso}&end={end_iso}&description={encoded_details}"

            sync_urls = {
                "google": google_url,
                "apple": apple_url,
                "microsoft": outlook_url,
                "zoho": zoho_url,
            }

            actions = [
                {"label": f"🟢 Sync to {preferred_provider.capitalize()} Calendar (Primary)", "action": sync_urls.get(preferred_provider, google_url)},
                {"label": "🟢 Google Calendar", "action": google_url},
                {"label": "🍎 Apple Calendar (iCal)", "action": apple_url},
                {"label": "🟦 Microsoft Outlook", "action": outlook_url},
                {"label": "🟡 Zoho Calendar", "action": zoho_url},
            ]

            summary = (
                f"Calendar event created: '{title}'. Sync directly to your preferred calendar below:\n\n"
                f"🟢 Google Calendar: {google_url}\n"
                f"🟦 Microsoft Outlook: {outlook_url}\n"
                f"🍎 Apple Calendar (iCal): {apple_url}\n"
                f"🟡 Zoho Calendar: {zoho_url}"
            )

            if synchronized and provider == "google":
                summary = f"Calendar event created: '{title}' (Created in Google Calendar)."
            elif synchronized and provider == "microsoft":
                summary = f"Calendar event created: '{title}' (Created in Microsoft Calendar)."
            elif sync_status == "Sync failed":
                summary = f"Saved in Mitra, but sync to {provider.title() if provider else 'external'} Calendar failed. Connect Google Calendar or Microsoft Calendar to sync it to your calendar."
            else:
                summary = f"Saved in Mitra. Connect Google Calendar or Microsoft Calendar to sync it to your calendar."

            return CapabilityResult(
                capability=self.name, intent=intent, status="success",
                summary=summary,
                data={
                    "event_id": event_id,
                    "title": title,
                    "date": start_dt.isoformat(),
                    "time": time_str,
                    "persisted": event_id is not None,
"preferred_provider": preferred_provider,
                    "sync_urls": sync_urls,
                    "event": {
                        "id": event_id,
                        "title": title,
                        "start": start_dt.isoformat(),
                        "end": end_dt.isoformat()
                    },
                    "sync_status": sync_status,
                    "synchronized": synchronized,
                    "provider": provider,
                    "provider_event_id": provider_event_id,
                    "sync_urls": {
                        "google_calendar": google_url,
                        "outlook_calendar": outlook_url,
                    }
                },
                trace_id=trace_id,
                actions=actions,
            )
        except Exception as exc:
            logger.warning("CalendarCapability failed: %s", exc)
            return CapabilityResult.error_result(self.name, intent, str(exc), trace_id)
