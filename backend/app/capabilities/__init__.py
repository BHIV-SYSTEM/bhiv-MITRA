"""
capabilities/__init__.py

Registers all 10 Mitra capability adapters into the CapabilityRegistry.
Import is deferred inside register_all_capabilities() to avoid circular imports.
"""
from __future__ import annotations


def register_all_capabilities() -> None:
    """
    Register all capabilities into the global registry.
    Called once at app startup (main.py lifespan).
    Imports are local to break the circular dependency chain.
    """
    # Import registry here — not at module level — to avoid circular imports
    from app.companion.capability_registry import capability_registry

    from app.capabilities.email_capability import EmailCapability
    from app.capabilities.calendar_capability import CalendarCapability
    from app.capabilities.whatsapp_capability import WhatsAppCapability
    from app.capabilities.reminder_capability import ReminderCapability
    from app.capabilities.task_capability import TaskCapability
    from app.capabilities.notes_capability import NotesCapability
    from app.capabilities.contacts_capability import ContactsCapability
    from app.capabilities.notification_capability import NotificationCapability
    from app.capabilities.browser_capability import BrowserCapability
    from app.capabilities.document_capability import DocumentCapability
    from app.capabilities.uniguru_capability import UniGuruCapability
    from app.capabilities.setu_capability import SetuCapability
    from app.capabilities.samruddhi_capability import SamruddhiCapability
    from app.capabilities.samachar_capability import SamacharCapability
    from app.capabilities.setu_capability import SetuCapability

    for cap_cls in [
        EmailCapability,
        CalendarCapability,
        WhatsAppCapability,
        ReminderCapability,
        TaskCapability,
        NotesCapability,
        ContactsCapability,
        NotificationCapability,
        BrowserCapability,
        DocumentCapability,
        UniGuruCapability,
        SetuCapability,
        SamruddhiCapability,
        SamacharCapability,
        SetuCapability,
    ]:
        capability_registry.register(cap_cls())



__all__ = ["register_all_capabilities"]
