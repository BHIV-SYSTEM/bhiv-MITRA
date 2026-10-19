/**
 * BHIV Universal Design System - Executive Dashboard Capability Cards
 * Reusable across Gurukul, UniGuru, SETU, NIYANTRAN, ARTHA, TANTRA, Governance Systems & Observability
 */

export class KPICard {
  static create({ title, value, change, trend = 'up', subtitle = '' }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-kpi-card';
    const isUp = trend === 'up';
    card.innerHTML = `
      <div class="kpi-title">${title}</div>
      <div class="kpi-value-row">
        <span class="kpi-value">${value}</span>
        <span class="kpi-badge ${isUp ? 'positive' : 'negative'}">
          ${isUp ? '↑' : '↓'} ${change}
        </span>
      </div>
      ${subtitle ? `<div class="kpi-subtitle">${subtitle}</div>` : ''}
    `;
    return card;
  }
}

export class RuntimeCard {
  static create({ status = 'Healthy', latency = '12ms', traceId = 'tr-88349', version = 'v2.4.0' }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-runtime-card';
    card.innerHTML = `
      <div class="ds-card-header">
        <span class="ds-card-title">TANTRA Runtime</span>
        <span class="status-indicator green">${status}</span>
      </div>
      <div class="runtime-meta-grid">
        <div class="meta-item"><span class="meta-label">Latency</span><span class="meta-val">${latency}</span></div>
        <div class="meta-item"><span class="meta-label">Trace ID</span><span class="meta-val code">${traceId}</span></div>
        <div class="meta-item"><span class="meta-label">Version</span><span class="meta-val">${version}</span></div>
      </div>
    `;
    return card;
  }
}

export class HealthCard {
  static create({ services = [] }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-health-card';
    const defaultServices = services.length ? services : [
      { name: 'Control Plane', status: 'Healthy', latency: '4ms' },
      { name: 'TANTRA Engine', status: 'Healthy', latency: '12ms' },
      { name: 'Universal Capability', status: 'Healthy', latency: '18ms' }
    ];
    
    card.innerHTML = `
      <div class="ds-card-header">
        <span class="ds-card-title">Ecosystem Health</span>
      </div>
      <div class="health-list">
        ${defaultServices.map(s => `
          <div class="health-item">
            <span class="health-name">${s.name}</span>
            <span class="health-status green">${s.status} (${s.latency})</span>
          </div>
        `).join('')}
      </div>
    `;
    return card;
  }
}

export class ReplayCard {
  static create({ replayId = 'rep-9902', step = '3/5', action = 'Constitutional Check Passed' }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-replay-card';
    card.innerHTML = `
      <div class="ds-card-header">
        <span class="ds-card-title">Replay Auditor</span>
        <span class="code-badge">${replayId}</span>
      </div>
      <div class="replay-body">
        <div class="replay-step">Step ${step}</div>
        <div class="replay-action">${action}</div>
      </div>
    `;
    return card;
  }
}

export class TimelineCard {
  static create({ events = [] }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-timeline-card';
    const items = events.length ? events : [
      { time: '14:32:01', label: 'Session Initialized' },
      { time: '14:32:05', label: 'Capability Routing Check' },
      { time: '14:32:10', label: 'Policy Enforced' }
    ];
    card.innerHTML = `
      <div class="ds-card-header"><span class="ds-card-title">Execution Timeline</span></div>
      <div class="timeline-list">
        ${items.map(i => `
          <div class="timeline-item">
            <span class="timeline-time">${i.time}</span>
            <span class="timeline-label">${i.label}</span>
          </div>
        `).join('')}
      </div>
    `;
    return card;
  }
}

export class AlertCard {
  static create({ level = 'info', title = 'System Alert', message = 'Policy evaluation optimal.' }) {
    const card = document.createElement('div');
    card.className = `mitra-ds-card mitra-alert-card alert-${level}`;
    card.innerHTML = `
      <div class="alert-title">${title}</div>
      <div class="alert-msg">${message}</div>
    `;
    return card;
  }
}

export class TelemetryCard {
  static create({ cpu = '12%', memory = '256MB', activeThreads = '14' }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-telemetry-card';
    card.innerHTML = `
      <div class="ds-card-header"><span class="ds-card-title">Runtime Telemetry</span></div>
      <div class="telemetry-grid">
        <div><span>CPU</span> <strong>${cpu}</strong></div>
        <div><span>Memory</span> <strong>${memory}</strong></div>
        <div><span>Threads</span> <strong>${activeThreads}</strong></div>
      </div>
    `;
    return card;
  }
}

export class ActivityFeed {
  static create({ activities = [] }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-activity-feed';
    const list = activities.length ? activities : [
      { user: 'Ashwini', action: 'Uploaded companion asset', time: '2m ago' },
      { user: 'System', action: 'Health sync check passed', time: '1m ago' }
    ];
    card.innerHTML = `
      <div class="ds-card-header"><span class="ds-card-title">Activity Feed</span></div>
      <div class="activity-list">
        ${list.map(a => `
          <div class="activity-item">
            <strong>${a.user}</strong> ${a.action} <span class="time">${a.time}</span>
          </div>
        `).join('')}
      </div>
    `;
    return card;
  }
}

export class CapabilityCard {
  static create({ name, description, icon }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-capability-card';
    card.innerHTML = `
      <div class="capability-header">
        <div class="capability-icon">${icon || '⚡'}</div>
        <div class="capability-title">${name}</div>
      </div>
      <div class="capability-desc">${description}</div>
    `;
    return card;
  }
}

export class ExecutiveMetricCard {
  static create({ metricName = 'Governance Index', score = '99.4%', status = 'OPTIMAL' }) {
    const card = document.createElement('div');
    card.className = 'mitra-ds-card mitra-exec-metric-card';
    card.innerHTML = `
      <div class="exec-title">${metricName}</div>
      <div class="exec-score">${score}</div>
      <div class="exec-status">${status}</div>
    `;
    return card;
  }
}
