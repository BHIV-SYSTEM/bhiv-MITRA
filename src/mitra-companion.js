import { runtimeService } from './services/RuntimeService.js';
import { eventBus } from './services/eventBus.js';
import { MITRAButton } from './components/MITRAButton.js';
import { MITRAWindow } from './components/MITRAWindow.js';
import { NotificationCenter } from './components/NotificationCenter.js';
import { DockController } from './components/DockController.js';
import { contextStore } from './services/contextStore.js';
import { AvatarModal } from './components/AvatarModal.js';
import { initActiveMitraAvatar, setCachedActiveAvatar } from './services/avatarHelper.js';

class MitraCompanion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    try {
      window.__mitra_event_bus = eventBus;
      
      // Capture configuration attributes if provided
      const apiAttr = this.getAttribute('api-base-url');
      if (apiAttr && apiAttr.trim()) {
        window.__MITRA_API_BASE_URL = apiAttr.trim();
      }
      const hostAppAttr = this.getAttribute('host-app');
      if (hostAppAttr && hostAppAttr.trim()) {
        window.__MITRA_HOST_APP = hostAppAttr.trim();
      }
      const userIdAttr = this.getAttribute('user-id');
      if (userIdAttr && userIdAttr.trim()) {
        try { contextStore.setUserId(userIdAttr.trim()); } catch (e) {}
      }

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

      // Listen to host application avatar changes
      const onHostAvatarChanged = (e) => {
        const newAvatar = e.detail?.avatar || e.detail?.companionAvatar;
        if (newAvatar) {
          if (typeof setCachedActiveAvatar === 'function') {
            setCachedActiveAvatar(newAvatar);
          }
          if (contextStore && typeof contextStore.setAvatar === 'function') {
            try { contextStore.setAvatar(newAvatar); } catch (_) {}
          }
          eventBus.emit('avatar.changed', { avatar: newAvatar });
        }
      };
      window.addEventListener('mitra:avatar-changed', onHostAvatarChanged);
      window.addEventListener('mitra:companion-changed', onHostAvatarChanged);

      // Connect runtime services in the background
      runtimeService.connectAll().catch((err) => {
        console.warn('[MITRA] Runtime connect warning:', err);
      });

      // Optional background WhatsApp connection
      try {
        import('./services/whatsappClient.js').then(({ whatsAppClient }) => {
          if (whatsAppClient && typeof whatsAppClient.connect === 'function') {
            whatsAppClient.connect().catch(() => {});
          }
        }).catch(() => {});
      } catch (e) {}
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
      shell.style.setProperty('bottom', '24px', 'important');
      shell.style.setProperty('right', '24px', 'important');
      shell.style.setProperty('top', 'auto', 'important');
      shell.style.setProperty('left', 'auto', 'important');
      shell.style.setProperty('position', 'fixed', 'important');
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

    // Listen to WhatsApp connection changes if client is available (safe dynamic import)
    try {
      import('./services/whatsappClient.js')
        .then((mod) => {
          const client = mod?.whatsAppClient || mod?.default;
          if (client && typeof client.subscribe === 'function') {
            client.subscribe((waState) => {
              if (mitraWindow && mitraWindow.header) {
                mitraWindow.header.setWhatsAppConnected(Boolean(waState?.isReady));
              }
            });
          }
        })
        .catch(() => {});
    } catch (_) {}

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

    // FAB & Chatbot Window Logic
    const openWindow = () => {
      shell.style.setProperty('display', 'flex', 'important');
      shell.style.setProperty('pointer-events', 'auto', 'important');
      shell.style.setProperty('z-index', '9999999', 'important');
      if (contextStore.getDockMode() === 'floating') {
        if (!shell.style.left || shell.style.left === 'auto') {
          setFloatingDefaultPosition();
        } else {
          const parsedLeft = parseFloat(shell.style.left);
          const parsedTop = parseFloat(shell.style.top);
          if (!isNaN(parsedLeft)) {
            shell.style.left = `${Math.max(20, Math.min(parsedLeft, window.innerWidth - 440))}px`;
          }
          if (!isNaN(parsedTop)) {
            shell.style.top = `${Math.max(20, Math.min(parsedTop, window.innerHeight - 680))}px`;
          }
        }
      }
      mitraButton.hide();
      mitraWindow.expand();
      this.style.setProperty('pointer-events', 'none', 'important');
      if (contextStore.setWindowState) contextStore.setWindowState('expanded');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
    };

    const mitraButton = new MITRAButton(() => {
      openWindow();
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
        shell.style.setProperty('display', 'flex', 'important');
        shell.style.setProperty('pointer-events', 'auto', 'important');
        shell.style.setProperty('z-index', '9999999', 'important');
        mitraButton.show();
        if (contextStore.getDockMode() === 'floating' && (!shell.style.left || shell.style.left === 'auto')) {
          setFloatingDefaultPosition();
        }
      } else {
        mitraButton.hide();
      }
      this.style.setProperty('pointer-events', 'none', 'important');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    };

    const toggleWindow = () => {
      const isExpanded =
        mitraWindow.state === 'expanded' ||
        mitraWindow.element.classList.contains('expanded') ||
        mitraWindow.element.classList.contains('active') ||
        mitraWindow.element.style.display === 'flex';

      if (isExpanded) {
        avatarModal.close(false);
        mitraWindow.minimize();
      } else {
        openWindow();
      }
    };

    const doMinimize = () => {
      avatarModal.close(false);
      mitraWindow.minimize();
    };

    window.__MITRA_TOGGLE_ORB__ = toggleWindow;
    window.__MITRA_EXPAND__ = openWindow;
    window.__MITRA_MINIMIZE__ = doMinimize;
    eventBus.on('companion.toggle', toggleWindow);
    window.addEventListener('mitra:toggle-orb', toggleWindow);
    window.addEventListener('mitra:minimize-orb', doMinimize);

    // Window initial state:
    this.style.setProperty('pointer-events', 'none', 'important');
    const savedState = contextStore.getWindowState ? contextStore.getWindowState() : 'expanded';
    if (hideFab) {
      mitraWindow.minimize();
      mitraButton.hide();
      if (contextStore.setWindowState) contextStore.setWindowState('minimized');
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    } else if (savedState === 'minimized') {
      shell.style.setProperty('display', 'flex', 'important');
      shell.style.setProperty('pointer-events', 'auto', 'important');
      shell.style.setProperty('z-index', '9999999', 'important');
      mitraWindow.minimize();
      mitraButton.show();
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
    } else {
      shell.style.setProperty('display', 'flex', 'important');
      shell.style.setProperty('pointer-events', 'auto', 'important');
      shell.style.setProperty('z-index', '9999999', 'important');
      mitraButton.hide();
      mitraWindow.expand();
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
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
