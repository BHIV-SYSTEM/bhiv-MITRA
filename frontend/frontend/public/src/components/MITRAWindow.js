import { Header } from './Header.js';
import { ConversationPanel } from './ConversationPanel.js';
import { Footer } from './Footer.js';
import { CapabilityLauncher } from './CapabilityLauncher.js';
import { HealthPanel } from './HealthPanel.js';
import { ActivityIndicator } from './ActivityIndicator.js';
import { SettingsModal } from './SettingsModal.js';
import { renderAvatarElement, getActiveMitraAvatar } from '../services/avatarHelper.js';
import { contextStore } from '../services/contextStore.js';

export class MITRAWindow {
  constructor(runtimeService, eventBus, dockController) {
    this.runtimeService = runtimeService;
    this.eventBus = eventBus;
    this.dockController = dockController;
    
    this.element = document.createElement('div');
    this.element.className = 'mitra-window';
    this.state = 'minimized'; // 'minimized', 'expanded'

    this.settingsModal = null;
    this.whatsAppModal = null;

    this.header = new Header(
      () => this.minimize(),
      () => {
        this.healthPanel.toggle();
      },
      () => {
        this.eventBus.emit('avatar.request_change');
      }
    );

    this.unreadNotificationsCount = 0;

    // Notification Drawer
    this.header.onNotificationClick = () => {
      this.unreadNotificationsCount = 0;
      this.header.setUnreadBadgeCount(0);

      if (window.__mitra_notif_drawer) {
        window.__mitra_notif_drawer.toggle();
      } else {
        import('./NotificationDrawer.js').then(({ NotificationDrawer }) => {
          window.__mitra_notif_drawer = new NotificationDrawer(this.eventBus);
          document.body.appendChild(window.__mitra_notif_drawer.element);
          window.__mitra_notif_drawer.open();
        });
      }
    };

    // Header WhatsApp Button Click
    this.header.onWhatsAppClick = () => {
      this.openWhatsAppModal();
    };

    // Header Settings Button Click
    this.header.onSettingsClick = () => {
      this.openSettingsModal();
    };

    // Increment unread notification badge on incoming real notifications
    this.eventBus.on('notification.received', () => {
      this.unreadNotificationsCount++;
      this.header.setUnreadBadgeCount(this.unreadNotificationsCount);
    });

    // Remote event listeners
    this.eventBus.on('whatsapp.open_modal', () => {
      this.openWhatsAppModal();
    });

    this.eventBus.on('settings.open_modal', () => {
      this.openSettingsModal();
    });

    if (typeof window !== 'undefined') {
      window.__mitra_open_whatsapp = () => this.openWhatsAppModal();
      window.__mitra_open_settings = () => this.openSettingsModal();
      if (!window.__MITRA_WHATSAPP_WEB__) {
        window.__MITRA_WHATSAPP_WEB__ = () => this.openWhatsAppModal();
      }
    }

    // Initial and dynamic avatar updates
    const initialAvatar = getActiveMitraAvatar(contextStore);
    this.header.updateAvatar(initialAvatar, renderAvatarElement);

    this.eventBus.on('avatar.changed', (data) => {
      const activeAvatar = getActiveMitraAvatar(contextStore);
      this.header.updateAvatar(activeAvatar, renderAvatarElement);
    });

    // Listen for health status changes to update header indicator
    this.eventBus.on('health.changed', (data) => {
      if (this.header && this.header.setStatus) {
        this.header.setStatus(data.status, data.latency);
      }
    });

    // Listen for runtime thinking / idle to reflect in Header status
    this.eventBus.on('runtime.thinking', () => {
      if (this.header && this.header.setStatus) {
        this.header.setStatus('Thinking', 'processing...');
      }
    });

    this.eventBus.on('runtime.idle', () => {
      if (this.header && this.header.setStatus) {
        this.header.setStatus('Healthy', runtimeService.latency || 'ready');
      }
    });

    // Listen for click on suggested actions
    this.eventBus.on('chat.send_suggested', (text) => {
      if (this.runtimeService) {
        this.runtimeService.sendMessage(text, false);
      }
    });

    this.healthPanel = new HealthPanel(eventBus);
    
    // Inject dock controller into header
    this.header.element.querySelector('.mitra-controls').prepend(dockController.element);

    this.conversation = new ConversationPanel(eventBus, runtimeService.context);
    
    this.launcher = new CapabilityLauncher(
      () => {}, 
      (capability, intent) => {
        if (capability === 'legal') {
          window.open('/privacy.html', '_blank', 'noopener,noreferrer');
          return;
        }

        if (capability === 'settings') {
          this.openSettingsModal();
          return;
        }

        if (capability === 'whatsapp' || capability === 'telegram') {
          this.openWhatsAppModal();
          return;
        }

        if (capability === 'voice') {
          const micBtn = this.footer.element.querySelector('#btn-mic');
          if (micBtn) micBtn.click();
          return;
        }

        if (capability === 'summarize') {
          const inputEl = this.footer.element.querySelector('#chat-input');
          const inputText = inputEl ? inputEl.value.trim() : '';

          if (!inputText) {
            this.eventBus.emit('chat.mitra_message', {
              role: 'mitra',
              text: '📌 To summarize, type or paste your text in the message box below, then click **Summarize** again.\n\nFor example: "Artificial intelligence is transforming many industries..."',
              intent: 'summarize_prompt'
            });
            return;
          }

          this.eventBus.emit('user.message_sent', { text: `📄 [Summarize] ${inputText.substring(0, 60)}${inputText.length > 60 ? '...' : ''}` });
          if (inputEl) inputEl.value = '';

          this.runtimeService.sendCapabilityRequest('summarize', 'summarize_text', { text: inputText });
          return;
        }

        if ((capability === 'ocr' || capability === 'image') && !this.footer.getAttachedImage()) {
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '⚠️ Please attach an image first using the 📎 button next to the input bar before running OCR or Image Analysis.',
            intent: 'validation_error'
          });
          return;
        }
        const attachedImg = this.footer.getAttachedImage();
        const params = attachedImg ? { image_url: attachedImg } : {};
        this.runtimeService.sendCapabilityRequest(capability, intent, params);
      }
    );

    this.activityIndicator = new ActivityIndicator(eventBus);

    this.footer = new Footer(
      (text, imagePayload, wasVoice) => {
        if (imagePayload) {
          const reqText = text || 'Analyze attached image';
          this.eventBus.emit('user.message_sent', { text: `📷 [Attached Image] ${reqText}` });
          this.runtimeService.sendCapabilityRequest('ocr', 'extract_text', { image_url: imagePayload, prompt: reqText });
        } else {
          this.runtimeService.sendMessage(text);
        }
      },
      () => this.launcher.toggle()
    );

    // Assembly
    this.element.appendChild(this.header.element);
    this.element.appendChild(this.healthPanel.element);
    
    const contentArea = document.createElement('div');
    contentArea.className = 'mitra-content';
    contentArea.appendChild(this.conversation.element);
    contentArea.appendChild(this.launcher.element);
    if (this.conversation.scrollBottomBtn) {
      contentArea.appendChild(this.conversation.scrollBottomBtn);
    }
    this.element.appendChild(contentArea);

    this.element.appendChild(this.activityIndicator.element);
    this.element.appendChild(this.footer.element);

    // Forward wheel scrolling from header, indicator, or borders to the conversation scroll area
    this.element.addEventListener('wheel', (e) => {
      if (this.conversation && this.conversation.element) {
        if (!this.conversation.element.contains(e.target)) {
          this.conversation.element.scrollTop += e.deltaY;
        }
      }
    }, { passive: true });
    
    this.onMinimize = null;
  }

  openSettingsModal() {
    if (typeof window !== 'undefined' && typeof window.__MITRA_SETTINGS__ === 'function') {
      try { window.__MITRA_SETTINGS__(); } catch (e) {}
    }
    if (!this.settingsModal) {
      this.settingsModal = new SettingsModal();
      document.body.appendChild(this.settingsModal.element);
    }
    this.settingsModal.open();
  }

  openWhatsAppModal() {
    if (typeof window !== 'undefined' && typeof window.__MITRA_WHATSAPP_WEB__ === 'function') {
      try {
        window.__MITRA_WHATSAPP_WEB__();
        return;
      } catch (e) {}
    }
    import('./WhatsAppModal.js').then(({ WhatsAppModal }) => {
      if (!this.whatsAppModal) {
        this.whatsAppModal = new WhatsAppModal(this.eventBus);
        document.body.appendChild(this.whatsAppModal.element);
      }
      this.whatsAppModal.open();
    }).catch(e => {
      console.warn('WhatsApp modal unavailable:', e);
    });
  }

  expand() {
    this.state = 'expanded';
    this.element.classList.remove('minimized');
    this.element.classList.add('expanded', 'active', 'open');
    this.element.style.setProperty('display', 'flex', 'important');
    this.element.style.setProperty('visibility', 'visible', 'important');
    this.element.style.setProperty('opacity', '1', 'important');
    this.element.style.setProperty('pointer-events', 'auto', 'important');
    this.element.style.setProperty('transform', 'translateY(0) scale(1)', 'important');
    this.element.style.setProperty('width', '400px', 'important');
    this.element.style.setProperty('height', '650px', 'important');
    this.element.style.setProperty('max-height', 'calc(100vh - 120px)', 'important');
    this.element.style.setProperty('background', '#141418', 'important');
    this.element.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.15)', 'important');
    this.element.style.setProperty('border-radius', '20px', 'important');
    this.element.style.setProperty('box-shadow', '0 12px 40px rgba(0, 0, 0, 0.6)', 'important');
    this.element.style.setProperty('z-index', '9999999', 'important');
    if (this.conversation && typeof this.conversation.scrollToBottom === 'function') {
      setTimeout(() => this.conversation.scrollToBottom(false), 50);
    }
  }

  minimize() {
    this.state = 'minimized';
    this.element.classList.remove('expanded', 'active', 'open');
    this.element.classList.add('minimized');
    this.element.style.setProperty('display', 'none', 'important');
    this.element.style.setProperty('visibility', 'hidden', 'important');
    this.element.style.setProperty('opacity', '0', 'important');
    this.element.style.setProperty('pointer-events', 'none', 'important');
    if (this.onMinimize) {
      try {
        this.onMinimize();
      } catch (err) {
        console.warn('[MITRA] onMinimize error:', err);
      }
    }
  }
}
