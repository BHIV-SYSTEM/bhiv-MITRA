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

    let startX = 0;
    let startY = 0;
    let hasDragged = false;

    this.element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      hasDragged = false;

      const onPointerMove = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5) {
          hasDragged = true;
        }
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    this.element.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      eventBus.emit('chat.opened', {});
      if (onClickCallback) onClickCallback();
    });

    // Right-click to change companion avatar
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      eventBus.emit('avatar.request_change');
    });

    // Listen for avatar updates
    eventBus.on('avatar.changed', (data) => {
      this.updateAvatar(getActiveMitraAvatar(contextStore));
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

  hide() {
    this.element.style.display = 'none';
  }

  show() {
    this.element.style.display = 'flex';
  }
}
