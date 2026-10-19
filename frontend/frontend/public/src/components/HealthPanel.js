import { contextStore } from '../services/contextStore.js';

export class HealthPanel {
  constructor(eventBus) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-health-panel';
    this.element.style.display = 'none';

    this.element.innerHTML = `
      <div class="health-header">Runtime Health & Data Controls</div>
      <div class="health-stats">
        <div class="stat-row">
          <span>Status</span>
          <span id="health-status" class="status-indicator yellow">Connecting</span>
        </div>
        <div class="stat-row">
          <span>Latency</span>
          <span id="health-latency">-- ms</span>
        </div>
        <div class="stat-row">
          <span>Version</span>
          <span>v5.0.0</span>
        </div>
        <div class="stat-row">
          <span>Last Sync</span>
          <span id="health-sync">Never</span>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button id="btn-clear-history" style="flex:1; background:rgba(255,59,48,0.15); border:1px solid rgba(255,59,48,0.4); color:#ff453a; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:0.2s;">
          🗑️ Clear Chat History
        </button>
        <button id="btn-reset-companion" style="flex:1; background:rgba(255,149,0,0.15); border:1px solid rgba(255,149,0,0.4); color:#ff9f0a; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:0.2s;">
          🔄 Reset Companion
        </button>
      </div>
    `;

    this.statusEl = this.element.querySelector('#health-status');
    this.latencyEl = this.element.querySelector('#health-latency');
    this.syncEl = this.element.querySelector('#health-sync');

    const btnClear = this.element.querySelector('#btn-clear-history');
    const btnReset = this.element.querySelector('#btn-reset-companion');

    btnClear.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your local chat history?')) {
        contextStore.clearHistory();
      }
    });

    btnReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all companion data (history, avatar, position)?')) {
        contextStore.resetAll();
      }
    });

    if (eventBus) {
      eventBus.on('health.changed', (data) => {
        this.updateHealth(data);
      });
    }
  }

  updateHealth(data) {
    if (data.status) {
      const statusMap = {
        'Healthy': 'green',
        'Connected': 'green',
        'Completed': 'green',
        'Busy': 'yellow',
        'Connecting': 'yellow',
        'Thinking': 'yellow',
        'Executing': 'yellow',
        'Waiting': 'yellow',
        'Retrying': 'yellow',
        'Error': 'red',
        'Failed': 'red',
        'Disconnected': 'red'
      };
      const colorClass = statusMap[data.status] || 'yellow';
      this.statusEl.className = `status-indicator ${colorClass}`;
      this.statusEl.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
    }
    if (data.latency) this.latencyEl.textContent = data.latency;
    
    const now = new Date();
    this.syncEl.textContent = now.toLocaleTimeString();
  }

  toggle() {
    if (this.element.style.display === 'none') {
      this.element.style.display = 'block';
    } else {
      this.element.style.display = 'none';
    }
  }
}
