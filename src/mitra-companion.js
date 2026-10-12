import { runtimeService } from './services/RuntimeService.js';
import { eventBus } from './services/eventBus.js';
import { MITRAButton } from './components/MITRAButton.js';
import { MITRAWindow } from './components/MITRAWindow.js';
import { NotificationCenter } from './components/NotificationCenter.js';
import { DockController } from './components/DockController.js';
import { contextStore } from './services/contextStore.js';
import { AvatarModal } from './components/AvatarModal.js';
import { initActiveMitraAvatar } from './services/avatarHelper.js';

class MitraCompanion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    try {
      window.__mitra_event_bus = eventBus;
      await initActiveMitraAvatar(contextStore);
      this.render();
      await runtimeService.connectAll();
    } catch (err) {
      console.warn('[MITRA Error Boundary] Caught companion lifecycle error:', err);
    }
  }

  render() {
    // Resolve stylesheet path: prefer the `stylesheet-path` attribute, fallback to URL depth detection
    const attrPath = this.getAttribute('stylesheet-path');
    const autoPrefx = window.location.pathname.includes('/pages/') ? '../' : './';
    const cssHref = attrPath || `${autoPrefx}styles/mitra-companion.css`;
    const cacheBuster = `t=${Date.now()}`;
    const hrefWithCache = cssHref.includes('?') ? `${cssHref}&${cacheBuster}` : `${cssHref}?${cacheBuster}`;
    const styleLink = document.createElement('link');
    styleLink.setAttribute('rel', 'stylesheet');
    styleLink.setAttribute('href', hrefWithCache);
    this.shadowRoot.appendChild(styleLink);

    // Shell container
    const shell = document.createElement('div');
    shell.id = 'mitra-shell';
    shell.classList.add('floating');
    this.shadowRoot.appendChild(shell);

    const setFloatingDefaultPosition = () => {
      shell.style.removeProperty('inset');
      shell.style.bottom = '24px';
      shell.style.right = '24px';
      shell.style.top = 'auto';
      shell.style.left = 'auto';
      shell.style.position = 'fixed';
    };

    // Load last position if floating
    const lastPos = contextStore.getPosition();
    if (contextStore.getDockMode() === 'floating') {
      if (lastPos && lastPos.left != null && lastPos.top != null) {
        const parsedLeft = parseFloat(lastPos.left);
        const parsedTop = parseFloat(lastPos.top);
        if (!isNaN(parsedLeft) && !isNaN(parsedTop) && parsedTop > 60 && parsedLeft < (window.innerWidth - 60)) {
          const safeLeft = Math.min(Math.max(20, parsedLeft), Math.max(20, window.innerWidth - 80));
          const safeTop = Math.min(Math.max(60, parsedTop), Math.max(60, window.innerHeight - 80));
          shell.style.removeProperty('inset');
          shell.style.left = `${safeLeft}px`;
          shell.style.top = `${safeTop}px`;
          shell.style.bottom = 'auto';
          shell.style.right = 'auto';
        } else {
          setFloatingDefaultPosition();
        }
      } else {
        setFloatingDefaultPosition();
      }
    }

    // Global Notifications
    const notificationCenter = new NotificationCenter(eventBus);
    shell.appendChild(notificationCenter.element);

    // Dock Controller
    const dockController = new DockController(shell);

    // Main Window
    const mitraWindow = new MITRAWindow(runtimeService, eventBus, dockController);

    // FAB
    const mitraButton = new MITRAButton(() => {
      mitraButton.hide();
      mitraWindow.expand();
      if (contextStore.setWindowState) contextStore.setWindowState('expanded');
    });

    // Wire up events
    mitraWindow.onMinimize = () => {
      if (contextStore.setWindowState) contextStore.setWindowState('minimized');
      setTimeout(() => mitraButton.show(), 300);
    };

    // Restore saved window state across page navigation
    const savedWindowState = (contextStore.getWindowState && typeof contextStore.getWindowState === 'function') ? contextStore.getWindowState() : 'minimized';
    if (savedWindowState === 'expanded') {
      mitraButton.hide();
      mitraWindow.expand();
    } else {
      mitraWindow.minimize();
      mitraButton.show();
    }

    eventBus.on('runtime.thinking', () => mitraButton.setThinking(true));
    eventBus.on('runtime.idle', () => mitraButton.setThinking(false));
    eventBus.on('capability.finished', () => mitraButton.setThinking(false));
    eventBus.on('notification.received', () => mitraButton.setThinking(false));

    // Avatar customization modal setup
    const avatarModal = new AvatarModal(eventBus, contextStore);
    shell.appendChild(avatarModal.element);

    eventBus.on('avatar.request_change', () => {
      avatarModal.open();
    });

    // Drag-and-drop tracking
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const startDrag = (e) => {
      if (contextStore.getDockMode() !== 'floating') return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('.mitra-header-avatar')) {
        return;
      }

      isDragging = true;
      const rect = shell.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      shell.style.transition = 'none';
      if (document.body) document.body.style.userSelect = 'none';

      const doDrag = (moveEvt) => {
        if (!isDragging) return;
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
        newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));

        shell.style.left = `${newLeft}px`;
        shell.style.top = `${newTop}px`;
        shell.style.bottom = 'auto';
        shell.style.right = 'auto';
      };

      const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;

        shell.style.transition = '';
        if (document.body) document.body.style.userSelect = '';

        window.removeEventListener('pointermove', doDrag);
        window.removeEventListener('pointerup', stopDrag);
        window.removeEventListener('mousemove', doDrag);
        window.removeEventListener('mouseup', stopDrag);

        if (shell.style.left && shell.style.top) {
          contextStore.setPosition({
            left: shell.style.left,
            top: shell.style.top
          });
        }
      };

      window.addEventListener('pointermove', doDrag);
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('mousemove', doDrag);
      window.addEventListener('mouseup', stopDrag);
    };

    mitraButton.element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      startDrag(e);
    });

    mitraWindow.header.element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      startDrag(e);
    });

    // Viewport bounds constraint check on resize
    window.addEventListener('resize', () => {
      if (contextStore.getDockMode() === 'floating' && shell.style.left) {
        const rect = shell.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const currentLeft = parseFloat(shell.style.left);
        const currentTop = parseFloat(shell.style.top);

        if (!isNaN(currentLeft) && !isNaN(currentTop)) {
          const newLeft = Math.max(0, Math.min(currentLeft, viewportWidth - rect.width));
          const newTop = Math.max(0, Math.min(currentTop, viewportHeight - rect.height));

          shell.style.left = `${newLeft}px`;
          shell.style.top = `${newTop}px`;
        }
      }
    });

    // Append to shell
    shell.appendChild(mitraWindow.element);
    shell.appendChild(mitraButton.element);
  }
}

customElements.define('mitra-companion', MitraCompanion);
