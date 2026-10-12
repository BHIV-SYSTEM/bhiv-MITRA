import { contextStore } from '../services/contextStore.js';
import { getApiBaseUrl } from '../services/controlPlane.js';

/**
 * NotificationDrawer.js — Reusable Right-Side Sliding Notification Drawer Component
 * Matches the reference MITRA topbar notification drawer design & contract.
 */
export class NotificationDrawer {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.element = document.createElement('div');
    this.element.className = 'mitra-notif-drawer-overlay';
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 99999;
      justify-content: flex-end;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    this.isOpen = false;
    this.notifications = [];

    this.element.innerHTML = `
      <div class="mitra-notif-drawer" style="
        width: 380px; max-width: 100vw; height: 100%;
        background: #15151D; border-left: 1px solid rgba(255, 255, 255, 0.1);
        display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,0.5);
        color: #fff;
      ">
        <div style="
          padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex; align-items: center; justify-content: space-between;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px; font-weight: 700;">🔔 Notifications</span>
            <span id="notif-unread-tag" style="background: #6C5CE7; color: #fff; border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 600;">0 New</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-mark-all-read" style="background: none; border: none; color: #6C5CE7; font-size: 12px; font-weight: 600; cursor: pointer;">Mark all as read</button>
            <button id="btn-close-drawer" style="background: none; border: none; color: rgba(255,255,255,0.6); font-size: 18px; cursor: pointer;">✕</button>
          </div>
        </div>

        <div id="notif-drawer-list" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="text-align: center; color: rgba(255,255,255,0.4); margin-top: 40px; font-size: 13px;">No notifications yet</div>
        </div>
      </div>
    `;

    this.element.querySelector('#btn-close-drawer').addEventListener('click', () => this.close());
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });

    this.element.querySelector('#btn-mark-all-read').addEventListener('click', () => this.markAllAsRead());

    if (this.eventBus) {
      this.eventBus.on('notification.received', (data) => {
        this.addNotification({
          id: 'local_' + Date.now(),
          title: data.title || '⏰ Reminder Alert',
          message: data.text || data.message || 'Notification received',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: false
        });
      });
    }
  }

  open() {
    this.isOpen = true;
    this.element.style.display = 'flex';
    this.fetchNotifications();
  }

  close() {
    this.isOpen = false;
    this.element.style.display = 'none';
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  async fetchNotifications() {
    try {
      const userId = contextStore.getUserId();
      if (!userId) {
        this.renderList();
        return;
      }
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const headers = { 'X-API-Key': 'bhiv-enterprise-key' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${getApiBaseUrl()}/api/v1/notifications/${encodeURIComponent(userId)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const apiNotifs = (data.notifications || []).map(n => ({
          id: n.id || ('n_' + Math.random().toString(36).substr(2, 6)),
          title: n.title || 'Notification',
          message: n.message || n.text || '',
          time: n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
          read: !!n.read
        }));

        // Merge local notifications with backend API notifications
        const mergedMap = new Map();
        [...this.notifications, ...apiNotifs].forEach(n => mergedMap.set(n.id || n.message, n));
        this.notifications = Array.from(mergedMap.values());
        this.renderList();
      }
    } catch (e) {
      this.renderList();
    }
  }

  addNotification(notif) {
    this.notifications.unshift(notif);
    if (this.isOpen) this.renderList();
    else this.updateBadgeCount();
  }

  async markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.renderList();

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'bhiv-enterprise-key' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      this.notifications.forEach(n => {
        if (!n.id.startsWith('local_')) {
          fetch(`${getApiBaseUrl()}/api/v1/notifications/${n.id}/read`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ read: true })
          }).catch(() => {});
        }
      });
    } catch (e) {}
  }

  updateBadgeCount() {
    const unread = this.notifications.filter(n => !n.read).length;
    const tag = this.element.querySelector('#notif-unread-tag');
    if (tag) tag.textContent = `${unread} New`;
    if (this.eventBus) {
      this.eventBus.emit('notifications.unread_count_updated', { unreadCount: unread });
    }
  }

  renderList() {
    const list = this.element.querySelector('#notif-drawer-list');
    this.updateBadgeCount();

    if (this.notifications.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.4); margin-top: 40px; font-size: 13px;">No notifications yet</div>`;
      return;
    }

    list.innerHTML = this.notifications.map(n => `
      <div style="
        background: ${n.read ? 'rgba(255,255,255,0.03)' : 'rgba(108, 92, 231, 0.12)'};
        border: 1px solid ${n.read ? 'rgba(255,255,255,0.08)' : 'rgba(108, 92, 231, 0.3)'};
        border-radius: 10px; padding: 12px; transition: all 0.2s;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 12px; font-weight: 700; color: ${n.read ? '#a1a1aa' : '#fff'};">${n.title}</span>
          <span style="font-size: 10px; color: rgba(255,255,255,0.4);">${n.time}</span>
        </div>
        <div style="font-size: 12px; color: ${n.read ? '#71717a' : '#e4e4e7'}; line-height: 1.4;">${n.message}</div>
      </div>
    `).join('');
  }
}
