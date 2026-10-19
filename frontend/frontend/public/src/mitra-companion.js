import { runtimeService } from './services/RuntimeService.js?v=v25';
import { eventBus } from './services/eventBus.js?v=v25';
import { MITRAButton } from './components/MITRAButton.js?v=v25';
import { MITRAWindow } from './components/MITRAWindow.js?v=v25';
import { NotificationCenter } from './components/NotificationCenter.js?v=v25';
import { DockController } from './components/DockController.js?v=v25';
import { contextStore } from './services/contextStore.js?v=v25';
import { AvatarModal } from './components/AvatarModal.js?v=v25';
import { initActiveMitraAvatar } from './services/avatarHelper.js?v=v25';

class MitraCompanion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    try {
      window.__mitra_event_bus = eventBus;
      // Synchronously render UI immediately so the floating orb and chatbot window always mount without delay
      this.render();

      // Load active avatar asynchronously from storage without blocking DOM rendering
      initActiveMitraAvatar(contextStore).then((activeAvatar) => {
        if (activeAvatar && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mitra:avatar-changed', { detail: { avatar: activeAvatar } }));
        }
      }).catch((err) => {
        console.warn('[MITRA] Avatar init warning:', err);
      });

      // Connect runtime services in the background
      runtimeService.connectAll().catch((err) => {
        console.warn('[MITRA] Runtime connect warning:', err);
      });
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

    // By default in floating mode, always anchor cleanly to bottom-right corner (bottom: 24px; right: 24px)
    if (contextStore.getDockMode() === 'floating') {
      setFloatingDefaultPosition();
      if (typeof contextStore.setPosition === 'function') {
        contextStore.setPosition(null);
      }
    }

    // Slide chatbot to the side when notification drawer opens so it does not obstruct notifications
    let drawerIsOpen = false;
    const handleDrawerState = (isOpen, width = 380) => {
      drawerIsOpen = !!isOpen;
      if (drawerIsOpen) {
        shell.classList.add('drawer-open');
        if (contextStore.getDockMode() === 'floating') {
          shell.style.removeProperty('inset');
          shell.style.bottom = '24px';
          shell.style.right = `${width + 24}px`;
          shell.style.left = 'auto';
          shell.style.top = 'auto';
        }
      } else {
        shell.classList.remove('drawer-open');
        if (contextStore.getDockMode() === 'floating') {
          setFloatingDefaultPosition();
        }
      }
    };

    eventBus.on('drawer.opened', (data) => handleDrawerState(true, data?.width || 380));
    eventBus.on('drawer.closed', () => handleDrawerState(false));
    window.addEventListener('mitra:drawer-state-changed', (e) => {
      handleDrawerState(e.detail?.open, e.detail?.width || 380);
    });

    // Global Notifications
    const notificationCenter = new NotificationCenter(eventBus);
    shell.appendChild(notificationCenter.element);

    // Dock Controller
    const dockController = new DockController(shell);

    const hideFab = this.hasAttribute('hide-fab') || this.getAttribute('hide-fab') === 'true';

    // Main Window
    const mitraWindow = new MITRAWindow(runtimeService, eventBus, dockController);

    // Avatar customization modal setup (instantiated BEFORE event wiring to avoid TDZ ReferenceError)
    const avatarModal = new AvatarModal(eventBus, contextStore);
    shell.appendChild(avatarModal.element);

    avatarModal.onClose = () => {
      // When avatar modal closes, keep the chatbot expanded only if it wasn't minimized!
      if (mitraWindow.state !== 'minimized') {
        mitraWindow.expand();
        if (contextStore.setWindowState) contextStore.setWindowState('expanded');
        window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
      }
    };

    eventBus.on('avatar.request_change', () => {
      mitraWindow.expand();
      avatarModal.open();
    });

    // FAB
    const mitraButton = new MITRAButton(() => {
      if (shell.style.left && shell.style.left !== 'auto') {
        const parsedLeft = parseFloat(shell.style.left);
        const parsedTop = parseFloat(shell.style.top);
        if (!isNaN(parsedLeft) && (parsedLeft + 420 > window.innerWidth || parsedLeft < 0)) {
          shell.style.left = `${Math.max(20, window.innerWidth - 440)}px`;
        }
        if (!isNaN(parsedTop) && (parsedTop + 680 > window.innerHeight || parsedTop < 60)) {
          shell.style.top = `${Math.max(60, window.innerHeight - 700)}px`;
        }
      }
      mitraButton.hide();
      mitraWindow.expand();
      if (contextStore.setWindowState) contextStore.setWindowState('expanded');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
    });

    // Double-click orb to reset to canonical bottom-right corner
    mitraButton.element.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setFloatingDefaultPosition();
      contextStore.setPosition(null);
    });

    if (hideFab) {
      if (typeof mitraButton.setHiddenPermanently === 'function') {
        mitraButton.setHiddenPermanently(true);
      }
      mitraButton.hide();
    }

    // Wire up events
    mitraWindow.onMinimize = () => {
      avatarModal.close(false);
      if (contextStore.setWindowState) contextStore.setWindowState('minimized');
      if (!hideFab) {
        setTimeout(() => mitraButton.show(), 100);
      } else {
        mitraButton.hide();
      }
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    };

    const toggleWindow = () => {
      if (mitraWindow.state === 'expanded') {
        avatarModal.close(false);
        mitraWindow.minimize();
      } else {
        if (shell.style.left && shell.style.left !== 'auto') {
          const parsedLeft = parseFloat(shell.style.left);
          const parsedTop = parseFloat(shell.style.top);
          if (!isNaN(parsedLeft) && (parsedLeft + 420 > window.innerWidth || parsedLeft < 0)) {
            shell.style.left = `${Math.max(20, window.innerWidth - 440)}px`;
          }
          if (!isNaN(parsedTop) && (parsedTop + 680 > window.innerHeight || parsedTop < 60)) {
            shell.style.top = `${Math.max(60, window.innerHeight - 700)}px`;
          }
        }
        mitraButton.hide();
        mitraWindow.expand();
        if (contextStore.setWindowState) contextStore.setWindowState('expanded');
        window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
      }
    };

    window.__MITRA_TOGGLE_ORB__ = toggleWindow;
    eventBus.on('companion.toggle', toggleWindow);
    window.addEventListener('mitra:toggle-orb', toggleWindow);

    // Window initial state:
    // Always start cleanly minimized as the floating orb so the chatbot screen never intrudes on page load
    if (hideFab) {
      mitraWindow.minimize();
      mitraButton.hide();
      if (contextStore.setWindowState) contextStore.setWindowState('minimized');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    } else {
      mitraWindow.minimize();
      mitraButton.show();
      if (contextStore.setWindowState) contextStore.setWindowState('minimized');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    }

    eventBus.on('runtime.thinking', () => mitraButton.setThinking(true));
    eventBus.on('runtime.idle', () => mitraButton.setThinking(false));
    eventBus.on('capability.finished', () => mitraButton.setThinking(false));
    eventBus.on('notification.received', () => mitraButton.setThinking(false));

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
