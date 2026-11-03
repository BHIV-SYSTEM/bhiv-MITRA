export class Header {
  constructor(onMinimize, onDock, onAvatarChange) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-header';

    this.onNotificationClick = null;
    this.onWhatsAppClick = null;
    this.onSettingsClick = null;

    this.element.innerHTML = `
      <div class="mitra-title">
        <div class="mitra-status-dot" title="Status: Healthy"></div>
        <div class="mitra-header-avatar" title="Click to change avatar" style="width: 28px; height: 28px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; border: 1.5px solid rgba(162, 155, 254, 0.6); box-shadow: 0 0 8px rgba(108, 92, 231, 0.5); cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;"></div>
        <div style="display:flex; flex-direction:column; line-height:1.1;">
          <span style="font-weight:700; font-size:13px; color:#fff;">MITRA</span>
          <span id="mitra-runtime-subtitle" style="font-size:9.5px; color:#00e676; font-weight:500;">Ready</span>
        </div>
      </div>
      <div class="mitra-controls" style="display:flex; align-items:center; gap:4px;">
        <!-- Notification Drawer -->
        <button class="mitra-btn" id="btn-notif" title="Notifications" style="position:relative;">
          <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
          <span id="notif-badge-count" style="display:none; position:absolute; top:-2px; right:-2px; background:#ff3b30; color:#fff; border-radius:10px; padding:1px 5px; font-size:9px; font-weight:700; line-height:1;">0</span>
        </button>

        <!-- Companion Settings Modal Launcher -->
        <button class="mitra-btn" id="btn-settings" title="Companion Settings">
          <svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
        </button>

        <!-- Avatar Change Button -->
        <button class="mitra-btn" id="btn-avatar" title="Change Avatar">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        </button>

        <!-- Runtime Health & Execution Controls Toggle -->
        <button class="mitra-btn" id="btn-dock" title="Runtime Health & Thinking Controls">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5v-5h-2v3h-3v2z"/></svg>
        </button>

        <!-- Minimize Button -->
        <button class="mitra-btn" id="btn-minimize" title="Minimize Chatbot">
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

    const handleMinimize = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof window !== 'undefined' && typeof window.__MITRA_MINIMIZE__ === 'function') {
        window.__MITRA_MINIMIZE__();
      } else if (onMinimize) {
        onMinimize();
      }
    };

    const minBtn = this.element.querySelector('#btn-minimize');
    if (minBtn) {
      minBtn.addEventListener('click', handleMinimize);
      minBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      minBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const dockBtn = this.element.querySelector('#btn-dock');
    if (dockBtn) {
      dockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDock) onDock();
      });
      dockBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      dockBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const avatarBtn = this.element.querySelector('#btn-avatar');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onAvatarChange) onAvatarChange();
      });
      avatarBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      avatarBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const notifBtn = this.element.querySelector('#btn-notif');
    if (notifBtn) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onNotificationClick) this.onNotificationClick();
      });
      notifBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      notifBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }


    const settingsBtn = this.element.querySelector('#btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onSettingsClick) this.onSettingsClick();
      });
      settingsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      settingsBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }
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

  setWhatsAppConnected(connected) {
    const dot = this.element.querySelector('#wa-header-dot');
    if (dot) dot.style.display = connected ? 'block' : 'none';
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
    const subTitle = this.element.querySelector('#mitra-runtime-subtitle');
    if (!dot) return;
    const titleText = `Status: ${status}${latency ? ' (' + latency + ')' : ''}`;
    dot.setAttribute('title', titleText);

    const sLower = (status || '').toLowerCase();

    if (sLower === 'thinking' || sLower === 'busy' || sLower === 'executing' || sLower === 'processing') {
      dot.style.background = '#e056fd';
      dot.style.boxShadow = '0 0 10px #e056fd';
      if (subTitle) {
        subTitle.textContent = sLower.includes('think') ? '🧠 Thinking...' : '⚡ Processing...';
        subTitle.style.color = '#e056fd';
      }
    } else if (sLower === 'healthy' || sLower === 'success' || sLower === 'recovered') {
      dot.style.background = '#00e676';
      dot.style.boxShadow = '0 0 8px #00e676';
      if (subTitle) {
        subTitle.textContent = 'Ready';
        subTitle.style.color = '#00e676';
      }
    } else if (sLower === 'connecting') {
      dot.style.background = '#ffb700';
      dot.style.boxShadow = '0 0 8px #ffb700';
      if (subTitle) {
        subTitle.textContent = 'Connecting...';
        subTitle.style.color = '#ffb700';
      }
    } else if (sLower === 'offline' || sLower === 'disconnected') {
      dot.style.background = '#ff9500';
      dot.style.boxShadow = '0 0 8px #ff9500';
      if (subTitle) {
        subTitle.textContent = 'Offline';
        subTitle.style.color = '#ff9500';
      }
    } else if (sLower === 'error' || sLower === 'failed' || sLower === 'service unavailable') {
      dot.style.background = '#ff3b30';
      dot.style.boxShadow = '0 0 8px #ff3b30';
      if (subTitle) {
        subTitle.textContent = 'Error';
        subTitle.style.color = '#ff3b30';
      }
    } else {
      dot.style.background = '#a1a1aa';
      dot.style.boxShadow = 'none';
      if (subTitle) {
        subTitle.textContent = 'Ready';
        subTitle.style.color = '#a1a1aa';
      }
    }
  }
}
