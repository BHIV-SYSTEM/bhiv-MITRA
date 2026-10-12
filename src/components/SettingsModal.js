import { controlPlane, getApiBaseUrl } from '../services/controlPlane.js';

export function applyTheme(themeName) {
  const root = document.documentElement;
  if (themeName === 'Emerald') {
    root.style.setProperty('--mitra-accent', '#00e676');
    root.style.setProperty('--mitra-bg', 'rgba(10, 25, 19, 0.92)');
    document.body.style.background = '#06140E';
  } else if (themeName === 'Violet') {
    root.style.setProperty('--mitra-accent', '#e056fd');
    root.style.setProperty('--mitra-bg', 'rgba(20, 10, 26, 0.92)');
    document.body.style.background = '#0F0614';
  } else if (themeName === 'Light') {
    root.style.setProperty('--mitra-accent', '#6c5ce7');
    root.style.setProperty('--mitra-bg', 'rgba(255, 255, 255, 0.95)');
    root.style.setProperty('--mitra-text', '#18181b');
    document.body.style.background = '#F4F4F5';
  } else {
    // Midnight (Default)
    root.style.setProperty('--mitra-accent', '#6c5ce7');
    root.style.setProperty('--mitra-bg', 'rgba(20, 20, 24, 0.85)');
    root.style.setProperty('--mitra-text', '#ffffff');
    document.body.style.background = '#0B0B0E';
  }
}

// Apply stored theme on script load
applyTheme(localStorage.getItem('mitra_theme') || 'Midnight');

