export class NotificationCenter {
  constructor(eventBus) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-notification-center';

    if (eventBus) {
      eventBus.on('notification.received', (data) => {
        this.showNotification(data.text || data.message || 'New notification', 'info');
      });
      eventBus.on('capability.finished', (data) => {
        this.showNotification(`Capability ${data.capability} completed`, 'success');
      });
      eventBus.on('capability.completed', (data) => {
        this.showNotification(`Capability ${data.capability} completed`, 'success');
      });
      eventBus.on('runtime.failed', (data) => {
        this.showNotification(`Runtime Error: ${data.reason}`, 'error');
      });
      eventBus.on('runtime.recovered', () => {
        this.showNotification('Runtime Recovered Successfully', 'success');
      });
    }
  }

  showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `mitra-toast ${type}`;
    toast.textContent = message;
    this.element.appendChild(toast);

    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}
