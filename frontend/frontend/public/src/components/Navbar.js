/**
 * MITRA Navbar — Canonical Reusable Navigation Component
 * Shared across all pages: index, login, signup, dashboard, and all product pages.
 *
 * Usage:
 *   <mitra-navbar></mitra-navbar>
 *   <script type="module" src="/src/components/Navbar.js"></script>
 *
 * The component auto-detects the page path depth and sets links accordingly.
 * It reads the current page URL to:
 *  - Mark the active nav link
 *  - Show Login/Sign Up vs. User+Logout based on session in localStorage
 */

class MitraNavbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  // Determine root prefix based on URL depth
  _root() {
    const path = window.location.pathname;
    // If we are inside pages/ subdirectory, use ../
    return path.includes('/pages/') ? '../' : './';
  }

  _isActive(href) {
    const currentPath = window.location.pathname;
    // Match by filename
    return currentPath.endsWith(href.replace(/^[./]+/, '')) ||
           (href.includes('dashboard') && currentPath.endsWith('/dashboard.html')) ||
           (href.includes('index') && (currentPath === '/' || currentPath.endsWith('/index.html') || currentPath.endsWith('/')));
  }

  _getSession() {
    try {
      const user = localStorage.getItem('mitra_user');
      if (user) return JSON.parse(user);
    } catch (e) { /* ignore */ }
    return null;
  }

  render() {
    const root = this._root();
    const session = this._getSession();
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.endsWith('login.html') || currentPath.endsWith('signup.html');

    const links = [
      { label: 'Dashboard', href: `${root}dashboard.html` },
      { label: 'Samachar',  href: `${root}pages/samachar.html` },
      { label: 'UniGuru',   href: `${root}pages/uniguru.html` },
      { label: 'Gurukul',   href: `${root}pages/gurukul.html` },
      { label: 'Samruddhi',href: `${root}pages/samruddhi.html` },
      { label: 'SETU',     href: `${root}pages/setu.html` },
      { label: 'Artha',    href: `${root}pages/artha.html` },
    ];

    const activeLabel = (() => {
      if (currentPath.includes('dashboard')) return 'Dashboard';
      if (currentPath.includes('samachar'))  return 'Samachar';
      if (currentPath.includes('uniguru'))   return 'UniGuru';
      if (currentPath.includes('gurukul'))   return 'Gurukul';
      if (currentPath.includes('samruddhi')) return 'Samruddhi';
      if (currentPath.includes('setu'))      return 'SETU';
      if (currentPath.includes('artha'))     return 'Artha';
      return '';
    })();

    const userName = session ? (session.name || session.email || 'User') : null;

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host { display: block; }
        nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 64px;
          background: #15151D;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          z-index: 10000;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .left {
          display: flex;
          align-items: center;
          gap: 40px;
        }
        .logo {
          font-size: 20px;
          font-weight: 800;
          color: #fff;
          text-decoration: none;
          letter-spacing: -0.5px;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 4px;
          list-style: none;
        }
        .nav-links a {
          position: relative;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 12px;
          border-radius: 6px;
          transition: color 0.2s, background 0.2s;
        }
        .nav-links a:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
        .nav-links a.active {
          color: #fff;
        }
        .nav-links a.active::after {
          content: '';
          position: absolute;
          bottom: -20px;
          left: 0; right: 0;
          height: 2px;
          background: #6C5CE7;
          border-radius: 1px;
        }
        .right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        /* Authenticated: user + logout */
        .user-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          font-family: inherit;
        }
        .user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #6C5CE7;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        .chevron {
          width: 14px;
          height: 14px;
          opacity: 0.6;
        }
        .logout-btn {
          padding: 7px 16px;
          border-radius: 6px;
          border: 1px solid #e53e3e;
          background: transparent;
          color: #e53e3e;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.2s;
          text-decoration: none;
        }
        .logout-btn:hover {
          background: rgba(229,62,62,0.1);
        }
        /* Unauthenticated: login + sign up */
        .login-link {
          color: rgba(255,255,255,0.65);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 7px 14px;
          border-radius: 6px;
          transition: color 0.2s;
        }
        .login-link:hover { color: #fff; }
        .signup-link {
          background: #6C5CE7;
          color: #fff;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 7px 18px;
          border-radius: 6px;
          transition: opacity 0.2s;
        }
        .signup-link:hover { opacity: 0.88; }
        @media (max-width: 768px) {
          nav { padding: 0 20px; }
          .nav-links { display: none; }
        }
      </style>
      <nav>
        <div class="left">
          <a class="logo" href="${root}index.html">MITRA</a>
          <ul class="nav-links">
            ${links.map(l => `
              <li><a href="${l.href}" class="${activeLabel === l.label ? 'active' : ''}">${l.label}</a></li>
            `).join('')}
          </ul>
        </div>
        <div class="right">
          <button id="topbar-mitra-toggle" title="Toggle MITRA Companion" aria-label="Toggle MITRA Companion" style="
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(108, 92, 231, 0.25); border: 1px solid rgba(108, 92, 231, 0.5);
            color: #fff; cursor: pointer; padding: 6px 12px; border-radius: 8px;
            font-size: 13px; font-weight: 600; font-family: inherit;
            transition: background 0.2s, border-color 0.2s;
          ">
            <span style="font-size: 14px; color: #a29bfe;">✦</span>
            <span>MITRA</span>
          </button>
          <button id="topbar-notifications" title="Notifications" aria-label="Notifications" style="
            background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer;
            padding: 8px; border-radius: 8px; position: relative; display: flex; align-items: center; justify-content: center;
            transition: background 0.2s, color 0.2s;
          ">
            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
            </svg>
            <span id="topbar-notif-badge" style="
              display: none; position: absolute; top: 2px; right: 2px;
              background: #ff3b30; color: #fff; border-radius: 10px;
              padding: 1px 5px; font-size: 9px; font-weight: 700; line-height: 1;
            ">0</span>
          </button>
          ${userName ? `
            <span class="user-btn">
              <span class="user-avatar">${userName[0].toUpperCase()}</span>
              ${userName}
              <svg class="chevron" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <a class="logout-btn" href="${root}login.html" id="logoutBtn">Logout</a>
          ` : `
            <a class="login-link" href="${root}login.html">Login</a>
            <a class="signup-link" href="${root}signup.html">Sign Up</a>
          `}
        </div>
      </nav>
    `;

    // Wire MITRA Companion Toggle
    const mitraBtn = this.shadowRoot.getElementById('topbar-mitra-toggle');
    if (mitraBtn) {
      mitraBtn.addEventListener('click', () => {
        if (typeof window.__MITRA_TOGGLE_ORB__ === 'function') {
          window.__MITRA_TOGGLE_ORB__();
        } else {
          window.dispatchEvent(new CustomEvent('mitra:toggle-orb'));
        }
      });
    }

    // Wire Notification Drawer Toggle
    const notifBtn = this.shadowRoot.getElementById('topbar-notifications');
    const badge = this.shadowRoot.getElementById('topbar-notif-badge');

    if (!window.__mitra_notif_drawer) {
      import('./NotificationDrawer.js').then(({ NotificationDrawer }) => {
        window.__mitra_notif_drawer = new NotificationDrawer(window.__mitra_event_bus);
        document.body.appendChild(window.__mitra_notif_drawer.element);

        if (window.__mitra_event_bus) {
          window.__mitra_event_bus.on('notifications.unread_count_updated', (data) => {
            if (badge) {
              if (data.unreadCount > 0) {
                badge.textContent = data.unreadCount > 9 ? '9+' : data.unreadCount;
                badge.style.display = 'inline-block';
              } else {
                badge.style.display = 'none';
              }
            }
          });
        }
      });
    }

    if (notifBtn) {
      notifBtn.addEventListener('click', () => {
        if (window.__mitra_notif_drawer) {
          window.__mitra_notif_drawer.toggle();
        }
      });
    }

    // Wire logout to clear session
    const logoutBtn = this.shadowRoot.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('mitra_user');
        localStorage.removeItem('mitra_token');
        window.location.href = `${root}login.html`;
      });
    }
  }
}

customElements.define('mitra-navbar', MitraNavbar);
