/**
 * whatsappClient.js — Real-Time WhatsApp Web Client for MITRA Floating Orb
 * Connects directly to the WhatsApp Web microservice running on http://localhost:5001.
 * 
 * Supports:
 * - Dual Authentication: QR code and 8-digit Phone Pairing Code (ABCD-EFGH)
 * - Multi-field contact search (name, pushname, shortName, phone number)
 * - Outbound message dispatch with auto E.164 normalization (+91)
 * - Real-time incoming message notification forwarding to MITRA EventBus
 */

import { eventBus } from './eventBus.js';

class WhatsAppClient {
  constructor() {
    this.serviceUrl = (typeof window !== 'undefined' && window.__WHATSAPP_SERVICE_URL) || 'http://localhost:5001';
    this.socket = null;
    this.listeners = new Set();
    this.notificationListeners = new Set();
    this.socketScriptLoading = false;

    this.state = {
      status: 'DISCONNECTED',
      message: 'WhatsApp Web not connected.',
      isReady: false,
      userInfo: null,
      qrDataUrl: null,
      pairingCode: null,
      formattedCode: null,
      pairingPhone: null,
      contacts: []
    };
  }

  getServiceUrl() {
    return this.serviceUrl.replace(/\/+$/, '');
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    try {
      listener(this.getState());
    } catch (e) {
      console.error('[WhatsAppClient] Error calling listener:', e);
    }
    return () => this.listeners.delete(listener);
  }

