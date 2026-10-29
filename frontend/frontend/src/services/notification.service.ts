// notification.service.ts — MITRA Frontend Notification Service
// Handles in-app notifications (drawer/toast), Web Push (Service Worker),
// aggregation, and account isolation via JWT user_id.

import { eventBus } from './eventBus';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'alert' | 'reminder' | 'reminder_due' | 'email' | 'whatsapp' | 'task' | 'system' | 'capability';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  timestamp: string;
  read: boolean;
  user_id: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: Record<string, string>;
  p256dh?: string;
  auth?: string;
  created_at: string;
  last_used_at?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const NOTIFICATION_AGGREGATION_WINDOW = 300; // 5 minutes
export const NOTIFICATION_MAX_QUEUE = 1000;

// ── Aggregation ────────────────────────────────────────────────────────────────

interface AggregatedEvent {
  timestamp: string;
  type: string;
  title: string;
  body: string;
}

class NotificationAggregator {
  private windowMs: number;
  private userEvents: Map<string, AggregatedEvent[]>;
  private readonly EVENT_LIMIT = 500;

  constructor(windowSeconds: number = 300) {
    this.windowMs = windowSeconds * 1000;
    this.userEvents = new Map();
  }

  addEvent(userId: string, type: string, title: string, body: string): AggregationResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let events = this.userEvents.get(userId) || [];
    events = events.filter(e => Date.parse(e.timestamp) > cutoff);
    events.push({ timestamp: new Date().toISOString(), type, title, body });

    // Limit memory
    if (events.length > this.EVENT_LIMIT) {
      events = events.slice(-this.EVENT_LIMIT);
    }
    this.userEvents.set(userId, events);

    // Group by type (same type only, per requirements)
    const byType: Record<string, AggregatedEvent[]> = {};
    for (const e of events) {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e);
    }

    const result: AggregationResult = { individual: [], aggregated: [] };
    for (const [type, items] of Object.entries(byType)) {
      if (items.length === 1) {
        result.individual.push([type, items[0].title, items[0].body]);
      } else {
        // Combine into single alert: "title1; title2; ..."
        const combinedBody = items.map(i => `${i.title} — ${i.body}`).join('; ');
        result.aggregated.push([type, `MITRA Alert (${type})`, combinedBody]);
      }
    }

    return result;
  }

  clearEvents(userId: string) {
    this.userEvents.delete(userId);
  }

  getEvents(userId: string): AggregationResult {
    const events = this.userEvents.get(userId) || [];
    return {
      individual: [],
      aggregated: events.map(e => [e.type, e.title, e.body]),
    };
  }
}

interface AggregationResult {
  individual: [string, string, string][];  // [type, title, body]
  aggregated: [string, string, string][]; // [type, title, body]
}

// ── Service ────────────────────────────────────────────────────────────────────

class NotificationService {
  private userId: string = '';
  private isAuthenticated: boolean = false;
  private readonly aggregator: NotificationAggregator;
  private pushSubscription: PushSubscription | null = null;
  private isPushEnabled: boolean = false;
  private isReady: boolean = false;

  constructor() {
    this.aggregator = new NotificationAggregator(NOTIFICATION_AGGREGATION_WINDOW);
  }

  private init() {
    // Check for existing push subscription in localStorage
    const cachedSub = localStorage.getItem('mitra_push_subscription');
    if (cachedSub) {
      try {
        this.pushSubscription = JSON.parse(cachedSub);
        this.isPushEnabled = true;
        console.log('[MITRA Notifications] Push subscription restored from localStorage');
      } catch (e) {
        console.warn('[MITRA Notifications] Failed to parse cached push subscription');
      }
    }

    // Request permission on first user interaction (triggered on bell click)
    if ('Notification' in window && Notification.permission === 'granted') {
      this.isPushEnabled = true;
    }
  }

  // ── Identity ────────────────────────────────────────────────────────────────

  setUserId(userId: string, isAuthenticated: boolean) {
    this.userId = userId;
    this.isAuthenticated = isAuthenticated;
    console.log(`[MITRA Notifications] User set: ${userId} (auth: ${isAuthenticated})`);
  }

  getUserId(): string {
    return this.userId;
  }

  isGuest(): boolean {
    return !this.isAuthenticated;
  }

  // ── Notification aggregation ─────────────────────────────────────────────────

  addEvent(type: string, title: string, body: string): AggregationResult {
    return this.aggregator.addEvent(this.userId, type, title, body);
  }

  getAggregatedEvents(): AggregationResult {
    return this.aggregator.getEvents(this.userId);
  }

