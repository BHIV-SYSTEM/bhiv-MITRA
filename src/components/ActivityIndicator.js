export class ActivityIndicator {
  constructor(eventBus) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-activity-indicator';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.innerHTML = `
      <div class="indicator-left">
        <div class="indicator-dot idle"></div>
        <span class="indicator-badge idle">TANTRA</span>
        <span class="indicator-text">Idle — Runtime Ready</span>
      </div>
      <div class="indicator-right">
        <span class="indicator-eco">BHIV Ecosystem</span>
      </div>
    `;
    this.textEl = this.element.querySelector('.indicator-text');
    this.dotEl = this.element.querySelector('.indicator-dot');
    this.badgeEl = this.element.querySelector('.indicator-badge');
    this.resetTimer = null;

    if (eventBus) {
      eventBus.on('capability.started', (data) => {
        const cap = data?.capability ? `${data.capability.toUpperCase()}` : 'CAPABILITY';
        this.setStatus(`Executing ${cap}...`, 'running', 'TANTRA');
      });

      eventBus.on('capability.finished', (data) => {
        this.setStatus('Completed — Runtime Success', 'completed', 'DONE');
      });

      eventBus.on('capability.completed', (data) => {
        this.setStatus('Completed — Runtime Success', 'completed', 'DONE');
      });

      eventBus.on('capability.failed', (data) => {
        this.setStatus('Failed — Runtime Error', 'failed', 'ERROR');
      });

      eventBus.on('capability.timed_out', (data) => {
        this.setStatus('Failed — Execution Timed Out', 'failed', 'TIMEOUT');
      });

      eventBus.on('capability.retrying', (data) => {
        this.setStatus('Retrying Capability via TANTRA...', 'retrying', 'RETRY');
      });

      eventBus.on('capability.queued', (data) => {
        this.setStatus('Waiting — Capability Queued', 'waiting', 'QUEUE');
      });

      eventBus.on('runtime.thinking', (data) => {
        const detail = data?.stage || 'Evaluating Query...';
        this.setStatus(`Thinking — ${detail}`, 'thinking', 'UNIGURU');
      });

      eventBus.on('runtime.executing', (data) => {
        const engine = data?.engine || 'TANTRA';
        this.setStatus(`Executing via ${engine}...`, 'running', engine);
      });

      eventBus.on('runtime.idle', () => {
        this.setStatus('Idle — Runtime Ready', 'idle', 'TANTRA');
      });

      eventBus.on('health.changed', (data) => {
        if (data.status === 'Executing') this.setStatus('Executing via TANTRA...', 'running', 'TANTRA');
        if (data.status === 'Waiting') this.setStatus('Waiting in Queue...', 'waiting', 'QUEUE');
        if (data.status === 'Thinking') this.setStatus('Thinking — UniGuru Processing...', 'thinking', 'UNIGURU');
      });
    }
  }

  setStatus(text, stateClass = 'idle', badgeText = 'RUNTIME') {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    if (this.textEl) this.textEl.textContent = text;
    if (this.dotEl) this.dotEl.className = `indicator-dot ${stateClass}`;
    if (this.badgeEl) {
      this.badgeEl.textContent = badgeText;
      this.badgeEl.className = `indicator-badge ${stateClass}`;
    }
    
    if (stateClass === 'completed' || stateClass === 'failed') {
      this.resetTimer = setTimeout(() => {
        this.setStatus('Idle — Runtime Ready', 'idle', 'TANTRA');
      }, 3500);
    }
  }
}
