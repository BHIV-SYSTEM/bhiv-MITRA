export class Header {
  constructor(onMinimize, onDock, onAvatarChange) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-header';

    this.element.innerHTML = `
      <div class="mitra-title">
        <div class="mitra-status-dot"></div>
        <div class="mitra-header-avatar" title="Click to change avatar" style="width: 28px; height: 28px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; border: 1.5px solid rgba(162, 155, 254, 0.6); box-shadow: 0 0 8px rgba(108, 92, 231, 0.5); cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;"></div>
        MITRA
      </div>
      <div class="mitra-controls">
        <button class="mitra-btn" id="btn-notif" title="Notifications" style="position:relative;">
          <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
          <span id="notif-badge-count" style="display:none; position:absolute; top:-2px; right:-2px; background:#ff3b30; color:#fff; border-radius:10px; padding:1px 5px; font-size:9px; font-weight:700; line-height:1;">0</span>
        </button>
        <button class="mitra-btn" id="btn-avatar" title="Change Avatar">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        </button>
        <button class="mitra-btn" id="btn-dock" title="Dock">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5v-5h-2v3h-3v2z"/></svg>
        </button>
        <button class="mitra-btn" id="btn-minimize" title="Minimize">
          <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
        </button>
      </div>
    `;

    const headerAvatar = this.element.querySelector('.mitra-header-avatar');
    if (headerAvatar) {
      headerAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onAvatarChange) onAvatarChange();
      });
      headerAvatar.addEventListener('mouseenter', () => {
        headerAvatar.style.transform = 'scale(1.12)';
        headerAvatar.style.borderColor = '#a29bfe';
        headerAvatar.style.boxShadow = '0 0 12px rgba(162, 155, 254, 0.9)';
      });
      headerAvatar.addEventListener('mouseleave', () => {
        headerAvatar.style.transform = 'scale(1)';
        headerAvatar.style.borderColor = 'rgba(162, 155, 254, 0.6)';
        headerAvatar.style.boxShadow = '0 0 8px rgba(108, 92, 231, 0.5)';
      });
    }

    this.element.querySelector('#btn-minimize').addEventListener('click', () => {
      if (onMinimize) onMinimize();
    });

    this.element.querySelector('#btn-dock').addEventListener('click', () => {
      if (onDock) onDock();
    });

    this.element.querySelector('#btn-avatar').addEventListener('click', () => {
      if (onAvatarChange) onAvatarChange();
    });

    this.element.querySelector('#btn-notif').addEventListener('click', () => {
      if (this.onNotificationClick) this.onNotificationClick();
    });
  }

  setUnreadBadgeCount(count) {
    const badge = this.element.querySelector('#notif-badge-count');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  updateAvatar(avatarUrl, renderAvatarElement) {
    const container = this.element.querySelector('.mitra-header-avatar');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'inline-flex';
    if (typeof renderAvatarElement === 'function') {
      const el = renderAvatarElement(avatarUrl || 'default');
      if (el) {
        el.style.width = '100%';
        el.style.height = '100%';
        container.appendChild(el);
      }
    }
  }

  setStatus(status, latency) {
    const dot = this.element.querySelector('.mitra-status-dot');
    if (!dot) return;
    const titleText = `Status: ${status}${latency ? ' (' + latency + ')' : ''}`;
    dot.setAttribute('title', titleText);

    const sLower = (status || '').toLowerCase();
    
    if (sLower === 'healthy' || sLower === 'success' || sLower === 'recovered') {
      dot.style.background = '#00e676';
      dot.style.boxShadow = '0 0 8px #00e676';
    } else if (sLower === 'executing' || sLower === 'busy') {
      dot.style.background = '#e056fd';
      dot.style.boxShadow = '0 0 8px #e056fd';
    } else if (sLower === 'connecting') {
      dot.style.background = '#ffb700';
      dot.style.boxShadow = '0 0 8px #ffb700';
    } else if (sLower === 'offline' || sLower === 'disconnected') {
      dot.style.background = '#ff9500';
      dot.style.boxShadow = '0 0 8px #ff9500';
    } else if (sLower === 'error' || sLower === 'failed' || sLower === 'service unavailable') {
      dot.style.background = '#ff3b30';
      dot.style.boxShadow = '0 0 8px #ff3b30';
    } else {
      dot.style.background = '#a1a1aa';
      dot.style.boxShadow = 'none';
    }
  }
}
