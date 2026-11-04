import { NotificationBadge } from './NotificationBadge.js';
import { eventBus } from '../services/eventBus.js';
import { renderAvatarElement, getActiveMitraAvatar } from '../services/avatarHelper.js';
import { contextStore } from '../services/contextStore.js';

export class MITRAButton {
  constructor(onClickCallback) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-fab';
    this.element.title = 'Open MITRA Companion (Right-click to change avatar)';
    
    // SVG icon for the button
    this.element.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
    `;

    this.badge = new NotificationBadge(eventBus);
    this.element.appendChild(this.badge.element);

    let startX = null;
    let startY = null;
    let isPointerDown = false;
    let hasDragged = false;

    this.element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      isPointerDown = true;
      hasDragged = false;

      const onPointerMove = (moveEvent) => {
        if (startX !== null && startY !== null) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 16) {
            hasDragged = true;
          }
        }
      };

      const onPointerUp = (upEvt) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (isPointerDown) {
          isPointerDown = false;
          if (startX !== null && startY !== null) {
            const dist = Math.hypot(upEvt.clientX - startX, upEvt.clientY - startY);
            if (dist > 16) {
              hasDragged = true;
            }
          }
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    let lastClickTime = 0;
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dist = (startX !== null && startY !== null) ? Math.hypot(e.clientX - startX, e.clientY - startY) : 0;
      const now = Date.now();
      if (!hasDragged && dist < 18 && now - lastClickTime > 200) {
        lastClickTime = now;
        eventBus.emit('chat.opened', {});
        if (onClickCallback) onClickCallback();
      }
      hasDragged = false;
      startX = null;
      startY = null;
    });

    // Right-click to change companion avatar
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      eventBus.emit('avatar.request_change');
    });

    // Listen for avatar updates
    eventBus.on('avatar.changed', (data) => {
      const activeAvatar = (data && data.avatar) ? data.avatar : getActiveMitraAvatar(contextStore);
      this.updateAvatar(activeAvatar);
    });

    // Initial avatar rendering (fallback to canonical Mitra avatar)
    const initialAvatar = getActiveMitraAvatar(contextStore);
    this.updateAvatar(initialAvatar);
  }

  updateAvatar(avatarUrl) {
    const existing = this.element.querySelector('.mitra-avatar-media');
    if (existing) {
      existing.remove();
    }

    const svg = this.element.querySelector('svg');
    if (svg) svg.style.display = 'none';

    const avatarEl = renderAvatarElement(avatarUrl || 'default');
    if (avatarEl) {
      this.element.appendChild(avatarEl);
    }
  }

  setThinking(isThinking) {
    if (isThinking) {
      this.element.classList.add('thinking');
    } else {
      this.element.classList.remove('thinking');
    }
  }

  setHiddenPermanently(hidden) {
    this.hiddenPermanently = Boolean(hidden);
    if (this.hiddenPermanently) {
      this.hide();
    }
  }

  hide() {
    this.element.style.setProperty('display', 'none', 'important');
    this.element.style.setProperty('visibility', 'hidden', 'important');
    this.element.style.setProperty('opacity', '0', 'important');
    this.element.style.setProperty('pointer-events', 'none', 'important');
  }

  show() {
    if (this.hiddenPermanently) return;
    this.element.style.setProperty('display', 'flex', 'important');
    this.element.style.setProperty('visibility', 'visible', 'important');
    this.element.style.setProperty('opacity', '1', 'important');
    this.element.style.setProperty('pointer-events', 'auto', 'important');
    this.element.style.setProperty('z-index', '9999999', 'important');
  }
}
