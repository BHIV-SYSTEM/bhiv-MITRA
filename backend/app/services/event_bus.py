"""
event_bus.py — MITRA Event Bus

Simple in-process pub/sub event bus for real-time notifications
between backend services and the frontend via SSE.
"""

from __future__ import annotations
import logging
from typing import Callable, Dict, List, Any, Set
from threading import Lock

logger = logging.getLogger(__name__)

class EventBus:
    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}
        self._lock = Lock()

    def on(self, event: str, handler: Callable):
        with self._lock:
            self._handlers.setdefault(event, []).append(handler)

    def off(self, event: str, handler: Callable):
        with self._lock:
            if event in self._handlers:
                self._handlers[event] = [h for h in self._handlers[event] if h != handler]

    def emit(self, event: str, data: Any = None):
        with self._lock:
            handlers = self._handlers.get(event, []).copy()

        logger.debug(f"EventBus.emit: '{event}'")
        for handler in handlers:
            try:
                handler(data)
            except Exception as e:
                logger.warning(f"EventBus handler error for '{event}': {e}")

    def once(self, event: str, handler: Callable):
        def wrapper(data=None):
            self.off(event, wrapper)
            handler(data)
        self.on(event, wrapper)


event_bus = EventBus()
