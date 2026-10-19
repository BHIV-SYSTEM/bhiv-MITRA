export class NotificationBadge {
  constructor(eventBus) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-notification-badge';
    this.element.style.display = 'none';
    this.count = 0;

    if (eventBus) {
      eventBus.on('notification.received', () => this.increment());
      eventBus.on('capability.completed', () => this.increment());
      eventBus.on('capability.failed', () => this.increment());
      eventBus.on('runtime.failed', () => this.increment());
      eventBus.on('chat.opened', () => this.clear());
    }
  }

  increment() {
    this.count++;
    this.element.textContent = this.count > 9 ? '9+' : this.count;
    this.element.style.display = 'block';
  }

  clear() {
    this.count = 0;
    this.element.style.display = 'none';
  }
}