  onNotification(listener) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  notify() {
    const current = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (err) {
        console.error('[WhatsAppClient] Listener error:', err);
      }
    });
  }

  notifyNotification(notif) {
    this.notificationListeners.forEach((listener) => {
      try {
        listener(notif);
      } catch (err) {
        console.error('[WhatsAppClient] Notification listener error:', err);
      }
    });
  }

  /**
   * Load Socket.IO client library dynamically if not already loaded on window.io
   */
  async ensureSocketIo() {
    if (typeof window === 'undefined') return false;
    if (window.io) return true;

    if (this.socketScriptLoading) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (window.io) {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve(Boolean(window.io));
        }, 8000);
      });
    }

    this.socketScriptLoading = true;

    // Try loading from local microservice first, then CDN fallback
    const urls = [
      `${this.getServiceUrl()}/socket.io/socket.io.js`,
      'https://cdn.socket.io/4.7.2/socket.io.min.js'
    ];

    for (const url of urls) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = url;
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error(`Failed to load ${url}`));
          document.head.appendChild(script);
        });
        if (window.io) {
          this.socketScriptLoading = false;
          return true;
        }
      } catch (e) {
        console.warn(`[WhatsAppClient] Could not load Socket.IO from ${url}, trying fallback...`);
      }
    }

    this.socketScriptLoading = false;
    return Boolean(window.io);
  }

  /**
   * Fetch current status from REST API endpoint
   */
  async syncStatus() {
    try {
      const res = await fetch(`${this.getServiceUrl()}/api/whatsapp/status`);
      if (res.ok) {
        const data = await res.json();
        this.state = {
          ...this.state,
          status: data.status || this.state.status,
          isReady: Boolean(data.isReady),
          userInfo: data.userInfo || this.state.userInfo,
          pairingCode: data.pairingCode || this.state.pairingCode,
          formattedCode: data.formattedCode || this.state.formattedCode,
          contacts: data.contacts || this.state.contacts
        };
        this.notify();
      }
    } catch (err) {
      // Backend may be offline or starting up
    }
    return this.getState();
  }

  /**
   * Connect to Socket.IO backend on http://localhost:5001
   */
  async connect() {
    await this.syncStatus();

    const hasIo = await this.ensureSocketIo();
    if (!hasIo) {
      console.warn('[WhatsAppClient] Socket.IO library unavailable, operating in REST fallback mode.');
      return;
    }

    if (this.socket && this.socket.connected) {
      return;
    }

    if (!this.socket) {
      try {
        this.socket = window.io(this.getServiceUrl(), {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 15,
          reconnectionDelay: 2000,
          timeout: 10000
        });

        this.setupSocketListeners();
      } catch (e) {
        console.error('[WhatsAppClient] Socket initialization error:', e);
      }
    } else {
      this.socket.connect();
    }
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WhatsAppClient] Connected to WhatsApp Web microservice on', this.getServiceUrl());
    });

    this.socket.on('status', (data) => {
      console.log('[WhatsAppClient] Status updated:', data);
      this.state = {
        ...this.state,
        status: data.status || this.state.status,
        message: data.message || this.state.message,
        isReady: Boolean(data.isReady),
        userInfo: data.userInfo || this.state.userInfo,
        pairingCode: data.pairingCode || this.state.pairingCode,
        formattedCode: data.formattedCode || this.state.formattedCode,
        pairingPhone: data.pairingPhone || this.state.pairingPhone
      };
      if (data.status === 'READY') {
        this.state.qrDataUrl = null;
        this.state.pairingCode = null;
        this.state.formattedCode = null;
        this.state.isReady = true;
      }
      this.notify();
    });

    this.socket.on('qr', (data) => {
      console.log('[WhatsAppClient] New QR code received.');
      this.state = {
        ...this.state,
        status: 'QR_READY',
        message: 'Scan the QR code or link via Phone Pairing Code.',
        qrDataUrl: data.qrDataUrl,
        isReady: false
      };
      this.notify();
    });

    this.socket.on('pairing_code', (data) => {
      console.log('[WhatsAppClient] Pairing code received:', data);
      this.state = {
        ...this.state,
        status: 'PAIRING_CODE_READY',
        message: `Enter code ${data.formattedCode} in WhatsApp on your phone`,
        pairingCode: data.code,
        formattedCode: data.formattedCode,
        pairingPhone: data.phoneNumber || this.state.pairingPhone,
        isReady: false
      };
      this.notify();
    });

    this.socket.on('authenticated', (data) => {
      console.log('[WhatsAppClient] WhatsApp authenticated:', data);
      this.state = {
        ...this.state,
        status: 'AUTHENTICATED',
        message: data.message || 'Session authenticated.',
        qrDataUrl: null,
        pairingCode: null,
        formattedCode: null
      };
      this.notify();
    });

    this.socket.on('ready', (data) => {
      console.log('[WhatsAppClient] WhatsApp client ready:', data);
      this.state = {
        ...this.state,
        status: 'READY',
        message: `Connected as ${data.userInfo?.pushname || 'User'}`,
        isReady: true,
        userInfo: data.userInfo,
        qrDataUrl: null,
        pairingCode: null,
        formattedCode: null
      };
      this.notify();
    });

    this.socket.on('contacts', (contacts) => {
      console.log(`[WhatsAppClient] Cached ${contacts?.length || 0} contacts.`);
      this.state = {
        ...this.state,
        contacts: contacts || []
      };
      this.notify();
    });

    // ── FEATURE 3: Real-Time Incoming WhatsApp Message Notification ──
    this.socket.on('new_whatsapp_notification', (notif) => {
      console.log('[WhatsAppClient] 🔔 Incoming WhatsApp Message:', notif);
      this.notifyNotification(notif);

      const sender = notif.senderName || notif.senderNumber || 'Unknown';
      const bodyText = notif.body || (notif.hasMedia ? `📎 [${notif.type || 'Media'}]` : 'New WhatsApp message');

      // Dispatch to MITRA EventBus: triggers Toast alert, increments header badge, adds to Notification Drawer
      if (eventBus) {
        eventBus.emit('notification.received', {
          title: `💬 WhatsApp: ${sender}`,
          text: bodyText,
          message: bodyText,
          source: 'whatsapp',
          data: notif,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    this.socket.on('disconnected', (data) => {
      console.warn('[WhatsAppClient] WhatsApp disconnected:', data);
      this.state = {
        ...this.state,
        status: 'DISCONNECTED',
        message: `Disconnected: ${data.reason || 'Session ended'}`,
        isReady: false,
        userInfo: null,
        qrDataUrl: null,
        pairingCode: null,
        formattedCode: null,
        contacts: []
      };
      this.notify();
    });

    this.socket.on('error', (err) => {
      console.error('[WhatsAppClient] Service error event:', err);
      this.state = {
        ...this.state,
        status: 'ERROR',
        message: err.message || 'WhatsApp Web service error.'
      };
      this.notify();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WhatsAppClient] Socket connection error:', err.message);
      this.state = {
        ...this.state,
        message: 'Could not connect to WhatsApp microservice (is port 5001 active?)'
      };
      this.notify();
    });
  }

  /**
   * Start WhatsApp Web client & request QR stream
   */
  initWhatsApp() {
    this.connect();
    if (this.socket) {
      this.state.status = 'INITIALIZING';
      this.state.message = 'Starting WhatsApp Web automation engine...';
      this.notify();
      this.socket.emit('init_whatsapp');
    } else {
      fetch(`${this.getServiceUrl()}/api/whatsapp/init`, { method: 'POST' }).catch(() => {});
    }
  }

  /**
   * Feature 2: Request Phone Pairing Code (8-digit OTP)
   */
  requestPairingCode(phoneNumber) {
    this.connect();
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        this.state.status = 'PAIRING_CODE_REQUESTED';
        this.state.message = `Requesting pairing code for ${phoneNumber}...`;
        this.notify();

        this.socket.emit('request_pairing_code', { phoneNumber }, (resp) => {
          if (resp && resp.success) {
            this.state.status = 'PAIRING_CODE_READY';
            this.state.pairingCode = resp.code;
            this.state.formattedCode = resp.formattedCode;
            this.state.pairingPhone = resp.phoneNumber;
            this.state.message = `Pairing code ready: ${resp.formattedCode}`;
            this.notify();
            resolve(resp);
          } else {
            this.state.status = 'ERROR';
            this.state.message = resp?.error || 'Failed to request pairing code.';
            this.notify();
            reject(new Error(resp?.error || 'Failed to request pairing code.'));
          }
        });
      } else {
        // Fallback to REST endpoint
        fetch(`${this.getServiceUrl()}/api/whatsapp/pairing-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              this.state.status = 'PAIRING_CODE_READY';
              this.state.pairingCode = data.code;
              this.state.formattedCode = data.formattedCode;
              this.state.pairingPhone = data.phoneNumber;
              this.notify();
              resolve(data);
            } else {
              reject(new Error(data.error || 'Failed to request pairing code.'));
            }
          })
          .catch(reject);
      }
    });
  }

  /**
   * Feature 1: Multi-field Contact Search (name, pushname, shortName, number)
   */
  searchContacts(query) {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('search_contacts', query, (resp) => {
          if (resp && resp.success) {
            resolve(resp.contacts || []);
          } else {
            reject(new Error(resp?.error || 'Failed to search contacts.'));
          }
        });
      } else {
        fetch(`${this.getServiceUrl()}/api/whatsapp/search-contacts?q=${encodeURIComponent(query)}`)
          .then((res) => res.json())
          .then((data) => resolve(data.contacts || []))
          .catch(reject);
      }
    });
  }

  /**
   * Fetch/Refresh full contact list
   */
  refreshContacts() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('get_contacts', (resp) => {
          if (resp && resp.success) {
            this.state.contacts = resp.contacts || [];
            this.notify();
            resolve(resp.contacts);
          } else {
            reject(new Error(resp?.error || 'Failed to fetch contacts.'));
          }
        });
      } else {
        fetch(`${this.getServiceUrl()}/api/whatsapp/contacts`)
          .then((res) => res.json())
          .then((data) => {
            this.state.contacts = data.contacts || [];
            this.notify();
            resolve(this.state.contacts);
          })
          .catch(reject);
      }
    });
  }

  /**
   * Send WhatsApp message to recipient phone number
   */
  sendMessage(to, message) {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('send_message', { to, message: message.trim() }, (resp) => {
          if (resp && resp.success) {
            resolve(resp);
          } else {
            reject(new Error(resp?.error || 'Failed to deliver message via WhatsApp Web.'));
          }
        });
      } else {
        fetch(`${this.getServiceUrl()}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, message: message.trim() })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) resolve(data);
            else reject(new Error(data.error || 'Failed to deliver message.'));
          })
          .catch(reject);
      }
    });
  }

  /**
   * Send Telegram Message directly from MITRA UI
   */
  sendTelegramMessage(chatId, message) {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('send_telegram_message', { chatId: String(chatId).trim(), message: message.trim() }, (resp) => {
          if (resp && resp.success) resolve(resp);
          else reject(new Error(resp?.error || 'Failed to send Telegram message'));
        });
      } else {
        fetch(`${this.getServiceUrl()}/api/telegram/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: String(chatId).trim(), message: message.trim() })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) resolve(data);
            else reject(new Error(data.error || 'Failed to send Telegram message'));
          })
          .catch(reject);
      }
    });
  }

  /**
   * Disconnect active WhatsApp session
   */
  disconnectSession() {
    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('disconnect_session', (resp) => {
          this.state = {
            status: 'DISCONNECTED',
            message: 'Session disconnected.',
            isReady: false,
            userInfo: null,
            qrDataUrl: null,
            pairingCode: null,
            formattedCode: null,
            pairingPhone: null,
            contacts: []
          };
          this.notify();
          resolve(Boolean(resp?.success));
        });
      } else {
        fetch(`${this.getServiceUrl()}/api/whatsapp/logout`, { method: 'POST' })
          .then(() => {
            this.state.status = 'DISCONNECTED';
            this.state.isReady = false;
            this.notify();
            resolve(true);
          })
          .catch(() => resolve(false));
      }
    });
  }
}

export const whatsAppClient = new WhatsAppClient();

