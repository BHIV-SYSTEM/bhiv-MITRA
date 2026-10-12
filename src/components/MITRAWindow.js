import { Header } from './Header.js';
import { ConversationPanel } from './ConversationPanel.js';
import { Footer } from './Footer.js';
import { CapabilityLauncher } from './CapabilityLauncher.js';
import { HealthPanel } from './HealthPanel.js';
import { ActivityIndicator } from './ActivityIndicator.js';
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

    this.header = new Header(
      () => this.minimize(),
      () => {
        // Toggle health panel
        this.healthPanel.toggle();
      },
      () => {
        this.eventBus.emit('avatar.request_change');
      }
    );

    this.unreadNotificationsCount = 0;

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

    // Increment unread notification badge on incoming real notifications
    this.eventBus.on('notification.received', () => {
      this.unreadNotificationsCount++;
      this.header.setUnreadBadgeCount(this.unreadNotificationsCount);
    });

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

    // Listen for remote request to open settings
    this.eventBus.on('settings.open_modal', () => {
      if (!window.__mitra_settings_modal) {
        import('./SettingsModal.js').then(({ SettingsModal }) => {
          window.__mitra_settings_modal = new SettingsModal();
          document.body.appendChild(window.__mitra_settings_modal.element);
          window.__mitra_settings_modal.open();
        });
      } else {
        window.__mitra_settings_modal.open();
      }
    });

    // Listen for click on suggested actions
    this.eventBus.on('chat.send_suggested', (text) => {
      if (this.runtimeService) {
        this.runtimeService.sendMessage(text);
      }
    });

    this.healthPanel = new HealthPanel(eventBus);
    
    // Inject dock controller into header
    this.header.element.querySelector('.mitra-controls').prepend(dockController.element);

    this.conversation = new ConversationPanel(eventBus, runtimeService.context);
    
    this.launcher = new CapabilityLauncher(
      () => {}, 
      (capability, intent) => {
        if (capability === 'settings') {
          if (!window.__mitra_settings_modal) {
            import('./SettingsModal.js').then(({ SettingsModal }) => {
              window.__mitra_settings_modal = new SettingsModal();
              document.body.appendChild(window.__mitra_settings_modal.element);
              window.__mitra_settings_modal.open();
            });
          } else {
            window.__mitra_settings_modal.open();
          }
          return;
        }

        if (capability === 'summarize') {
          // Read whatever text the user has typed in the input bar
          const inputEl = this.footer.element.querySelector('#chat-input');
          const inputText = inputEl ? inputEl.value.trim() : '';

          if (!inputText) {
            // Show an in-chat prompt so the user knows what to do
            this.eventBus.emit('chat.mitra_message', {
              role: 'mitra',
              text: '📌 To summarize, type or paste your text in the message box below, then click **Summarize** again.\n\nFor example: "Artificial intelligence is transforming many industries..."',
              intent: 'summarize_prompt'
            });
            return;
          }

          // Show the user's text as their message and clear the input
          this.eventBus.emit('user.message_sent', { text: `📄 [Summarize] ${inputText.substring(0, 60)}${inputText.length > 60 ? '...' : ''}` });
          if (inputEl) inputEl.value = '';

          this.runtimeService.sendCapabilityRequest('summarize', 'summarize_text', { text: inputText });
          return;
        }
        
        if (capability === 'whatsapp') {
          const inputEl = this.footer.element.querySelector('#chat-input');
          const inputText = inputEl ? inputEl.value.trim() : '';
          
          if (!inputText) {
            this.eventBus.emit('chat.mitra_message', {
              role: 'mitra',
              text: '📌 To send a WhatsApp message, type the number and message in the chat box, then click **WhatsApp** again.\n\nFor example: "+1234567890 Hello MITRA!"',
              intent: 'whatsapp_prompt'
            });
            return;
          }
          
          // Send it as a normal message so the new RuntimeService NLP can parse it
          this.eventBus.emit('chat.send_suggested', `Send a WhatsApp to ${inputText}`);
          if (inputEl) inputEl.value = '';
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
      (text, imagePayload) => {
        if (imagePayload) {
          const reqText = text || 'Analyze attached image';
          this.eventBus.emit('user.message_sent', { text: `📷 [Attached Image] ${reqText}` });
          this.runtimeService.sendCapabilityRequest('ocr', 'extract_text', { image_url: imagePayload, prompt: reqText });
        } else {
          this.runtimeService.sendMessage(text);
        }
      },
      () => this.launcher.open()
    );

    // Assembly
    this.element.appendChild(this.header.element);
    this.element.appendChild(this.healthPanel.element);
    
    const contentArea = document.createElement('div');
    contentArea.className = 'mitra-content';
    contentArea.appendChild(this.conversation.element);
    contentArea.appendChild(this.launcher.element);
    this.element.appendChild(contentArea);

    this.element.appendChild(this.activityIndicator.element);
    this.element.appendChild(this.footer.element);
    
    this.onMinimize = null;
  }

  expand() {
    this.state = 'expanded';
    this.element.classList.add('expanded');
  }

  minimize() {
    this.state = 'minimized';
    this.element.classList.remove('expanded');
    if (this.onMinimize) this.onMinimize();
  }
}