  clearAllEvents() {
    this.aggregator.clearEvents(this.userId);
  }

  // ── Push subscription ────────────────────────────────────────────────────────

  async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[MITRA Notifications] Service Worker not supported');
      this.isReady = false;
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[MITRA Notifications] Service Worker registered:', registration.scope);
      this.isReady = true;
    } catch (err) {
      console.warn('[MITRA Notifications] SW registration failed:', err);
      this.isReady = false;
    }
  }

  async requestPushPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('[MITRA Notifications] Notifications not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      this.isPushEnabled = true;
      if (!this.isReady) {
        await this.registerServiceWorker();
      }
      console.log('[MITRA Notifications] Push permission granted');
      return true;
    }
    this.isPushEnabled = false;
    console.log('[MITRA Notifications] Push permission denied');
    return false;
  }

  async subscribePush(): Promise<PushSubscription | null> {
    if (!this.isPushEnabled) {
      console.warn('[MITRA Notifications] Push not enabled');
      return null;
    }

    if (!this.isReady) {
      await this.registerServiceWorker();
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const swSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.getApplicationServerKey(),
      });

      // Convert ServiceWorker PushSubscription to our local PushSubscription type
      const subscription: PushSubscription = {
        endpoint: swSubscription.endpoint,
        keys: (swSubscription as any).keys || {},
        p256dh: (swSubscription as any).keys?.p256dh,
        auth: (swSubscription as any).keys?.auth,
        created_at: new Date().toISOString(),
        last_used_at: undefined,
      };

      // Store subscription
      localStorage.setItem('mitra_push_subscription', JSON.stringify(subscription));
      this.pushSubscription = subscription;
      console.log('[MITRA Notifications] Push subscribed:', subscription.endpoint);

      // Notify backend
      this.sendPushSubscriptionToBackend();

      return subscription;
    } catch (err) {
      console.error('[MITRA Notifications] Push subscription error:', err);
      this.isPushEnabled = false;
      return null;
    }
  }

  private getApplicationServerKey(): string {
    const vapidKey = (process as any).env.REACT_APP_VAPID_PUBLIC_KEY || '';
    if (!vapidKey) {
      console.warn('[MITRA Notifications] No VAPID public key configured');
      return '';
    }
    return vapidKey;
  }

  private sendPushSubscriptionToBackend() {
    if (!this.pushSubscription || !this.userId) return;

    const apiUrl = (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('mitra_auth_token');

    fetch(`${apiUrl}/api/v1/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        endpoint: this.pushSubscription!.endpoint,
        keys: this.pushSubscription!.keys,
        p256dh: this.pushSubscription!.p256dh,
        auth: this.pushSubscription!.auth,
      }),
    })
      .then(res => res.json())
      .then(data => console.log('[MITRA Notifications] Push subscription registered:', data))
      .catch(err => console.error('[MITRA Notifications] Push subscription save error:', err));
  }

  // ── Notification management ──────────────────────────────────────────────────

  async markRead(notificationId: string): Promise<boolean> {
    const apiUrl = (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('mitra_auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers,
      });
      return res.ok;
    } catch (err) {
      console.error('[MITRA Notifications] Mark read error:', err);
      return false;
    }
  }

  async markAllRead(): Promise<boolean> {
    const apiUrl = (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('mitra_auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/notifications/mark-all-read`, {
        method: 'POST',
        headers,
      });
      return res.ok;
    } catch (err) {
      console.error('[MITRA Notifications] Mark all read error:', err);
      return false;
    }
  }

  async deleteNotification(notificationId: string): Promise<boolean> {
    const apiUrl = (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('mitra_auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/notifications/${notificationId}`, {
        method: 'DELETE',
        headers,
      });
      return res.ok;
    } catch (err) {
      console.error('[MITRA Notifications] Delete error:', err);
      return false;
    }
  }

  async fetchNotifications(unreadOnly: boolean = false, limit: number = 50) {
    const apiUrl = (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('mitra_auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/notifications/me?unread_only=${unreadOnly}&limit=${limit}`, {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        return data.notifications || [];
      }
      return [];
    } catch (err) {
      console.error('[MITRA Notifications] Fetch error:', err);
      return [];
    }
  }

  // ── Expose event bus emitter ─────────────────────────────────────────────────

  emitNotificationEvent(notification: any) {
    // Emit to the existing event bus for in-app UI updates
    eventBus.emit('notification.received', {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      read: false,
      timestamp: notification.timestamp,
      user_id: this.userId,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getApiBase(): string {
    return (process as any).env.REACT_APP_API_URL || 'http://localhost:8000';
  }
}

export const notificationService = new NotificationService();
