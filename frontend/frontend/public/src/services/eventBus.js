export class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data = {}) {
    this.logStructuredEvent(event, data);
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  logStructuredEvent(event, data) {
    const time = new Date().toLocaleTimeString();
    switch (event) {
      case 'runtime.connected':
        console.log(`%c[MITRA] Runtime Connected (${time})`, 'color: #00e676; font-weight: bold;');
        break;
      case 'runtime.disconnected':
        console.log(`%c[MITRA] Runtime Disconnected (${time})`, 'color: #ff1744; font-weight: bold;');
        break;
      case 'runtime.failed':
        console.log(`%c[MITRA] Runtime Failed (${time})`, 'color: #ff1744; font-weight: bold;', data);
        break;
      case 'runtime.recovered':
        console.log(`%c[MITRA] Runtime Recovered (${time})`, 'color: #00e676; font-weight: bold;');
        break;
      case 'capability.started':
        console.log(`%c[MITRA] Capability Started : ${data.capability} (${time})`, 'color: #ffea00; font-weight: bold;');
        break;
      case 'capability.completed':
      case 'capability.finished':
        console.log(`%c[MITRA] Capability Completed : ${data.capability} (${time})`, 'color: #00e676; font-weight: bold;', data);
        break;
      case 'capability.failed':
        console.log(`%c[MITRA] Capability Failed : ${data.capability} (${time})`, 'color: #ff1744; font-weight: bold;', data);
        break;
      case 'notification.received':
        console.log(`%c[MITRA] Notification Received (${time})`, 'color: #6b4cff; font-weight: bold;', data);
        break;
      case 'context.saved':
      case 'context.updated':
        console.log(`%c[MITRA] Context Saved (${time})`, 'color: #1890ff; font-weight: bold;');
        break;
      case 'replay.generated':
        console.log(`%c[MITRA] Replay Generated (${time})`, 'color: #fa8c16; font-weight: bold;', data);
        break;
      case 'health.changed':
        console.log(`%c[MITRA] Health Changed : ${data.status} (${time})`, 'color: #13c2c2; font-weight: bold;', data);
        break;
      case 'capability.requested':
        console.log(`%c[MITRA] Capability Requested : ${data.capability} (${time})`, 'color: #1890ff; font-weight: bold;', data);
        break;
      case 'capability.queued':
        console.log(`%c[MITRA] Capability Queued : ${data.capability} (${time})`, 'color: #fa541c; font-weight: bold;', data);
        break;
      case 'capability.retrying':
        console.log(`%c[MITRA] Capability Retrying : ${data.capability} (${time})`, 'color: #faad14; font-weight: bold;', data);
        break;
      case 'capability.cancelled':
        console.log(`%c[MITRA] Capability Cancelled : ${data.capability} (${time})`, 'color: #d9363e; font-weight: bold;', data);
        break;
      case 'capability.timed_out':
        console.log(`%c[MITRA] Capability Timed Out : ${data.capability} (${time})`, 'color: #d9363e; font-weight: bold;', data);
        break;
      default:
        console.log(`[MITRA] Event: ${event}`, data);
    }
  }
}

export const eventBus = new EventBus();
