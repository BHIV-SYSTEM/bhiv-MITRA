import { contextStore } from '../services/contextStore.js';

export class HealthPanel {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.element = document.createElement('div');
    this.element.className = 'mitra-health-panel';
    this.element.style.display = 'none';

    const now = new Date().toLocaleTimeString();

    this.element.innerHTML = `
      <div class="health-header" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Runtime Health &amp; Execution Controls</span>
        <button id="btn-close-health" style="background:none; border:none; color:rgba(255,255,255,0.6); cursor:pointer; font-size:14px; padding:0 4px;">✕</button>
      </div>
      <div class="health-stats">
        <div class="stat-row">
          <span>Status</span>
          <span id="health-status" class="status-indicator green">Healthy</span>
        </div>
        <div class="stat-row">
          <span>Latency</span>
          <span id="health-latency">12ms</span>
        </div>
        <div class="stat-row">
          <span>Runtime</span>
          <span style="color:#a29bfe; font-weight:600;">TANTRA Active</span>
        </div>
        <div class="stat-row">
          <span>Intelligence</span>
          <span style="color:#00d2ff; font-weight:600;">UniGuru Connected</span>
        </div>
        <div class="stat-row">
          <span>Control Plane</span>
          <span style="color:#00e676; font-weight:600;">BHIV Control Plane</span>
        </div>
        <div class="stat-row">
          <span>Last Sync</span>
          <span id="health-sync">${now}</span>
        </div>
      </div>
      <div style="margin-top:10px; display:flex; gap:6px;">
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

    const btnClose = this.element.querySelector('#btn-close-health');
    const btnClear = this.element.querySelector('#btn-clear-history');
    const btnReset = this.element.querySelector('#btn-reset-companion');

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.element.style.display = 'none';
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your local chat history?')) {
          contextStore.clearHistory();
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all companion data (history, avatar, position)?')) {
          contextStore.resetAll();
        }
      });
    }

    if (this.eventBus) {
      this.eventBus.on('health.changed', (data) => {
        this.updateHealth(data);
      });

      this.eventBus.on('runtime.thinking', (data) => {
        this.updateHealth({ status: 'Thinking', latency: 'active' });
      });

      this.eventBus.on('runtime.executing', (data) => {
        this.updateHealth({ status: 'Executing', latency: 'active' });
      });

      this.eventBus.on('capability.started', (data) => {
        this.updateHealth({ status: 'Capability Running', latency: 'active' });
      });

      this.eventBus.on('runtime.idle', () => {
        this.updateHealth({ status: 'Healthy', latency: '12ms' });
      });
    }
  }

  updateHealth(data) {
    if (data.status) {
      const statusMap = {
        'Healthy': 'green',
        'Connected': 'green',
        'Completed': 'green',
        'Ready': 'green',
        'Busy': 'yellow',
        'Connecting': 'yellow',
        'Thinking': 'yellow',
        'Executing': 'green',
        'Capability Running': 'green',
        'Waiting': 'yellow',
        'Retrying': 'yellow',
        'Error': 'red',
        'Failed': 'red',
        'Disconnected': 'red'
      };
      const colorClass = statusMap[data.status] || 'green';
      if (this.statusEl) {
        this.statusEl.className = `status-indicator ${colorClass}`;
        this.statusEl.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      }
    }
    if (data.latency && this.latencyEl) {
      this.latencyEl.textContent = data.latency;
    }
    
    if (this.syncEl) {
      const now = new Date();
      this.syncEl.textContent = now.toLocaleTimeString();
    }
  }

  toggle() {
    if (this.element.style.display === 'none') {
      this.element.style.display = 'block';
    } else {
      this.element.style.display = 'none';
    }
  }
}
