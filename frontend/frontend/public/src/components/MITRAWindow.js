import { Header } from './Header.js';
import { ConversationPanel } from './ConversationPanel.js';
import { Footer } from './Footer.js';
import { CapabilityLauncher } from './CapabilityLauncher.js';
import { HealthPanel } from './HealthPanel.js';
import { ActivityIndicator } from './ActivityIndicator.js';
import { SettingsModal } from './SettingsModal.js';
import { renderAvatarElement, getActiveMitraAvatar } from '../services/avatarHelper.js';
import { contextStore } from '../services/contextStore.js';
import { controlPlane } from '../services/controlPlane.js';

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
      window.__mitra_close_launcher = () => { if (this.launcher) this.launcher.close(); };
      if (!window.__MITRA_WHATSAPP_WEB__) {
        window.__MITRA_WHATSAPP_WEB__ = () => this.openWhatsAppModal();
      }
    }

    // Initial and dynamic avatar updates
    
    // Live Chatbot Background & Theme synchronizer
    const syncActiveChatBackground = () => {
      try {
        const bg = (typeof localStorage !== 'undefined' && localStorage.getItem('mitra_chat_bg')) || 'var(--mitra-bg, #141418)';
        this.element.style.setProperty('background', bg, 'important');
      } catch (e) {}
    };
    syncActiveChatBackground();

    if (typeof window !== 'undefined') {
      window.addEventListener('mitra:background-changed', (e) => {
        const bg = e.detail?.background || (typeof localStorage !== 'undefined' && localStorage.getItem('mitra_chat_bg')) || 'var(--mitra-bg, #141418)';
        this.element.style.setProperty('background', bg, 'important');
      });
    }
