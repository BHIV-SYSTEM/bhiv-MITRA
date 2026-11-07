import { whatsAppClient } from '../services/whatsappClient.js';

/**
 * WhatsAppModal.js — WhatsApp Web Automation Modal for MITRA Floating Orb
 * 
 * Supports:
 * 1. Multi-field contact search (c.name, c.pushname, c.shortName, c.number, and digits)
 * 2. Dual Authentication: QR code scanning & 8-Digit Phone Pairing Code (ABCD-EFGH)
 * 3. Real-time notifications and message dispatch
 */
export class WhatsAppModal {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.element = document.createElement('div');
    this.element.className = 'mitra-whatsapp-modal-overlay';
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      z-index: 99999999 !important; pointer-events: auto !important;
      align-items: center; justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    this.activeAuthTab = 'qr';
    this.activeChannel = 'whatsapp'; // 'qr' | 'pairing_code'
    this.selectedContact = null;
    this.manualRecipientMode = false;
    this.searchQuery = '';
    this.isRequestingCode = false;
    this.isSending = false;
    this.isSyncing = false;

    this.render();

    // Subscribe to microservice state changes
    this.unsubscribeState = whatsAppClient.subscribe((state) => {
      this.updateStateView(state);
    });

    // Close on backdrop click
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });

    // Close on escape key
    this.handleKeyDown = (e) => {
      if (e.key === 'Escape' && this.element.style.display === 'flex') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);
  }

  open() {
    this.element.style.display = 'flex';
    whatsAppClient.connect();
    whatsAppClient.syncStatus();
    this.updateStateView(whatsAppClient.getState());
  }

  close() {
    this.element.style.display = 'none';
  }

  render() {
    this.element.innerHTML = `
      <div class="mitra-whatsapp-modal-dialog" style="
        width: 700px; max-width: 94vw; max-height: 90vh; overflow-y: auto;
        background: #121218; border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
        color: #fff; padding: 24px; display: flex; flex-direction: column; gap: 18px;
        position: relative; box-sizing: border-box;
      ">
        <!-- Top Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:14px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:12px; background:rgba(37, 211, 102, 0.15); border:1px solid rgba(37, 211, 102, 0.3); display:flex; align-items:center; justify-content:center; color:#25D366;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 16.51c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.83c.02 4.54-3.68 8.23-8.22 8.23zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.78 2.71 4.3 3.8.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.12-.22-.19-.47-.32z"/></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h3 style="margin:0; font-size:16px; font-weight:700;">WhatsApp Web Automation</h3>
                <span id="wa-status-badge" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:100px; background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.6); border:1px solid rgba(255,255,255,0.1);">
                  Checking status...
                </span>
              </div>
              <p style="margin:2px 0 0; font-size:11px; color:rgba(255,255,255,0.5);">
                Automate messaging &amp; receive notifications directly from your personal WhatsApp
              </p>
            </div>
          </div>
          <button id="wa-btn-close" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:20px; cursor:pointer; padding:4px 8px; border-radius:6px;">✕</button>
        </div>

        <!-- Multi-Channel Hub Tabs (WhatsApp & Telegram) -->
        <div style="display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px;">
          <button id="modal-tab-wa" style="padding:8px 14px; border-radius:10px; border:none; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; background:rgba(37,211,102,0.18); color:#25D366; transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 16.51c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.83c.02 4.54-3.68 8.23-8.22 8.23z"/></svg>
            WhatsApp Web
          </button>
          <button id="modal-tab-tg" style="padding:8px 14px; border-radius:10px; border:none; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.6); transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Telegram Dispatcher (@blackhole_mitra_bot)
          </button>
        </div>

        <!-- Dynamic Content Body Container -->
        <div id="wa-modal-body" style="display:flex; flex-direction:column; gap:16px;">
          <!-- Loaded dynamically via updateStateView() -->
        </div>

        <!-- Footer / Microservice Indicator -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; font-size:11px; color:rgba(255,255,255,0.4);">
          <div>Microservice: <span style="color:#00e676; font-family:monospace;">http://localhost:5001</span> (LocalAuth &amp; Socket.IO)</div>
          <div>MITRA Automation Surface</div>
        </div>
      </div>
    `;

    this.element.querySelector('#wa-btn-close').addEventListener('click', () => this.close());

    const tabWa = this.element.querySelector('#modal-tab-wa');
    const tabTg = this.element.querySelector('#modal-tab-tg');

    if (tabWa && tabTg) {
      tabWa.addEventListener('click', () => {
        this.activeChannel = 'whatsapp';
        tabWa.style.background = 'rgba(37,211,102,0.18)';
        tabWa.style.color = '#25D366';
        tabTg.style.background = 'rgba(255,255,255,0.05)';
        tabTg.style.color = 'rgba(255,255,255,0.6)';
        this.updateStateView(whatsAppClient.getState());
      });

      tabTg.addEventListener('click', () => {
        this.activeChannel = 'telegram';
        tabTg.style.background = 'rgba(0,168,255,0.2)';
        tabTg.style.color = '#38bdf8';
        tabWa.style.background = 'rgba(255,255,255,0.05)';
        tabWa.style.color = 'rgba(255,255,255,0.6)';
        const body = this.element.querySelector('#wa-modal-body');
        if (body) this.renderTelegramView(body);
      });
    }
  }

  updateStateView(state) {
    const badge = this.element.querySelector('#wa-status-badge');
    const body = this.element.querySelector('#wa-modal-body');
    if (!badge || !body) return;

    if (this.activeChannel === 'telegram') {
      badge.innerHTML = '● Telegram Ready';
      badge.style.background = 'rgba(0, 168, 255, 0.15)';
      badge.style.color = '#38bdf8';
      badge.style.borderColor = 'rgba(0, 168, 255, 0.3)';
      this.renderTelegramView(body);
      return;
    }

    if (state.isReady) {
      badge.innerHTML = '● Connected';
      badge.style.background = 'rgba(0, 230, 118, 0.15)';
      badge.style.color = '#00e676';
      badge.style.borderColor = 'rgba(0, 230, 118, 0.3)';

      this.renderConnectedView(body, state);
    } else {
      if (state.status === 'PAIRING_CODE_READY') {
        badge.innerHTML = '🔑 Pairing Code Ready';
        badge.style.background = 'rgba(255, 185, 0, 0.15)';
        badge.style.color = '#ffb900';
        badge.style.borderColor = 'rgba(255, 185, 0, 0.3)';
      } else if (state.status === 'QR_READY') {
        badge.innerHTML = '📷 QR Code Ready';
        badge.style.background = 'rgba(0, 168, 255, 0.15)';
        badge.style.color = '#00a8ff';
        badge.style.borderColor = 'rgba(0, 168, 255, 0.3)';
      } else if (state.status === 'INITIALIZING') {
        badge.innerHTML = '⏳ Initializing...';
        badge.style.background = 'rgba(162, 155, 254, 0.15)';
        badge.style.color = '#a29bfe';
        badge.style.borderColor = 'rgba(162, 155, 254, 0.3)';
      } else {
        badge.innerHTML = '⚪ Offline / Disconnected';
        badge.style.background = 'rgba(255, 255, 255, 0.05)';
        badge.style.color = 'rgba(255, 255, 255, 0.5)';
        badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }

      this.renderUnconnectedView(body, state);
    }
  }

  // ── 0. TELEGRAM OUTBOUND DISPATCHER VIEW ──
  renderTelegramView(container) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="background:rgba(0,168,255,0.08); border:1px solid rgba(0,168,255,0.25); border-radius:14px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(0,168,255,0.2); display:flex; align-items:center; justify-content:center; color:#00a8ff;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:13px; font-weight:700; color:#fff;">Telegram Outbound Dispatcher</span>
                <span style="font-size:10px; font-weight:600; padding:2px 8px; border-radius:100px; background:rgba(0,230,118,0.2); color:#00e676; border:1px solid rgba(0,230,118,0.3);">● Connected</span>
              </div>
              <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:2px;">
                Connected Bot: <strong style="color:#38bdf8;">@blackhole_mitra_bot</strong> · Outbound messaging surface
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:18px;">
          <label style="font-size:12px; font-weight:600; color:rgba(255,255,255,0.85);">Target Telegram Recipient (Chat ID):</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="btn-quick-ashwini" style="padding:6px 12px; border-radius:8px; border:1px solid rgba(56,189,248,0.4); background:rgba(56,189,248,0.15); color:#38bdf8; font-size:11px; font-weight:600; cursor:pointer;">
              👤 Ashwini Wadekar (1907447825)
            </button>
            <button id="btn-quick-custom" style="padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.7); font-size:11px; font-weight:600; cursor:pointer;">
              ✏️ Enter Custom ID
            </button>
          </div>

          <input type="text" id="tg-input-chat-id" value="1907447825" placeholder="Enter Telegram Chat ID..." style="width:100%; padding:10px 14px; background:#1a1a24; border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-size:12px; box-sizing:border-box;" />

          <label style="font-size:12px; font-weight:600; color:rgba(255,255,255,0.85); margin-top:6px;">Message to Send:</label>
          <textarea id="tg-input-message" rows="4" placeholder="Type message to dispatch to Telegram..." style="width:100%; padding:12px; background:#1a1a24; border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-size:12px; resize:none; box-sizing:border-box;"></textarea>

          <div id="tg-send-feedback" style="display:none; padding:10px 14px; border-radius:8px; font-size:12px;"></div>

          <button id="btn-send-tg-now" style="padding:12px; border-radius:12px; background:linear-gradient(135deg, #0284c7, #2563eb); border:none; color:#fff; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Send Telegram Message Now
          </button>
        </div>
      </div>
    `;

    const quickAshwini = container.querySelector('#btn-quick-ashwini');
    const quickCustom = container.querySelector('#btn-quick-custom');
    const inputChatId = container.querySelector('#tg-input-chat-id');
    const inputMsg = container.querySelector('#tg-input-message');
    const btnSend = container.querySelector('#btn-send-tg-now');
    const feedback = container.querySelector('#tg-send-feedback');

    if (quickAshwini && inputChatId) {
      quickAshwini.addEventListener('click', () => {
        inputChatId.value = '1907447825';
        inputChatId.focus();
      });
    }
    if (quickCustom && inputChatId) {
      quickCustom.addEventListener('click', () => {
        inputChatId.value = '';
        inputChatId.placeholder = 'Enter target user or group chat ID...';
        inputChatId.focus();
      });
    }

    if (btnSend) {
      btnSend.addEventListener('click', async () => {
        const chatId = inputChatId ? inputChatId.value.trim() : '';
        const msg = inputMsg ? inputMsg.value.trim() : '';

        if (!chatId) {
          alert('Please enter a target Telegram Chat ID.');
          return;
        }
        if (!msg) {
          alert('Please enter a message to send.');
          return;
        }

        btnSend.disabled = true;
        btnSend.textContent = 'Sending to Telegram...';
        try {
          await whatsAppClient.sendTelegramMessage(chatId, msg);
          if (inputMsg) inputMsg.value = '';
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = 'rgba(0, 230, 118, 0.15)';
            feedback.style.color = '#00e676';
            feedback.style.border = '1px solid rgba(0, 230, 118, 0.3)';
            feedback.innerHTML = `✓ Telegram message delivered successfully to ${chatId}!`;
            setTimeout(() => { feedback.style.display = 'none'; }, 4000);
          }
        } catch (err) {
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = 'rgba(235, 87, 87, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(235, 87, 87, 0.3)';
            feedback.innerHTML = `⚠️ Delivery Failed: ${err.message || 'Error sending Telegram message'}`;
          }
        } finally {
          btnSend.disabled = false;
          btnSend.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Send Telegram Message Now
          `;
        }
      });
    }
  }

  // ── 1. UNCONNECTED VIEW (DUAL AUTH TABS: QR + PHONE PAIRING CODE) ──
  renderUnconnectedView(container, state) {
    const isQr = this.activeAuthTab === 'qr';

    container.innerHTML = `
      <!-- Dual Auth Switcher -->
      <div style="display:flex; gap:8px; background:rgba(255,255,255,0.03); padding:4px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
        <button id="wa-tab-qr" style="
          flex:1; padding:10px 14px; border-radius:8px; border:none; cursor:pointer; font-size:12px; font-weight:600;
          display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s ease;
          background:${isQr ? 'rgba(37,211,102,0.15)' : 'transparent'};
          color:${isQr ? '#00e676' : 'rgba(255,255,255,0.6)'};
          border:${isQr ? '1px solid rgba(37,211,102,0.3)' : '1px solid transparent'};
        ">
          📷 Method 1: Scan QR Code
        </button>
        <button id="wa-tab-pairing" style="
          flex:1; padding:10px 14px; border-radius:8px; border:none; cursor:pointer; font-size:12px; font-weight:600;
          display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s ease;
          background:${!isQr ? 'rgba(37,211,102,0.15)' : 'transparent'};
          color:${!isQr ? '#00e676' : 'rgba(255,255,255,0.6)'};
          border:${!isQr ? '1px solid rgba(37,211,102,0.3)' : '1px solid transparent'};
        ">
          🔑 Method 2: Phone Pairing Code
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="wa-tab-content" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:20px;">
        ${isQr ? this.renderQrTabContent(state) : this.renderPairingTabContent(state)}
      </div>
    `;

    // Wire tab switches
    container.querySelector('#wa-tab-qr').addEventListener('click', () => {
      this.activeAuthTab = 'qr';
      this.updateStateView(whatsAppClient.getState());
    });
    container.querySelector('#wa-tab-pairing').addEventListener('click', () => {
      this.activeAuthTab = 'pairing_code';
      this.updateStateView(whatsAppClient.getState());
    });

    // Wire QR tab button
    const btnInit = container.querySelector('#wa-btn-init-qr');
    if (btnInit) {
      btnInit.addEventListener('click', () => {
        whatsAppClient.initWhatsApp();
      });
    }

    // Wire Pairing Code form
    const formPairing = container.querySelector('#wa-form-pairing');
    if (formPairing) {
      formPairing.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = container.querySelector('#wa-pairing-phone-input');
        const phone = input ? input.value.trim() : '';
        if (!phone) {
          alert('Please enter your phone number with country code (e.g. 919876543210).');
          return;
        }

        const btnReq = container.querySelector('#wa-btn-request-pairing');
        if (btnReq) {
          btnReq.disabled = true;
          btnReq.textContent = 'Requesting...';
        }

        try {
          await whatsAppClient.requestPairingCode(phone);
        } catch (err) {
          alert(`Pairing Request Failed: ${err.message || 'Could not generate pairing code'}`);
        } finally {
          if (btnReq) {
            btnReq.disabled = false;
            btnReq.textContent = 'Request Pairing Code';
          }
        }
      });
    }

    // Wire Copy Code button
    const btnCopy = container.querySelector('#wa-btn-copy-code');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const code = btnCopy.getAttribute('data-code') || '';
        navigator.clipboard.writeText(code).then(() => {
          btnCopy.textContent = '✓ Copied!';
          setTimeout(() => { btnCopy.textContent = '📋 Copy Code'; }, 2000);
        });
      });
    }
  }

  renderQrTabContent(state) {
    if (state.qrDataUrl) {
      return `
        <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:14px;">
          <div style="background:#fff; padding:12px; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.4); display:inline-block;">
            <img src="${state.qrDataUrl}" alt="WhatsApp QR Code" style="width:220px; height:220px; display:block;" />
          </div>
          <div>
            <div style="font-size:14px; font-weight:600; color:#fff;">Scan this QR code from your WhatsApp</div>
            <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-top:4px; max-width:360px;">
              1. Open WhatsApp on your phone<br>
              2. Go to <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong><br>
              3. Point your camera at this QR code
            </div>
          </div>
          <button id="wa-btn-init-qr" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:8px 16px; border-radius:8px; font-size:12px; cursor:pointer;">
            🔄 Refresh QR
          </button>
        </div>
      `;
    }

    return `
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:16px; padding:20px 0;">
        <div style="width:64px; height:64px; border-radius:50%; background:rgba(37,211,102,0.1); border:1px solid rgba(37,211,102,0.25); display:flex; align-items:center; justify-content:center; color:#00e676;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </div>
        <div>
          <div style="font-size:15px; font-weight:700;">Connect with QR Code</div>
          <p style="font-size:12px; color:rgba(255,255,255,0.5); max-width:400px; margin:6px auto 0;">
            Click below to initialize the browser automation engine and stream your WhatsApp Web QR code in real-time.
          </p>
        </div>
        <button id="wa-btn-init-qr" style="
          background:#25D366; color:#000; font-weight:700; font-size:13px;
          padding:12px 28px; border-radius:10px; border:none; cursor:pointer;
          box-shadow:0 4px 14px rgba(37,211,102,0.3); transition:transform 0.2s;
        ">
          ✦ Start WhatsApp &amp; Show QR
        </button>
      </div>
    `;
  }

  renderPairingTabContent(state) {
    const hasPairingCode = Boolean(state.formattedCode || state.pairingCode);
    const codeDisplay = state.formattedCode || state.pairingCode || '';

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,185,0,0.15); border:1px solid rgba(255,185,0,0.3); display:flex; align-items:center; justify-content:center; color:#ffb900;">
            🔑
          </div>
          <div>
            <div style="font-size:14px; font-weight:700; color:#fff;">Link with Phone Number (Pairing Code)</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.5);">
              Receive an 8-character OTP code on screen instead of scanning a QR code.
            </div>
          </div>
        </div>

        <form id="wa-form-pairing" style="display:flex; gap:10px; align-items:center;">
          <input
            type="text"
            id="wa-pairing-phone-input"
            value="${state.pairingPhone || ''}"
            placeholder="e.g. 9136398133 or 919876543210"
            style="
              flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15);
              border-radius:10px; padding:11px 14px; color:#fff; font-size:13px; outline:none;
            "
          />
          <button
            type="submit"
            id="wa-btn-request-pairing"
            style="
              background:#00e676; color:#0b0b0f; font-weight:700; font-size:12px;
              padding:11px 18px; border-radius:10px; border:none; cursor:pointer;
              white-space:nowrap;
            "
          >
            Request Pairing Code
          </button>
        </form>
        <div style="font-size:11px; color:rgba(255,255,255,0.4);">
          Tip: Indian numbers (10 digits) will automatically include country code +91.
        </div>

        ${hasPairingCode ? `
          <div style="
            background:rgba(0, 230, 118, 0.08); border:1.5px dashed #00e676;
            border-radius:14px; padding:18px; text-align:center; display:flex;
            flex-direction:column; align-items:center; gap:10px; margin-top:4px;
          ">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.6); font-weight:600;">
              Your 8-Digit Pairing Code
            </div>
            <div style="
              font-family:'Courier New', Courier, monospace; font-size:28px; font-weight:800;
              letter-spacing:6px; color:#00e676; text-shadow:0 0 12px rgba(0,230,118,0.5);
            ">
              ${codeDisplay}
            </div>
            <button
              id="wa-btn-copy-code"
              data-code="${codeDisplay}"
              style="
                background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);
                color:#fff; padding:6px 14px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;
              "
            >
              📋 Copy Code
            </button>
            <div style="font-size:12px; color:rgba(255,255,255,0.7); max-width:420px; line-height:1.5; margin-top:4px;">
              Open WhatsApp on your phone &gt; <strong>Linked Devices</strong> &gt; <strong>Link with phone number instead</strong> &gt; Enter the code above.
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── 2. CONNECTED VIEW (ACTIVE SESSION + CONTACT SEARCH + COMPOSER) ──
  renderConnectedView(container, state) {
    const user = state.userInfo || {};
    const pushname = user.pushname || 'User';
    const phone = user.phone ? `+${user.phone}` : '';
    const initial = pushname.charAt(0).toUpperCase() || 'W';
    const contacts = state.contacts || [];

    // Filter contacts based on searchQuery (Feature 1: name, pushname, shortName, number, digits)
    const q = (this.searchQuery || '').toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');

    const filteredContacts = q ? contacts.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const pn = (c.pushname || '').toLowerCase();
      const sn = (c.shortName || '').toLowerCase();
      const num = (c.number || '').toLowerCase();
      const numDigits = num.replace(/\D/g, '');

      return (
        name.includes(q) ||
        pn.includes(q) ||
        sn.includes(q) ||
        num.includes(q) ||
        (qDigits.length >= 3 && numDigits.includes(qDigits))
      );
    }) : contacts;

    container.innerHTML = `
      <!-- Active User Profile Card -->
      <div style="
        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);
        border-radius:14px; padding:12px 16px; display:flex; align-items:center;
        justify-content:space-between; flex-wrap:wrap; gap:12px;
      ">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="
            width:42px; height:42px; border-radius:50%; background:rgba(0,230,118,0.2);
            border:1.5px solid #00e676; display:flex; align-items:center; justify-content:center;
            font-size:18px; font-weight:800; color:#00e676;
          ">
            ${initial}
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:14px; font-weight:700; color:#fff;">${pushname}</span>
              <span style="font-size:10px; font-weight:700; padding:1px 6px; border-radius:10px; background:rgba(0,230,118,0.15); color:#00e676;">Active</span>
            </div>
            <div style="font-size:12px; color:rgba(255,255,255,0.5); font-family:monospace;">
              ${phone}
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px;">
          <button id="wa-btn-sync-contacts" style="
            background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
            color:#fff; padding:7px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;
          ">
            ${this.isSyncing ? '🔄 Syncing...' : '🔄 Sync Contacts'}
          </button>
          <button id="wa-btn-disconnect" style="
            background:rgba(235, 87, 87, 0.15); border:1px solid rgba(235, 87, 87, 0.3);
            color:#ff6b6b; padding:7px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;
          ">
            🚪 Disconnect
          </button>
        </div>
      </div>

      <!-- Main Two-Column Grid: Contacts (Left) + Composer (Right) -->
      <div style="display:grid; grid-template-columns: 1fr 1.1fr; gap:14px; min-height:330px;">
        <!-- Column 1: Contacts & Search (Feature 1) -->
        <div style="
          background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08);
          border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px;
        ">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="font-size:12px; font-weight:700; color:rgba(255,255,255,0.7); display:flex; align-items:center; gap:6px;">
              <span>👥 Contacts</span>
              <span style="font-size:10px; padding:1px 6px; border-radius:10px; background:rgba(255,255,255,0.1); color:#fff;">
                ${contacts.length}
              </span>
            </div>
            <button id="wa-toggle-manual" style="background:none; border:none; color:#00e676; font-size:11px; font-weight:600; cursor:pointer; text-decoration:underline;">
              ${this.manualRecipientMode ? '← Pick from list' : '+ Direct Number'}
            </button>
          </div>

          <!-- Contact Search Bar -->
          <input
            type="text"
            id="wa-contact-search"
            value="${this.searchQuery}"
            placeholder="Search name or number..."
            style="
              background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
              border-radius:8px; padding:8px 10px; font-size:12px; color:#fff; outline:none;
            "
          />

          <!-- Contact List Container -->
          <div id="wa-contact-list-container" style="
            flex:1; max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:4px;
            padding-right:4px;
          ">
            ${filteredContacts.length === 0 ? `
              <div style="text-align:center; color:rgba(255,255,255,0.4); font-size:12px; margin-top:40px;">
                ${contacts.length === 0 ? 'No contacts cached yet. Click "Sync Contacts".' : 'No contacts match "' + this.searchQuery + '"'}
              </div>
            ` : filteredContacts.slice(0, 100).map((c) => {
              const isSelected = this.selectedContact && this.selectedContact.id === c.id;
              return `
                <div class="wa-contact-item" data-id="${c.id}" style="
                  padding:8px 10px; border-radius:8px; cursor:pointer; transition:background 0.15s;
                  background:${isSelected ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255,255,255,0.03)'};
                  border:${isSelected ? '1px solid rgba(0, 230, 118, 0.4)' : '1px solid transparent'};
                  display:flex; align-items:center; justify-content:space-between;
                ">
                  <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <div style="font-size:12px; font-weight:600; color:${isSelected ? '#00e676' : '#fff'};">
                      ${c.name || 'Unknown'}
                    </div>
                    <div style="font-size:11px; color:rgba(255,255,255,0.4); font-family:monospace;">
                      ${c.number || ''}
                    </div>
                  </div>
                  ${isSelected ? '<span style="color:#00e676; font-size:12px;">✓</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Column 2: Message Composer -->
        <div style="
          background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08);
          border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:12px;
        ">
          <div style="font-size:12px; font-weight:700; color:rgba(255,255,255,0.7);">
            ✉️ Message Composer
          </div>

          <!-- Recipient Selector / Field -->
          <div>
            <label style="font-size:11px; color:rgba(255,255,255,0.5); display:block; margin-bottom:4px;">
              Recipient:
            </label>
            ${this.manualRecipientMode ? `
              <input
                type="text"
                id="wa-input-recipient"
                value="${this.selectedContact ? this.selectedContact.number : ''}"
                placeholder="e.g. 9167366173 or +919876543210"
                style="
                  width:100%; box-sizing:border-box; background:rgba(255,255,255,0.05);
                  border:1px solid rgba(255,255,255,0.15); border-radius:8px;
                  padding:8px 10px; font-size:12px; color:#fff; outline:none; font-family:monospace;
                "
              />
              <span style="font-size:10px; color:rgba(255,255,255,0.4); display:block; margin-top:2px;">
                10-digit Indian numbers will automatically format with +91.
              </span>
            ` : `
              <div style="
                background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
                border-radius:8px; padding:8px 10px; font-size:12px; color:#fff;
                display:flex; align-items:center; justify-content:space-between;
              ">
                <span id="wa-display-recipient" style="color:${this.selectedContact ? '#00e676' : 'rgba(255,255,255,0.4)'};">
                  ${this.selectedContact ? `${this.selectedContact.name} (${this.selectedContact.number})` : 'Select a contact from left list'}
                </span>
                ${this.selectedContact ? '<button id="wa-btn-clear-recipient" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer;">✕</button>' : ''}
              </div>
            `}
          </div>

          <!-- Message Textarea -->
          <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
            <label style="font-size:11px; color:rgba(255,255,255,0.5);">
              Message:
            </label>
            <textarea
              id="wa-textarea-body"
              placeholder="Type your WhatsApp message..."
              style="
                flex:1; min-height:100px; resize:none; background:rgba(255,255,255,0.05);
                border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:10px;
                font-size:12px; color:#fff; outline:none; font-family:inherit;
              "
            ></textarea>
          </div>

          <!-- Send Button & Feedback -->
          <button
            id="wa-btn-send-now"
            style="
              background:#00e676; color:#0b0b0f; font-weight:700; font-size:13px;
              padding:11px; border-radius:10px; border:none; cursor:pointer;
              display:flex; align-items:center; justify-content:center; gap:8px;
              box-shadow:0 4px 14px rgba(0, 230, 118, 0.25);
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            ${this.isSending ? 'Sending Message...' : 'Send WhatsApp Message'}
          </button>

          <div id="wa-send-feedback" style="display:none; font-size:11px; padding:8px 10px; border-radius:8px;"></div>
        </div>
      </div>
    `;

    // ── Wire Interactive Events ──
    // 1. Sync contacts
    const btnSync = container.querySelector('#wa-btn-sync-contacts');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        this.isSyncing = true;
        this.updateStateView(whatsAppClient.getState());
        try {
          await whatsAppClient.refreshContacts();
        } catch (e) {
          alert(`Sync Error: ${e.message}`);
        } finally {
          this.isSyncing = false;
          this.updateStateView(whatsAppClient.getState());
        }
      });
    }

    // 2. Disconnect session
    const btnDisc = container.querySelector('#wa-btn-disconnect');
    if (btnDisc) {
      btnDisc.addEventListener('click', async () => {
        if (confirm('Are you sure you want to disconnect this WhatsApp session?')) {
          await whatsAppClient.disconnectSession();
          this.selectedContact = null;
        }
      });
    }

    // 3. Search Contacts
    const searchInput = container.querySelector('#wa-contact-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.updateStateView(whatsAppClient.getState());
        const updatedInput = container.querySelector('#wa-contact-search');
        if (updatedInput) {
          updatedInput.focus();
          updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
        }
      });
    }

    // 4. Contact items selection
    const contactItems = container.querySelectorAll('.wa-contact-item');
    contactItems.forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const contact = contacts.find((c) => c.id === id);
        if (contact) {
          this.selectedContact = contact;
          this.manualRecipientMode = false;
          this.updateStateView(whatsAppClient.getState());
        }
      });
    });

    // 5. Toggle direct number / manual mode
    const btnToggle = container.querySelector('#wa-toggle-manual');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.manualRecipientMode = !this.manualRecipientMode;
        this.updateStateView(whatsAppClient.getState());
      });
    }

    // 6. Clear selected contact
    const btnClearRec = container.querySelector('#wa-btn-clear-recipient');
    if (btnClearRec) {
      btnClearRec.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedContact = null;
        this.updateStateView(whatsAppClient.getState());
      });
    }

    // 7. Send WhatsApp Message
    const btnSend = container.querySelector('#wa-btn-send-now');
    if (btnSend) {
      btnSend.addEventListener('click', async () => {
        let recipient = '';
        if (this.manualRecipientMode) {
          const recInput = container.querySelector('#wa-input-recipient');
          recipient = recInput ? recInput.value.trim() : '';
        } else if (this.selectedContact) {
          recipient = this.selectedContact.id || this.selectedContact.number || '';
        }

        if (!recipient) {
          alert('Please select a contact or enter a recipient phone number.');
          return;
        }

        const textarea = container.querySelector('#wa-textarea-body');
        const message = textarea ? textarea.value.trim() : '';
        if (!message) {
          alert('Please type a message to send.');
          return;
        }

        const feedback = container.querySelector('#wa-send-feedback');

        this.isSending = true;
        btnSend.disabled = true;
        btnSend.textContent = 'Sending...';

        try {
          await whatsAppClient.sendMessage(recipient, message);
          if (textarea) textarea.value = '';
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = 'rgba(0, 230, 118, 0.15)';
            feedback.style.color = '#00e676';
            feedback.style.border = '1px solid rgba(0, 230, 118, 0.3)';
            feedback.innerHTML = `✓ Message sent successfully to ${this.selectedContact ? this.selectedContact.name : recipient}!`;
            setTimeout(() => { feedback.style.display = 'none'; }, 4000);
          }
        } catch (err) {
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = 'rgba(235, 87, 87, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(235, 87, 87, 0.3)';
            feedback.innerHTML = `✕ Delivery Failed: ${err.message || 'Error sending message'}`;
          }
        } finally {
          this.isSending = false;
          btnSend.disabled = false;
          btnSend.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Send WhatsApp Message
          `;
        }
      });
    }
  }
}

