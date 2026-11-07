import { controlPlane, getApiBaseUrl } from '../services/controlPlane.js';

export function applyTheme(themeName, customConfig = null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;

  let bg = 'linear-gradient(160deg, #141418 0%, #1a1a24 100%)';
  let accent = '#6c5ce7';
  let accentGlow = 'rgba(108, 92, 231, 0.5)';
  let text = '#ffffff';
  let textMuted = 'rgba(255, 255, 255, 0.6)';
  let bodyBg = '#0B0B0E';

  // Load custom configuration if saved
  if (!customConfig && themeName === 'Custom') {
    try {
      const savedConfig = localStorage.getItem('mitra_custom_theme_config');
      if (savedConfig) customConfig = JSON.parse(savedConfig);
    } catch (e) {}
  }

  if (themeName === 'Custom' && customConfig) {
    bg = customConfig.background || bg;
    accent = customConfig.accent || accent;
    accentGlow = customConfig.accentGlow || 'rgba(108, 92, 231, 0.4)';
    text = customConfig.textColor || text;
  } else if (themeName === 'Emerald') {
    bg = 'linear-gradient(160deg, #071710 0%, #0d281e 100%)';
    accent = '#00e676';
    accentGlow = 'rgba(0, 230, 118, 0.4)';
    bodyBg = '#06140E';
  } else if (themeName === 'Violet') {
    bg = 'linear-gradient(160deg, #150a22 0%, #26113b 100%)';
    accent = '#e056fd';
    accentGlow = 'rgba(224, 86, 253, 0.4)';
    bodyBg = '#0F0614';
  } else if (themeName === 'Cyberpunk') {
    bg = 'linear-gradient(160deg, #090e17 0%, #131d2e 60%, #1d122b 100%)';
    accent = '#00f2fe';
    accentGlow = 'rgba(0, 242, 254, 0.5)';
    bodyBg = '#090e17';
  } else if (themeName === 'Sunset') {
    bg = 'linear-gradient(160deg, #1e0b14 0%, #3a1324 100%)';
    accent = '#ff7675';
    accentGlow = 'rgba(255, 118, 117, 0.5)';
    bodyBg = '#1e0b14';
  } else if (themeName === 'Ocean') {
    bg = 'linear-gradient(160deg, #071324 0%, #0d2847 100%)';
    accent = '#0984e3';
    accentGlow = 'rgba(9, 132, 227, 0.5)';
    bodyBg = '#071324';
  } else if (themeName === 'Light') {
    bg = 'linear-gradient(160deg, #fbfbfd 0%, #f0f0f5 100%)';
    accent = '#6c5ce7';
    accentGlow = 'rgba(108, 92, 231, 0.3)';
    text = '#18181b';
    textMuted = '#666675';
    bodyBg = '#F4F4F5';
  } else {
    // Midnight (Default)
    bg = 'linear-gradient(160deg, #141418 0%, #1a1a24 100%)';
    accent = '#6c5ce7';
    accentGlow = 'rgba(108, 92, 231, 0.5)';
    bodyBg = '#0B0B0E';
  }

  root.style.setProperty('--mitra-accent', accent);
  root.style.setProperty('--mitra-accent-glow', accentGlow);
  root.style.setProperty('--mitra-bg', bg);
  root.style.setProperty('--mitra-window-bg', bg);
  root.style.setProperty('--mitra-text', text);
  root.style.setProperty('--mitra-text-muted', textMuted);
  if (document.body) document.body.style.background = bodyBg;

  // Persist settings
  try {
    localStorage.setItem('mitra_theme', themeName);
    localStorage.setItem('mitra_chat_bg', bg);
    localStorage.setItem('mitra_accent', accent);
    if (customConfig) {
      localStorage.setItem('mitra_custom_theme_config', JSON.stringify(customConfig));
    }
  } catch (e) {}

  // Apply directly to all floating chatbot windows (DOM & Shadow DOM)
  const applyToWindows = (scope) => {
    if (!scope) return;
    const wins = scope.querySelectorAll ? scope.querySelectorAll('.mitra-window') : [];
    wins.forEach(w => {
      w.style.setProperty('background', bg, 'important');
      w.style.setProperty('--mitra-accent', accent);
      w.style.setProperty('color', text);
    });
  };

  applyToWindows(document);
  if (typeof document !== 'undefined') {
    const companions = document.querySelectorAll('mitra-companion');
    companions.forEach(c => {
      if (c && c.shadowRoot) applyToWindows(c.shadowRoot);
    });
  }

  // Dispatch live notification for any listening components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mitra:background-changed', {
      detail: { theme: themeName, background: bg, accent, text }
    }));
  }
}

