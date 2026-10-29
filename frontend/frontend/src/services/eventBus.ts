// eventBus.ts — MITRA Event Bus
// Pub/sub event system for cross-component communication (notifications, etc.)

export interface EventHandler {
  (data?: any): void;
}

class EventBus {
  private handlers: Record<string, Set<EventHandler>> = {};

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers[event]) {
      this.handlers[event] = new Set();
    }
    this.handlers[event].add(handler);
    return () => {
      this.off(event, handler);
    };
  }

  off(event: string, handler: EventHandler) {
    if (this.handlers[event]) {
      this.handlers[event].delete(handler);
    }
  }

  emit(event: string, data?: any) {
    const handlers = this.handlers[event];
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.warn('[MITRA EventBus] handler error:', e);
        }
      });
    }
  }

  once(event: string, handler: EventHandler) {
    const wrapper = (data?: any) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  getEvents(): Record<string, Set<EventHandler>> {
    return this.handlers;
  }
}

export const eventBus = new EventBus();
