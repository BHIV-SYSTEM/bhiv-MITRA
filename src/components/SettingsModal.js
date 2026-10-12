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

        <!-- 2. APPEARANCE -->
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
  }

  open() {
    this.element.style.display = 'flex';
    this.refreshGoogleStatus();
  }

  close() {
    this.element.style.display = 'none';
  }
}