export class SettingsModal {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'mitra-settings-modal-overlay';
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      z-index: 99999;
      align-items: center; justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    this.render();
  }

  async refreshGoogleStatus() {
    const statusText = this.element.querySelector('#google-conn-status');
    const emailText = this.element.querySelector('#google-conn-email');
    const connectBtn = this.element.querySelector('#btn-connect-google');
    const disconnectBtn = this.element.querySelector('#btn-disconnect-google');

    try {
      const data = await controlPlane.getConnections();
      const googleConn = data.connections?.find(c => c.provider?.toLowerCase() === 'google');
      if (googleConn && (googleConn.status === 'active' || googleConn.status === 'connected')) {
        if (statusText) statusText.innerHTML = '<span style="color:#00e676; font-weight:600;">● Connected</span>';
        if (emailText) emailText.textContent = googleConn.email || 'Google Account Linked';
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
      } else {
        if (statusText) statusText.innerHTML = '<span style="color:rgba(255,255,255,0.5);">Not Connected</span>';
        if (emailText) emailText.textContent = 'Link Google to read, draft, and send emails';
        if (connectBtn) connectBtn.style.display = 'inline-block';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
      }
    } catch {
      if (statusText) statusText.textContent = 'Status Unavailable';
    }
  }

  async refreshWhatsAppStatus() {
    const badge = this.element.querySelector('#wa-biz-status-badge');
    const discBtn = this.element.querySelector('#wa-btn-disc-biz');
    const phoneInput = this.element.querySelector('#wa-biz-phone-id');
    const wabaInput = this.element.querySelector('#wa-biz-waba-id');

    try {
      const data = await controlPlane.getBusinessWhatsAppStatus();
      if (data && data.status === 'connected') {
        if (badge) badge.innerHTML = '<span style="color:#00e676; font-weight:600;">● Connected</span>';
        if (discBtn) discBtn.style.display = 'inline-block';
        if (phoneInput && !phoneInput.value) phoneInput.value = data.phone_number_id || '';
        if (wabaInput && !wabaInput.value) wabaInput.value = data.waba_id || '';
      } else {
        if (badge) badge.innerHTML = '<span style="color:rgba(255,255,255,0.5);">Not Connected</span>';
        if (discBtn) discBtn.style.display = 'none';
      }
    } catch {
      if (badge) badge.textContent = 'Status Unavailable';
    }
  }

  render() {
    const activeTheme = localStorage.getItem('mitra_theme') || 'Midnight';
    const userName = localStorage.getItem('mitra_user_name') || 'User';
    const apiEndpoint = getApiBaseUrl();

    this.element.innerHTML = `
      <div class="mitra-settings-modal" style="
        width: 480px; max-width: 92vw; max-height: 90vh; overflow-y: auto; background: #15151D;
        border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); color: #fff;
        padding: 24px; display: flex; flex-direction: column; gap: 18px;
        position: relative;
      ">
        <!-- Modal Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px;">
          <div style="font-size:18px; font-weight:700;">⚙️ Companion Settings</div>
          <button id="btn-close-settings" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:20px; cursor:pointer;">✕</button>
        </div>

        <!-- 1. GOOGLE WORKSPACE & EMAIL INTEGRATION -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
              <span>🌐</span> Google Workspace &amp; Gmail
            </div>
            <div id="google-conn-status" style="font-size:11px;">
              <span style="color:rgba(255,255,255,0.5);">Checking...</span>
            </div>
          </div>
          <div id="google-conn-email" style="font-size:12px; color:rgba(255,255,255,0.7); margin-bottom:12px;">
            Link Google to read, draft, and send emails directly from MITRA.
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btn-connect-google" style="background:#4285F4; border:none; color:#fff; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
              Connect Google Account
            </button>
            <button id="btn-disconnect-google" style="display:none; background:rgba(255,69,58,0.15); border:1px solid rgba(255,69,58,0.3); color:#ff453a; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
              Disconnect
            </button>
          </div>
        </div>

        <!-- 2. WHATSAPP INTEGRATION (DUAL-MODE) -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
              <span>💬</span> WhatsApp Integration (Dual-Mode)
            </div>
            <div id="wa-active-mode-badge" style="font-size:10px; background:rgba(37,211,102,0.15); color:#25D366; padding:2px 8px; border-radius:10px; font-weight:600;">
              Dual-Mode Active
            </div>
          </div>
          
          <!-- Mode Tabs -->
          <div style="display:flex; gap:6px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;">
            <button id="tab-btn-wa-personal" style="flex:1; background:rgba(37,211,102,0.2); border:1px solid #25D366; color:#fff; padding:6px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
              👤 Personal (Click-to-Chat)
            </button>
            <button id="tab-btn-wa-business" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); padding:6px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
              💼 Business (Meta Cloud API)
            </button>
          </div>

          <!-- TAB 1: PERSONAL WHATSAPP -->
          <div id="wa-panel-personal" style="display:block;">
            <div style="font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:10px; line-height:1.4;">
              Official <strong>Click to Chat</strong> (<code>wa.me</code>) prepares messages safely without unauthorized third-party scrapers.
            </div>
            <div style="background:rgba(255,217,61,0.06); border:1px solid rgba(255,217,61,0.2); border-radius:8px; padding:8px; font-size:10.5px; color:#ffd93d; margin-bottom:10px;">
              ⚠️ <em>Delivery limitation:</em> User must review and tap Send inside WhatsApp. Opening the chat does not verify delivery.
            </div>

            <!-- Quick Personal Composer -->
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div>
                <label style="font-size:10.5px; color:rgba(255,255,255,0.6); display:block; margin-bottom:2px;">Recipient Phone Number (with Country Code):</label>
                <input type="text" id="wa-input-phone" placeholder="+91 9876543210" style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:6px; font-size:12px;" />
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                  <label style="font-size:10.5px; color:rgba(255,255,255,0.6);">Message Composer:</label>
                  <button id="wa-btn-ai-draft" style="background:rgba(108,92,231,0.25); border:1px solid #6C5CE7; color:#a29bfe; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; cursor:pointer;">
                    ✨ AI Draft
                  </button>
                </div>
                <textarea id="wa-input-message" rows="2" placeholder="Type message or click AI Draft..." style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:6px; font-size:12px; resize:vertical;"></textarea>
              </div>
              <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:2px;">
                <button id="wa-btn-send-personal" style="background:#25D366; border:none; color:#06140E; padding:6px 14px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
                  📲 Open &amp; Send on WhatsApp
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 2: BUSINESS WHATSAPP -->
          <div id="wa-panel-business" style="display:none;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <div style="font-size:11px; color:rgba(255,255,255,0.7);">
                Meta WhatsApp Business Platform
              </div>
              <div id="wa-biz-status-badge" style="font-size:10.5px; font-weight:600; color:rgba(255,255,255,0.5);">
                Checking...
              </div>
            </div>
            <div style="font-size:10.5px; color:rgba(255,255,255,0.6); margin-bottom:10px;">
              Official Meta Cloud API integration for automated backend messaging.
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
              <div>
                <label style="font-size:10px; color:rgba(255,255,255,0.6); display:block; margin-bottom:2px;">Phone Number ID:</label>
                <input type="text" id="wa-biz-phone-id" placeholder="e.g. 104829104928104" style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:6px; font-size:12px;" />
              </div>
              <div>
                <label style="font-size:10px; color:rgba(255,255,255,0.6); display:block; margin-bottom:2px;">WABA ID (WhatsApp Business Account ID):</label>
                <input type="text" id="wa-biz-waba-id" placeholder="e.g. 192837465019283" style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:6px; font-size:12px;" />
              </div>
              <div>
                <label style="font-size:10px; color:rgba(255,255,255,0.6); display:block; margin-bottom:2px;">Meta Cloud API Access Token:</label>
                <input type="password" id="wa-biz-token" placeholder="EAABw..." style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:6px; font-size:12px;" />
              </div>
              <div style="display:flex; gap:8px; margin-top:4px;">
                <button id="wa-btn-save-biz" style="flex:1; background:#00e676; border:none; color:#06140E; padding:7px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                  ✓ Save Business Credentials
                </button>
                <button id="wa-btn-disc-biz" style="display:none; background:rgba(255,69,58,0.15); border:1px solid rgba(255,69,58,0.3); color:#ff453a; padding:7px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. APPEARANCE -->
        <div>
          <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-bottom:10px;">🎨 APPEARANCE</div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            <button class="theme-opt ${activeTheme === 'Midnight' ? 'active' : ''}" data-theme="Midnight" style="background:${activeTheme === 'Midnight' ? '#6C5CE7' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.1); color:#fff; padding:8px; border-radius:8px; font-size:12px; cursor:pointer;">🌙 Midnight</button>
            <button class="theme-opt ${activeTheme === 'Emerald' ? 'active' : ''}" data-theme="Emerald" style="background:${activeTheme === 'Emerald' ? '#00e676' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.1); color:#fff; padding:8px; border-radius:8px; font-size:12px; cursor:pointer;">❇️ Emerald</button>
            <button class="theme-opt ${activeTheme === 'Violet' ? 'active' : ''}" data-theme="Violet" style="background:${activeTheme === 'Violet' ? '#e056fd' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.1); color:#fff; padding:8px; border-radius:8px; font-size:12px; cursor:pointer;">🔮 Violet</button>
            <button class="theme-opt ${activeTheme === 'Light' ? 'active' : ''}" data-theme="Light" style="background:${activeTheme === 'Light' ? '#ffb900' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.1); color:#fff; padding:8px; border-radius:8px; font-size:12px; cursor:pointer;">☀️ Light</button>
            <button class="theme-opt ${activeTheme === 'System' ? 'active' : ''}" data-theme="System" style="background:${activeTheme === 'System' ? '#a29bfe' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.1); color:#fff; padding:8px; border-radius:8px; font-size:12px; cursor:pointer;">💻 System</button>
          </div>
        </div>

        <!-- 3. PROFILE -->
        <div>
          <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-bottom:8px;">👤 USER PROFILE</div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="input-display-name" value="${userName}" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:8px 12px; border-radius:8px; font-size:13px;" />
            <button id="btn-save-profile" style="background:#6C5CE7; border:none; color:#fff; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">✓ Save</button>
          </div>
        </div>

        <!-- 4. CONNECTION -->
        <div>
          <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-bottom:6px;">🗝️ BACKEND API CONNECTION</div>
          <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); padding:10px 12px; border-radius:8px; font-size:12px; display:flex; flex-direction:column; gap:4px;">
            <div style="color:rgba(255,255,255,0.5); font-size:10px;">Connected Endpoint</div>
            <div style="color:#a29bfe; font-family:monospace; font-size:11px;">${apiEndpoint}</div>
            <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
              <span style="width:8px; height:8px; border-radius:50%; background:#00e676; display:inline-block;"></span>
              <span style="color:#00e676; font-size:11px; font-weight:600;">Active Gateway</span>
            </div>
          </div>
        </div>

        <!-- 5. ABOUT -->
        <div>
          <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-bottom:6px;">ℹ️ ABOUT</div>
          <div style="font-size:12px; color:rgba(255,255,255,0.7);">
            <strong>MITRA Universal AI Companion</strong><br/>
            <span style="font-size:11px; color:rgba(255,255,255,0.4);">Full-spectrum tools: Gmail · Google Calendar · WhatsApp · Reminders · OCR...</span>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:14px;">
          <button id="btn-close-settings-footer" style="background:#6C5CE7; border:none; color:#fff; padding:8px 20px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">Done</button>
        </div>
      </div>
    `;

    this.element.querySelector('#btn-close-settings').addEventListener('click', () => this.close());
    this.element.querySelector('#btn-close-settings-footer').addEventListener('click', () => this.close());

    // Connect Google button click
    const connectGoogleBtn = this.element.querySelector('#btn-connect-google');
    if (connectGoogleBtn) {
      connectGoogleBtn.addEventListener('click', async () => {
        try {
          connectGoogleBtn.textContent = 'Opening Google...';
          const res = await controlPlane.startGoogleOAuth('connect');
          if (res.url) {
            window.open(res.url, 'google_oauth', 'width=580,height=680,menubar=no,toolbar=no');
            // Poll for connection
            let attempts = 0;
            const pollInterval = setInterval(async () => {
              attempts++;
              const conns = await controlPlane.getConnections();
              if (conns.connections?.some(c => c.provider?.toLowerCase() === 'google') || attempts > 30) {
                clearInterval(pollInterval);
                this.refreshGoogleStatus();
              }
            }, 3000);
          }
        } catch (err) {
          alert('Could not start Google OAuth: ' + (err.message || 'Please check backend connection'));
          connectGoogleBtn.innerHTML = 'Connect Google Account';
        }
      });
    }

    // Disconnect Google button click
    const disconnectGoogleBtn = this.element.querySelector('#btn-disconnect-google');
    if (disconnectGoogleBtn) {
      disconnectGoogleBtn.addEventListener('click', async () => {
        if (confirm('Disconnect your linked Google Workspace account?')) {
          try {
            await controlPlane.disconnectGoogle();
            this.refreshGoogleStatus();
          } catch (err) {
            alert('Failed to disconnect: ' + err.message);
          }
        }
      });
    }

    this.element.querySelector('#btn-save-profile').addEventListener('click', () => {
      const val = this.element.querySelector('#input-display-name').value.trim();
      if (val) {
        localStorage.setItem('mitra_user_name', val);
        alert(`Display name saved: ${val}`);
      }
    });

    const themeOpts = this.element.querySelectorAll('.theme-opt');
    themeOpts.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const theme = e.target.getAttribute('data-theme');
        localStorage.setItem('mitra_theme', theme);
        applyTheme(theme);
        themeOpts.forEach(b => b.style.background = 'rgba(255,255,255,0.05)');
        e.target.style.background = '#6C5CE7';
      });
    });

    // ── WhatsApp Tab Switching ──
    const tabPersonal = this.element.querySelector('#tab-btn-wa-personal');
    const tabBusiness = this.element.querySelector('#tab-btn-wa-business');
    const panelPersonal = this.element.querySelector('#wa-panel-personal');
    const panelBusiness = this.element.querySelector('#wa-panel-business');

    if (tabPersonal && tabBusiness) {
      tabPersonal.addEventListener('click', () => {
        panelPersonal.style.display = 'block';
        panelBusiness.style.display = 'none';
        tabPersonal.style.background = 'rgba(37,211,102,0.2)';
        tabPersonal.style.borderColor = '#25D366';
        tabPersonal.style.color = '#fff';
        tabBusiness.style.background = 'rgba(255,255,255,0.05)';
        tabBusiness.style.borderColor = 'rgba(255,255,255,0.1)';
        tabBusiness.style.color = 'rgba(255,255,255,0.7)';
      });

      tabBusiness.addEventListener('click', () => {
        panelPersonal.style.display = 'none';
        panelBusiness.style.display = 'block';
        tabBusiness.style.background = 'rgba(37,211,102,0.2)';
        tabBusiness.style.borderColor = '#25D366';
        tabBusiness.style.color = '#fff';
        tabPersonal.style.background = 'rgba(255,255,255,0.05)';
        tabPersonal.style.borderColor = 'rgba(255,255,255,0.1)';
        tabPersonal.style.color = 'rgba(255,255,255,0.7)';
        this.refreshWhatsAppStatus();
      });
    }

    // ── WhatsApp Personal AI Draft ──
    const aiDraftBtn = this.element.querySelector('#wa-btn-ai-draft');
    const waMsgInput = this.element.querySelector('#wa-input-message');
    if (aiDraftBtn && waMsgInput) {
      aiDraftBtn.addEventListener('click', async () => {
        const promptInstruction = prompt('What message would you like AI to draft?', 'I will arrive at 5 PM');
        if (!promptInstruction) return;
        try {
          aiDraftBtn.textContent = '✨ Drafting...';
          const draftRes = await controlPlane.generateAIDraft(promptInstruction);
          if (draftRes && draftRes.draft) {
            waMsgInput.value = draftRes.draft;
          }
        } catch (e) {
          alert('Failed to generate draft: ' + e.message);
        } finally {
          aiDraftBtn.textContent = '✨ AI Draft';
        }
      });
    }

    // ── WhatsApp Personal Send (Click-to-Chat) ──
    const personalSendBtn = this.element.querySelector('#wa-btn-send-personal');
    const waPhoneInput = this.element.querySelector('#wa-input-phone');
    if (personalSendBtn && waPhoneInput && waMsgInput) {
      personalSendBtn.addEventListener('click', async () => {
        const phone = waPhoneInput.value.trim();
        const msg = waMsgInput.value.trim();
        if (!phone) {
          alert('Please enter a recipient phone number with country code (e.g. +91 9876543210).');
          return;
        }
        if (!msg) {
          alert('Please enter a message to send.');
          return;
        }

        try {
          personalSendBtn.textContent = 'Preparing...';
          const prepRes = await controlPlane.preparePersonalWhatsApp(phone, msg);
          if (prepRes && prepRes.wa_url) {
            window.open(prepRes.wa_url, '_blank', 'noopener,noreferrer');
            alert('WhatsApp opened! Please review and click Send inside WhatsApp to dispatch.\n\nNote: As a personal account, MITRA cannot verify message delivery automatically.');
          }
        } catch (err) {
          alert('Validation error: ' + err.message);
        } finally {
          personalSendBtn.innerHTML = '📲 Open &amp; Send on WhatsApp';
        }
      });
    }

    // ── WhatsApp Business Credential Save ──
    const saveBizBtn = this.element.querySelector('#wa-btn-save-biz');
    const bizPhoneInput = this.element.querySelector('#wa-biz-phone-id');
    const bizWabaInput = this.element.querySelector('#wa-biz-waba-id');
    const bizTokenInput = this.element.querySelector('#wa-biz-token');
    if (saveBizBtn && bizPhoneInput && bizWabaInput && bizTokenInput) {
      saveBizBtn.addEventListener('click', async () => {
        const phoneId = bizPhoneInput.value.trim();
        const wabaId = bizWabaInput.value.trim();
        const token = bizTokenInput.value.trim();

        if (!phoneId || !token) {
          alert('Phone Number ID and Meta Access Token are required.');
          return;
        }

        try {
          saveBizBtn.textContent = 'Saving...';
          await controlPlane.connectBusinessWhatsApp(phoneId, wabaId, token);
          alert('Meta WhatsApp Business credentials successfully saved and encrypted!');
          this.refreshWhatsAppStatus();
        } catch (err) {
          alert('Failed to connect WhatsApp Business: ' + err.message);
        } finally {
          saveBizBtn.textContent = '✓ Save Business Credentials';
        }
      });
    }

    // ── WhatsApp Business Disconnect ──
    const discBizBtn = this.element.querySelector('#wa-btn-disc-biz');
    if (discBizBtn) {
      discBizBtn.addEventListener('click', async () => {
        if (confirm('Disconnect Meta WhatsApp Business Platform credentials?')) {
          try {
            await controlPlane.disconnectBusinessWhatsApp();
            alert('WhatsApp Business credentials disconnected.');
            this.refreshWhatsAppStatus();
          } catch (err) {
            alert('Failed to disconnect: ' + err.message);
          }
        }
      });
    }
  }

  open() {
    this.element.style.display = 'flex';
    this.refreshGoogleStatus();
    this.refreshWhatsAppStatus();
  }

  close() {
    this.element.style.display = 'none';
  }
}