// Apply stored theme safely on script load
try {
  if (typeof localStorage !== 'undefined') {
    applyTheme(localStorage.getItem('mitra_theme') || 'Midnight');
  }
} catch (e) {}

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
      z-index: 99999999 !important; pointer-events: auto !important;
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
          
          <!-- WhatsApp Web Automation Quick Launcher Banner -->
          <div style="background:rgba(0,230,118,0.08); border:1px solid rgba(0,230,118,0.25); border-radius:8px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="font-size:11.5px; font-weight:700; color:#00e676; display:flex; align-items:center; gap:5px;">
                <span>⚡</span> WhatsApp Web Automation (Dual Auth)
              </div>
              <div style="font-size:10px; color:rgba(255,255,255,0.7); margin-top:2px;">
                QR Scan & Phone Pairing Code · 15k+ Contact Search · Live Notification Alerts
              </div>
            </div>
            <button id="btn-open-wa-automation" style="background:#00e676; border:none; color:#06140E; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap;">
              Open WhatsApp
            </button>
          </div>

          <!-- Telegram Bot Integration Action Banner -->
          <div style="background:rgba(0,136,204,0.08); border:1px solid rgba(0,136,204,0.25); border-radius:8px; padding:10px 12px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="font-size:11.5px; font-weight:700; color:#29b6f6; display:flex; align-items:center; gap:5px;">
                <span>✈️</span> Telegram AI Bot (@blackhole_mitra_bot)
              </div>
              <div style="font-size:10px; color:rgba(255,255,255,0.7); margin-top:2px;">
                Chat with MITRA AI Assistant directly on Telegram · BotFather API Token Active
              </div>
            </div>
            <a href="https://t.me/blackhole_mitra_bot" target="_blank" rel="noopener noreferrer" style="background:#0088cc; border:none; color:#ffffff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
              Chat on Telegram →
            </a>
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

        <!-- 3. SYSTEM & IN-APP NOTIFICATIONS -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
              <span>🔔</span> System &amp; In-App Notifications
            </div>
            <div id="notif-perm-status" style="font-size:10.5px;">
              <span style="color:rgba(255,255,255,0.5);">Checking...</span>
            </div>
          </div>
          <div style="font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:12px; line-height:1.4;">
            Receive real-time desktop push notifications and live in-chat sound chimes for scheduled reminders, alarms, and WhatsApp messages.
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:11.5px; color:#fff;">Desktop Push Alerts</span>
              <button id="btn-request-notif-perm" style="background:#6c5ce7; border:none; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
                Enable Notifications
              </button>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:11.5px; color:#fff;">Real-time Sound Alerts</span>
              <span style="font-size:11px; color:#00e676; font-weight:600;">● Active</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
              <span style="font-size:11px; color:rgba(255,255,255,0.6);">Right Drawer History</span>
              <button id="btn-open-notif-drawer-settings" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:5px 12px; border-radius:6px; font-size:11px; cursor:pointer;">
                Open Notifications Drawer 🔔
              </button>
            </div>
          </div>
        </div>

        <!-- 4. CHATBOT BACKGROUND & APPEARANCE CUSTOMIZER -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                <span>🎨</span> Chatbot Background &amp; Themes
              </div>
              <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-top:2px;">
                Customize colors, gradients, and custom wallpaper for the floating chatbot window
              </div>
            </div>
            <button id="btn-toggle-custom-bg" style="background:rgba(108,92,231,0.2); border:1px solid #6C5CE7; color:#a29bfe; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
              ✏️ Customize
            </button>
          </div>

          <!-- Preset Themes Grid -->
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:10px;">
            <button class="theme-opt ${activeTheme === 'Midnight' ? 'active' : ''}" data-theme="Midnight" style="background:${activeTheme === 'Midnight' ? '#6C5CE7' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:#141418; border:2px solid #6c5ce7; display:inline-block;"></span>
              <span>Midnight</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Emerald' ? 'active' : ''}" data-theme="Emerald" style="background:${activeTheme === 'Emerald' ? '#00e676' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, #071710, #0d281e); border:2px solid #00e676; display:inline-block;"></span>
              <span>Emerald</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Violet' ? 'active' : ''}" data-theme="Violet" style="background:${activeTheme === 'Violet' ? '#e056fd' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, #150a22, #26113b); border:2px solid #e056fd; display:inline-block;"></span>
              <span>Violet</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Cyberpunk' ? 'active' : ''}" data-theme="Cyberpunk" style="background:${activeTheme === 'Cyberpunk' ? '#00f2fe' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:${activeTheme === 'Cyberpunk' ? '#000' : '#fff'}; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, #090e17, #1d122b); border:2px solid #00f2fe; display:inline-block;"></span>
              <span>Cyberpunk</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Sunset' ? 'active' : ''}" data-theme="Sunset" style="background:${activeTheme === 'Sunset' ? '#ff7675' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, #1e0b14, #3a1324); border:2px solid #ff7675; display:inline-block;"></span>
              <span>Sunset</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Ocean' ? 'active' : ''}" data-theme="Ocean" style="background:${activeTheme === 'Ocean' ? '#0984e3' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, #071324, #0d2847); border:2px solid #0984e3; display:inline-block;"></span>
              <span>Ocean</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Light' ? 'active' : ''}" data-theme="Light" style="background:${activeTheme === 'Light' ? '#f0f0f5' : 'rgba(255,255,255,0.05)'}; border:1px solid rgba(255,255,255,0.12); color:${activeTheme === 'Light' ? '#000' : '#fff'}; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:#ffffff; border:2px solid #6c5ce7; display:inline-block;"></span>
              <span>Light</span>
            </button>
            <button class="theme-opt ${activeTheme === 'Custom' ? 'active' : ''}" data-theme="Custom" id="btn-theme-custom-card" style="background:${activeTheme === 'Custom' ? '#ff007f' : 'rgba(255,255,255,0.05)'}; border:1px dashed rgba(255,255,255,0.3); color:#fff; padding:8px 4px; border-radius:8px; font-size:11px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <span style="width:20px; height:20px; border-radius:50%; background:conic-gradient(red, yellow, lime, aqua, blue, magenta, red); display:inline-block;"></span>
              <span>Custom ✨</span>
            </button>
          </div>

          <!-- User Custom Background Creator Panel -->
          <div id="panel-custom-theme" style="display:${activeTheme === 'Custom' ? 'block' : 'none'}; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px; margin-top:8px;">
            <div style="font-size:11px; font-weight:700; color:#a29bfe; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
              <span>🛠️ CUSTOM BACKGROUND CREATOR</span>
              <span style="font-size:10px; color:rgba(255,255,255,0.4);">Live Chat Window Preview</span>
            </div>

            <!-- Mode Tabs: Solid vs Gradient vs Wallpaper -->
            <div style="display:flex; gap:6px; margin-bottom:10px;">
              <button id="tab-custom-solid" type="button" class="custom-bg-tab active" style="flex:1; background:rgba(108,92,231,0.25); border:1px solid #6C5CE7; color:#fff; padding:5px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Solid Color</button>
              <button id="tab-custom-gradient" type="button" class="custom-bg-tab" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); padding:5px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Gradient</button>
              <button id="tab-custom-wallpaper" type="button" class="custom-bg-tab" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); padding:5px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Wallpaper</button>
            </div>

            <!-- Solid Color Controls -->
            <div id="section-custom-solid" style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px; color:rgba(255,255,255,0.7);">Window Color:</label>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="color" id="input-solid-color" value="#14141c" style="width:34px; height:26px; border:none; border-radius:4px; background:none; cursor:pointer;" />
                  <span id="label-solid-color" style="font-family:monospace; font-size:11px; color:#fff;">#14141c</span>
                </div>
              </div>
            </div>

            <!-- Gradient Controls -->
            <div id="section-custom-gradient" style="display:none; flex-direction:column; gap:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px; color:rgba(255,255,255,0.7);">Color 1 (Start):</label>
                <input type="color" id="input-grad-color1" value="#120c24" style="width:34px; height:26px; border:none; border-radius:4px; background:none; cursor:pointer;" />
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px; color:rgba(255,255,255,0.7);">Color 2 (End):</label>
                <input type="color" id="input-grad-color2" value="#221138" style="width:34px; height:26px; border:none; border-radius:4px; background:none; cursor:pointer;" />
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px; color:rgba(255,255,255,0.7);">Direction:</label>
                <select id="select-grad-angle" style="background:#1e1e28; border:1px solid rgba(255,255,255,0.15); color:#fff; padding:3px 6px; border-radius:4px; font-size:10px;">
                  <option value="135deg">135° Diagonal</option>
                  <option value="180deg">180° Vertical</option>
                  <option value="90deg">90° Horizontal</option>
                </select>
              </div>
            </div>

            <!-- Wallpaper / Image Controls -->
            <div id="section-custom-wallpaper" style="display:none; flex-direction:column; gap:6px;">
              <div style="font-size:11px; color:rgba(255,255,255,0.7);">Upload Custom Background Image:</div>
              <input type="file" id="input-bg-file" accept="image/*" style="font-size:11px; color:rgba(255,255,255,0.6);" />
              <div style="font-size:10px; color:rgba(255,255,255,0.4);">Auto dark tint overlay applied for crystal clear text readability.</div>
              <div id="wallpaper-preview-thumb" style="display:none; width:100%; height:40px; border-radius:6px; background-size:cover; background-position:center; border:1px solid rgba(255,255,255,0.2);"></div>
            </div>

            <!-- Accent Color Picker -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
              <label style="font-size:11px; color:rgba(255,255,255,0.7);">Accent / Button Glow Color:</label>
              <input type="color" id="input-custom-accent" value="#6C5CE7" style="width:34px; height:26px; border:none; border-radius:4px; background:none; cursor:pointer;" />
            </div>

            <!-- Live Chat Preview Box -->
            <div id="custom-live-preview-box" style="margin-top:10px; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:#141418; display:flex; align-items:center; justify-content:space-between;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span id="preview-mini-orb" style="width:12px; height:12px; border-radius:50%; background:#6c5ce7; box-shadow:0 0 8px #6c5ce7;"></span>
                <span style="font-size:11px; font-weight:600; color:#fff;">Floating Window Live Preview</span>
              </div>
              <span id="preview-badge-status" style="font-size:10px; color:#00e676; font-weight:600;">Active</span>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button id="btn-apply-custom-theme" type="button" style="flex:1; background:#6C5CE7; border:none; color:#fff; padding:6px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                ✓ Apply Custom Background
              </button>
              <button id="btn-reset-theme" type="button" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.8); padding:6px 10px; border-radius:6px; font-size:11px; cursor:pointer;">
                ↺ Reset
              </button>
            </div>
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

        <!-- 6. LEGAL & POLICIES -->
        <div>
          <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-bottom:6px;">🛡️ LEGAL &amp; POLICIES</div>
          <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); padding:10px 12px; border-radius:8px; font-size:12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; gap:16px;">
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" style="color:#a29bfe; text-decoration:none; font-weight:600; display:flex; align-items:center; gap:4px;">
                📜 Terms of Service ↗
              </a>
              <span style="color:rgba(255,255,255,0.3);">|</span>
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style="color:#a29bfe; text-decoration:none; font-weight:600; display:flex; align-items:center; gap:4px;">
                🔒 Privacy Policy ↗
              </a>
            </div>
            <span style="font-size:10px; color:rgba(255,255,255,0.4);">Meta Verified</span>
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

    // Close on clicking backdrop outside modal card
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    // Close on Escape key
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.element.style.display !== 'none') {
          this.close();
        }
      });
    }

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

    // ── Chatbot Background & Appearance Logic ──
    const themeOpts = this.element.querySelectorAll('.theme-opt');
    const panelCustom = this.element.querySelector('#panel-custom-theme');
    const btnToggleCustom = this.element.querySelector('#btn-toggle-custom-bg');

    // Customizer input elements
    const tabSolid = this.element.querySelector('#tab-custom-solid');
    const tabGrad = this.element.querySelector('#tab-custom-gradient');
    const tabWall = this.element.querySelector('#tab-custom-wallpaper');
    const secSolid = this.element.querySelector('#section-custom-solid');
    const secGrad = this.element.querySelector('#section-custom-gradient');
    const secWall = this.element.querySelector('#section-custom-wallpaper');

    const inputSolid = this.element.querySelector('#input-solid-color');
    const labelSolid = this.element.querySelector('#label-solid-color');
    const inputGrad1 = this.element.querySelector('#input-grad-color1');
    const inputGrad2 = this.element.querySelector('#input-grad-color2');
    const selectAngle = this.element.querySelector('#select-grad-angle');
    const inputBgFile = this.element.querySelector('#input-bg-file');
    const wallThumb = this.element.querySelector('#wallpaper-preview-thumb');
    const inputAccent = this.element.querySelector('#input-custom-accent');
    const previewBox = this.element.querySelector('#custom-live-preview-box');
    const previewOrb = this.element.querySelector('#preview-mini-orb');
    const btnApplyCustom = this.element.querySelector('#btn-apply-custom-theme');
    const btnReset = this.element.querySelector('#btn-reset-theme');

    let currentCustomMode = 'solid'; // 'solid' | 'gradient' | 'wallpaper'
    let customUploadedBg = null;

    // Load any existing custom config
    try {
      const savedConfig = localStorage.getItem('mitra_custom_theme_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.accent && inputAccent) inputAccent.value = parsed.accent;
        if (parsed.mode === 'gradient' && parsed.grad1 && parsed.grad2) {
          if (inputGrad1) inputGrad1.value = parsed.grad1;
          if (inputGrad2) inputGrad2.value = parsed.grad2;
        } else if (parsed.mode === 'wallpaper' && parsed.imageUrl) {
          customUploadedBg = parsed.imageUrl;
          if (wallThumb) {
            wallThumb.style.display = 'block';
            wallThumb.style.backgroundImage = `url(${customUploadedBg})`;
          }
        } else if (parsed.solidColor && inputSolid) {
          inputSolid.value = parsed.solidColor;
          if (labelSolid) labelSolid.textContent = parsed.solidColor;
        }
      }
    } catch (e) {}

    const updateLivePreview = () => {
      let bgValue = '#14141c';
      if (currentCustomMode === 'solid') {
        bgValue = inputSolid ? inputSolid.value : '#14141c';
        if (labelSolid) labelSolid.textContent = bgValue;
      } else if (currentCustomMode === 'gradient') {
        const c1 = inputGrad1 ? inputGrad1.value : '#120c24';
        const c2 = inputGrad2 ? inputGrad2.value : '#221138';
        const ang = selectAngle ? selectAngle.value : '135deg';
        bgValue = `linear-gradient(${ang}, ${c1}, ${c2})`;
      } else if (currentCustomMode === 'wallpaper' && customUploadedBg) {
        bgValue = `linear-gradient(rgba(18,18,24,0.78), rgba(18,18,24,0.88)), url(${customUploadedBg}) center/cover no-repeat`;
      }
      if (previewBox) previewBox.style.background = bgValue;
      const accColor = inputAccent ? inputAccent.value : '#6C5CE7';
      if (previewOrb) {
        previewOrb.style.background = accColor;
        previewOrb.style.boxShadow = `0 0 8px ${accColor}`;
      }
      return { bgValue, accColor };
    };

    // Mode Tab switching
    const setCustomTab = (mode) => {
      currentCustomMode = mode;
      const tabs = [tabSolid, tabGrad, tabWall];
      const secs = [secSolid, secGrad, secWall];
      tabs.forEach(t => {
        if (t) {
          t.style.background = 'rgba(255,255,255,0.05)';
          t.style.borderColor = 'rgba(255,255,255,0.1)';
          t.style.color = 'rgba(255,255,255,0.7)';
        }
      });
      secs.forEach(s => { if (s) s.style.display = 'none'; });

      if (mode === 'solid') {
        if (tabSolid) {
          tabSolid.style.background = 'rgba(108,92,231,0.25)';
          tabSolid.style.borderColor = '#6C5CE7';
          tabSolid.style.color = '#fff';
        }
        if (secSolid) secSolid.style.display = 'flex';
      } else if (mode === 'gradient') {
        if (tabGrad) {
          tabGrad.style.background = 'rgba(108,92,231,0.25)';
          tabGrad.style.borderColor = '#6C5CE7';
          tabGrad.style.color = '#fff';
        }
        if (secGrad) secGrad.style.display = 'flex';
      } else if (mode === 'wallpaper') {
        if (tabWall) {
          tabWall.style.background = 'rgba(108,92,231,0.25)';
          tabWall.style.borderColor = '#6C5CE7';
          tabWall.style.color = '#fff';
        }
        if (secWall) secWall.style.display = 'flex';
      }
      updateLivePreview();
    };

    if (tabSolid) tabSolid.addEventListener('click', () => setCustomTab('solid'));
    if (tabGrad) tabGrad.addEventListener('click', () => setCustomTab('gradient'));
    if (tabWall) tabWall.addEventListener('click', () => setCustomTab('wallpaper'));

    // Live inputs listeners
    if (inputSolid) inputSolid.addEventListener('input', updateLivePreview);
    if (inputGrad1) inputGrad1.addEventListener('input', updateLivePreview);
    if (inputGrad2) inputGrad2.addEventListener('input', updateLivePreview);
    if (selectAngle) selectAngle.addEventListener('change', updateLivePreview);
    if (inputAccent) inputAccent.addEventListener('input', updateLivePreview);

    // Wallpaper file input
    if (inputBgFile) {
      inputBgFile.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (loadEvt) => {
            customUploadedBg = loadEvt.target.result;
            if (wallThumb) {
              wallThumb.style.display = 'block';
              wallThumb.style.backgroundImage = `url(${customUploadedBg})`;
            }
            updateLivePreview();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Toggle Customizer Panel button
    if (btnToggleCustom) {
      btnToggleCustom.addEventListener('click', () => {
        if (panelCustom) {
          const isOpen = panelCustom.style.display !== 'none';
          panelCustom.style.display = isOpen ? 'none' : 'block';
          btnToggleCustom.textContent = isOpen ? '✏️ Customize' : '✕ Close Creator';
          if (!isOpen) updateLivePreview();
        }
      });
    }

    // Preset cards click handler
    themeOpts.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.currentTarget || e.target.closest('.theme-opt');
        if (!card) return;
        const theme = card.getAttribute('data-theme');

        themeOpts.forEach(b => {
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.borderColor = 'rgba(255,255,255,0.12)';
          b.style.color = '#fff';
        });

        if (theme === 'Custom') {
          card.style.background = '#ff007f';
          if (panelCustom) panelCustom.style.display = 'block';
          if (btnToggleCustom) btnToggleCustom.textContent = '✕ Close Creator';
          updateLivePreview();
        } else {
          card.style.background = '#6C5CE7';
          if (theme === 'Light') card.style.color = '#000';
          localStorage.setItem('mitra_theme', theme);
          applyTheme(theme);
        }
      });
    });

    // Apply Custom Theme button
    if (btnApplyCustom) {
      btnApplyCustom.addEventListener('click', () => {
        const { bgValue, accColor } = updateLivePreview();
        const config = {
          mode: currentCustomMode,
          background: bgValue,
          accent: accColor,
          solidColor: inputSolid?.value,
          grad1: inputGrad1?.value,
          grad2: inputGrad2?.value,
          angle: selectAngle?.value,
          imageUrl: customUploadedBg
        };
        applyTheme('Custom', config);
        themeOpts.forEach(b => {
          if (b.getAttribute('data-theme') === 'Custom') {
            b.style.background = '#ff007f';
          } else {
            b.style.background = 'rgba(255,255,255,0.05)';
          }
        });
        alert('🎉 Custom chatbot background and theme applied successfully!');
      });
    }

    // Reset Theme button
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        try {
          localStorage.removeItem('mitra_custom_theme_config');
          localStorage.setItem('mitra_theme', 'Midnight');
          localStorage.setItem('mitra_chat_bg', 'linear-gradient(160deg, #141418 0%, #1a1a24 100%)');
          localStorage.setItem('mitra_accent', '#6c5ce7');
        } catch (e) {}
        applyTheme('Midnight');
        themeOpts.forEach(b => {
          b.style.background = b.getAttribute('data-theme') === 'Midnight' ? '#6C5CE7' : 'rgba(255,255,255,0.05)';
        });
        if (panelCustom) panelCustom.style.display = 'none';
        if (btnToggleCustom) btnToggleCustom.textContent = '✏️ Customize';
        alert('Theme reset to Midnight default.');
      });
    }

    // ── WhatsApp Web Automation Quick Launcher ──
    const btnOpenWa = this.element.querySelector('#btn-open-wa-automation');
    if (btnOpenWa) {
      btnOpenWa.addEventListener('click', () => {
        this.close();
        if (typeof window !== 'undefined' && typeof window.__mitra_open_whatsapp === 'function') {
          window.__mitra_open_whatsapp();
        } else if (typeof window !== 'undefined' && typeof window.__MITRA_WHATSAPP_WEB__ === 'function') {
          window.__MITRA_WHATSAPP_WEB__();
        }
      });
    }

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

    // ── Notification Permissions & Drawer ──
    const reqNotifBtn = this.element.querySelector('#btn-request-notif-perm');
    if (reqNotifBtn) {
      reqNotifBtn.addEventListener('click', async () => {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          this.refreshNotificationStatus();
          if (perm === 'granted') {
            new Notification('MITRA Companion', { body: 'Notifications are now enabled!' });
          }
        }
      });
    }

    const openDrawerBtn = this.element.querySelector('#btn-open-notif-drawer-settings');
    if (openDrawerBtn) {
      openDrawerBtn.addEventListener('click', () => {
        this.close();
        if (window.__mitra_notif_drawer) {
          window.__mitra_notif_drawer.open();
        } else {
          import('./NotificationDrawer.js?v=v26').then(({ NotificationDrawer }) => {
            window.__mitra_notif_drawer = new NotificationDrawer(window.__mitra_event_bus);
            document.body.appendChild(window.__mitra_notif_drawer.element);
            window.__mitra_notif_drawer.open();
          });
        }
      });
    }
  }

  open() {
    this.element.style.setProperty('display', 'flex', 'important');
    this.element.style.setProperty('visibility', 'visible', 'important');
    this.element.style.setProperty('opacity', '1', 'important');
    this.element.style.setProperty('pointer-events', 'auto', 'important');
    this.element.style.setProperty('z-index', '99999999', 'important');
    try { this.refreshNotificationStatus(); } catch(e){}
    try { this.refreshGoogleStatus(); } catch(e){}
    try { this.refreshWhatsAppStatus(); } catch(e){}
  }

  close() {
    this.element.style.display = 'none';
  }
}