const initialAvatar = getActiveMitraAvatar(contextStore);
    this.header.updateAvatar(initialAvatar, renderAvatarElement);

    this.eventBus.on('avatar.changed', (data) => {
      const activeAvatar = (data && data.avatar) ? data.avatar : getActiveMitraAvatar(contextStore);
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
      if (text.includes('Start Voice Input') || text.includes('Start Mic')) {
        const micBtn = this.footer.element.querySelector('#btn-mic');
        if (micBtn) micBtn.click();
        return;
      }
      if (text.includes('Open Settings') || text.includes('Settings')) {
        this.openSettingsModal();
        return;
      }
      if (text.includes('Open WhatsApp') || text.includes('WhatsApp Web')) {
        this.openWhatsAppModal();
        return;
      }
      if (text.includes('Test AI Voice') || text.includes('Test Voice Output')) {
        controlPlane.speakText('Hello! MITRA AI Voice synthesis is active and working properly.', true);
        return;
      }
      if (text.includes('Attach an image') || text.includes('Attach a photo')) {
        const fileInput = this.footer.element.querySelector('#file-input-image');
        if (fileInput) fileInput.click();
        return;
      }
      if (text.includes('Generate:')) {
        const prompt = text.replace(/^.*?Generate:\s*/i, '').trim();
        this.eventBus.emit('user.message_sent', { text: `🎨 [Generate Image] ${prompt}` });
        this.runtimeService.sendCapabilityRequest('image', 'generate_image', { prompt: prompt });
        return;
      }
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

        const inputEl = this.footer.element.querySelector('#chat-input');
        const inputText = inputEl ? inputEl.value.trim() : '';

        if (capability === 'voice') {
          const micBtn = this.footer.element.querySelector('#btn-mic');
          if (micBtn) micBtn.click();
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '🎙️ **MITRA Voice & Audio Assistant Active**\n\nMicrophone is listening! Speak your question or command clearly into your mic:\n\n• "Summarize today\'s schedule"\n• "Plan my day"\n• "Translate Hello into Hindi"\n• "Remind me to drink water in 30 minutes"\n\n*(You can also click the 🔊 icon on any message to hear MITRA speak out loud!)*',
            intent: 'voice_active',
            suggestedActions: [
              '🎙️ Start Voice Input',
              '🔊 Test AI Voice Speech',
              '📅 Plan My Day',
              '📋 Show My Tasks'
            ]
          });
          return;
        }

        if (capability === 'calendar') {
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `📅 [Calendar] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendMessage(inputText);
            return;
          }
          this.runtimeService.sendCapabilityRequest('calendar', 'list_events', {});
          return;
        }

        if (capability === 'translate') {
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `🌐 [Translate] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendMessage(`Translate "${inputText}" into Hindi`);
            return;
          }
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '🌐 **MITRA Multilingual Translator**\n\nType or paste any text in the message box to translate instantly!\n\nOr click a quick action to test:',
            intent: 'translate_prompt',
            suggestedActions: [
              'Translate "Hello, how are you?" into Hindi',
              'Translate "Good morning, have a great day" into Spanish',
              'Translate "Thank you very much" into French',
              'Translate "Welcome to our team" into German',
              'Translate "How are you doing today?" into Marathi'
            ]
          });
          return;
        }

        if (capability === 'summarize') {
          let textToSummarize = inputText;
          if (!textToSummarize) {
            const history = (this.runtimeService && this.runtimeService.context) ? this.runtimeService.context.getHistory() : [];
            const lastMsg = [...history].reverse().find(m => m.text && m.text.length > 25 && !m.text.startsWith('📌') && !m.text.startsWith('I have received'));
            if (lastMsg) {
              textToSummarize = lastMsg.text;
            }
          }

          if (!textToSummarize) {
            this.eventBus.emit('chat.mitra_message', {
              role: 'mitra',
              text: '📌 **MITRA AI Summarizer**\n\nTo summarize, please type or paste your text in the message box below, or ask:\n• "Summarize my day"\n• "Summarize this: [paste article/text]"',
              intent: 'summarize_prompt',
              suggestedActions: [
                '📅 Summarize my day',
                '📰 Summarize latest news'
              ]
            });
            return;
          }

          this.eventBus.emit('user.message_sent', { text: `📄 [Summarize] ${textToSummarize.substring(0, 60)}${textToSummarize.length > 60 ? '...' : ''}` });
          if (inputEl) inputEl.value = '';

          this.runtimeService.sendCapabilityRequest('summarize', 'summarize_text', { text: textToSummarize });
          return;
        }

        if (capability === 'task') {
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `📋 [Task] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendCapabilityRequest('task', 'create_task', { title: inputText });
            return;
          }
          this.runtimeService.sendCapabilityRequest('task', 'list_tasks', { action: 'list' });
          return;
        }

        if (capability === 'reminder') {
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `⏰ [Reminder] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendMessage(`Remind me to ${inputText}`);
            return;
          }
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '⏰ **MITRA Reminders & Alarms**\n\nType a reminder with time in the chat box, for example:\n• "Remind me to call client in 30 minutes"\n• "Remind me to review document at 5pm"\n• "Remind me to submit report tomorrow at 10am"',
            intent: 'reminder_prompt',
            suggestedActions: [
              'Remind me to stretch in 15 minutes',
              'Remind me to drink water in 30 minutes',
              'Remind me to check tasks in 1 hour'
            ]
          });
          return;
        }

        if (capability === 'health') {
          this.runtimeService.sendCapabilityRequest('health', 'check_health', {});
          return;
        }

        if (capability === 'email') {
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `✉️ [Email] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendMessage(`Send email: ${inputText}`);
            return;
          }
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '✉️ **MITRA Google Workspace Email**\n\nSend or draft emails directly through chat!\n\nFormat example:\n• "Send email to team@blackholeinfiverse.com subject Sprint Review saying Meeting is at 4pm"',
            intent: 'email_prompt',
            suggestedActions: [
              'Check my unread emails',
              'Draft email to team about sprint sync'
            ]
          });
          return;
        }

        if (capability === 'ocr') {
          const attachedImg = this.footer.getAttachedImage();
          if (!attachedImg) {
            this.eventBus.emit('chat.mitra_message', {
              role: 'mitra',
              text: '📄 **MITRA Document Scanner & OCR**\n\nTo scan and extract text from an image, document, or bill:\n1. Choose your document using the file picker\n2. Click Send or choose OCR again to extract text instantly!',
              intent: 'ocr_prompt',
              suggestedActions: [
                '📎 Attach an image from device',
                '📄 What can OCR do?'
              ]
            });
            const fileInput = this.footer.element.querySelector('#file-input-image');
            if (fileInput) fileInput.click();
            return;
          }
          const reqText = inputText || 'Extract and transcribe all text from attached image';
          this.runtimeService.sendCapabilityRequest('ocr', 'extract_text', { image_url: attachedImg, prompt: reqText });
          return;
        }

        if (capability === 'image') {
          const attachedImg = this.footer.getAttachedImage();
          if (attachedImg) {
            const reqText = inputText || 'Analyze this image and describe its visual composition';
            this.runtimeService.sendCapabilityRequest('image', 'analyze_image', { image_url: attachedImg, prompt: reqText });
            return;
          }
          if (inputText) {
            this.eventBus.emit('user.message_sent', { text: `🎨 [Generate Image] ${inputText}` });
            if (inputEl) inputEl.value = '';
            this.runtimeService.sendCapabilityRequest('image', 'generate_image', { prompt: inputText });
            return;
          }
          this.eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '🎨 **MITRA AI Image Studio**\n\nCreate stunning AI artwork or analyze your photos!\n\n• Type any image description in the message box, e.g. *"A cute robot reading a book"*\n• Or attach a photo using the 📎 button to analyze its content!',
            intent: 'image_prompt',
            suggestedActions: [
              '🎨 Generate: A glowing cybernetic Mitra companion orb in space',
              '🖼️ Generate: Sunrise over snow-capped Himalayan mountains painting',
              '🏙️ Generate: Futuristic Mumbai with flying electric cars in 2050'
            ]
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
          this.runtimeService.sendMessage(text, wasVoice);
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
    const activeBg = (typeof localStorage !== 'undefined' && localStorage.getItem('mitra_chat_bg')) || 'var(--mitra-bg, #141418)';
    this.element.style.setProperty('background', activeBg, 'important');
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
