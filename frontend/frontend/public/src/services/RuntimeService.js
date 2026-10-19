import { eventBus } from './eventBus.js';
import { contextStore } from './contextStore.js';
import { controlPlane, getApiBaseUrl } from './controlPlane.js';

export class RuntimeService {
  constructor() {
    this.context = contextStore;
    this.status  = 'Disconnected';
    this.latency = '0ms';
  }

  async connectAll() {
    eventBus.emit('health.changed', { status: 'Connecting', latency: 'connecting...' });

    try {
      const startTime = Date.now();
      const res = await fetch(`${getApiBaseUrl()}/health`);
      const duration = Date.now() - startTime;

      if (res.ok) {
        this.status  = 'Healthy';
        this.latency = `${duration}ms`;

        await this._initUserSession();

        eventBus.emit('runtime.connected', {});
        eventBus.emit('health.changed', { status: 'Healthy', latency: this.latency });
        this.startHeartbeat();
        return true;
      }
    } catch (e) {
      this.status = 'Error';
      eventBus.emit('health.changed', { status: 'Error', latency: '--' });
    }
    return false;
  }

  async _initUserSession() {
    try {
      const userId = contextStore.getUserId()
        || (() => {
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            return u.id || u._id || u.userId || null;
          } catch { return null; }
        })();

      if (userId) {
        contextStore.setUserId(userId);
        const session = await controlPlane.initSession(userId);
        if (session && session.session_id) {
          contextStore.setSessionId(session.session_id);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  startHeartbeat() {
    // Track fired reminders to prevent duplicate alerts
    this.firedReminders = this.firedReminders || new Set();

    // Mark existing past reminders as already fired on initial page load
    this.seedExistingReminders();

    setInterval(async () => {
      try {
        const startTime = Date.now();
        const res = await fetch(`${getApiBaseUrl()}/health`);
        if (res.ok) {
          this.latency = `${Date.now() - startTime}ms`;
          if (this.status !== 'Busy') {
            this.status = 'Healthy';
            eventBus.emit('health.changed', { status: this.status, latency: this.latency });
          }
        }

        // Check active backend reminders for due alarm triggers
        this.checkDueReminders();
      } catch (e) {
        this.status = 'Error';
        eventBus.emit('health.changed', { status: 'Error', latency: '--' });
      }
    }, 5000);
  }

  async seedExistingReminders() {
    try {
      const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'bhiv-enterprise-key' };
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const userId = this.context.getUserId() || 'anonymous';
      const res = await fetch(`${getApiBaseUrl()}/api/pages/reminders/list?user_id=${encodeURIComponent(userId)}`, { headers });
      if (!res.ok) return;

      const data = await res.json();
      const reminders = data.reminders || [];
      const nowMs = Date.now();

      // Mark all past reminders existing before current session as already fired
      reminders.forEach(rem => {
        if (!rem.id) return;
        const dueMs = this.normalizeReminderTime(rem.time);
        if (dueMs && dueMs <= nowMs) {
          this.firedReminders.add(rem.id);
        }
      });
    } catch (e) {}
  }

  /**
   * Timezone Normalization Function: Converts ISO, UTC, microsecond timestamps, or HH:MM strings into epoch milliseconds.
   */
  normalizeReminderTime(timeInput) {
    if (!timeInput) return null;
    if (typeof timeInput === 'number') return timeInput;

    let str = String(timeInput).trim();

    // 1. Format: HH:MM or HH:MM:SS
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
      const parts = str.split(':');
      const d = new Date();
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || 0, 10), 0);
      return d.getTime();
    }

    // 2. ISO timestamp without explicit offset or 'Z', e.g. "2026-08-07T12:00:00.123456"
    // Backend returns UTC timestamps; appending 'Z' forces UTC parsing across all browser locales
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str += 'Z';
    }

    const parsedDate = new Date(str);
    const timeMs = parsedDate.getTime();
    return isNaN(timeMs) ? null : timeMs;
  }

  async checkDueReminders() {
    try {
      const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'bhiv-enterprise-key' };
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const userId = this.context.getUserId() || 'anonymous';
      const res = await fetch(`${getApiBaseUrl()}/api/pages/reminders/list?user_id=${encodeURIComponent(userId)}`, { headers });
      if (!res.ok) return;

      const data = await res.json();
      const reminders = data.reminders || [];
      const nowMs = Date.now();

      reminders.forEach(rem => {
        if (!rem.id || this.firedReminders.has(rem.id)) return;

        const reminderDueMs = this.normalizeReminderTime(rem.time);
        if (!reminderDueMs) return;

        // Due condition: reminder due time has arrived (within 2-minute window of NOW)
        const isStatusActive = !rem.status || rem.status === 'active';
        const isTimeDue = (reminderDueMs <= nowMs + 3000) && ((nowMs - reminderDueMs) <= 120000);

        console.log(`[MITRA DEBUG] Reminder ${rem.id} | rawTime: ${rem.time} | parsedMs: ${reminderDueMs} | nowMs: ${nowMs} | diff: ${nowMs - reminderDueMs} | isTimeDue: ${isTimeDue} | isStatusActive: ${isStatusActive}`);

        if (isStatusActive && isTimeDue) {
          this.firedReminders.add(rem.id);

          const reminderMsg = rem.message || 'Time for scheduled reminder!';
          const alertText = `⏰ REMINDER ALERT: ${reminderMsg}`;

          console.log(`[MITRA] Reminder due detected: ${rem.id} ("${reminderMsg}")`);

          // 1. Emit real-time notification event for chat bubble & toast banner
          eventBus.emit('notification.received', {
            role: 'mitra',
            text: alertText,
            intent: 'reminder_alert',
            suggestedActions: ['✨ Mark Done', '✨ Remind again in 5 mins']
          });

          // 2. Trigger SpeechSynthesis voice alert out loud
          controlPlane.speakText(`Reminder Alert: ${reminderMsg}`);

          // 3. Trigger native browser system notification if granted
          controlPlane.triggerBrowserNotification('⏰ MITRA Reminder Alert', reminderMsg);

          // 4. Also push notification to backend notification list if available
          const userId = contextStore.getUserId();
          if (userId) {
            controlPlane.createNotification(userId, '⏰ Reminder Due', reminderMsg);
          }
        }
      });
    } catch (err) {
      // Non-fatal
    }
  }

  async sendMessage(text) {
    this.context.addMessage('user', text);
    eventBus.emit('user.message_sent', { text });
    this.status = 'Busy';
    eventBus.emit('health.changed', { status: 'Busy', latency: this.latency });
    eventBus.emit('runtime.thinking', {});

    try {
      const lowerText = text.toLowerCase().trim();
      // Send normal chat message (let the backend chat endpoint handle NLP for everything, including translation, summarize, and WhatsApp)
      await controlPlane.sendMessage(text);
    } catch (e) {
      // error handled in controlPlane
    } finally {
      this.status = 'Healthy';
      eventBus.emit('health.changed', { status: 'Healthy', latency: this.latency });
      eventBus.emit('runtime.idle', {});
    }
  }


  async sendCapabilityRequest(capabilityName, intentName, params = {}) {
    this.status = 'Busy';
    eventBus.emit('health.changed', { status: 'Busy', latency: this.latency });

    const startTimestamp = new Date().toLocaleTimeString();
    eventBus.emit('capability.requested',  { capability: capabilityName, timestamp: startTimestamp });
    eventBus.emit('runtime.thinking', {});

    const startTime = Date.now();
    eventBus.emit('capability.started', { capability: capabilityName, timestamp: startTimestamp });

    try {
      if (capabilityName === 'health' && !intentName) {
        const res = await fetch(`${getApiBaseUrl()}/health/system`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const durationMs = Date.now() - startTime;

        eventBus.emit('capability.completed', {
          capability: capabilityName,
          duration: `${durationMs}ms`,
          result: 'System health loaded.',
          data: data,
        });
        contextStore.addReplay({
          timestamp: new Date().toLocaleTimeString(),
          capability: capabilityName,
          status: 'SUCCESS',
          duration: `${durationMs}ms`,
        });

      } else if (capabilityName === 'settings') {
        const durationMs = Date.now() - startTime;
        
        eventBus.emit('settings.open_modal', {});

        eventBus.emit('capability.completed', {
          capability: capabilityName,
          duration: `${durationMs}ms`,
          result: 'Settings opened.',
        });
        contextStore.addReplay({
          timestamp: new Date().toLocaleTimeString(),
          capability: capabilityName,
          status: 'SUCCESS',
          duration: `${durationMs}ms`,
        });
        contextStore.addMessage('mitra', `I have opened the Settings panel for you.`);

      } else if (capabilityName === 'replay' && !intentName) {
        const replays = contextStore.getReplays();
        const durationMs = Date.now() - startTime;
        if (replays.length > 0) {
          const summary = replays
            .slice(-5)
            .map(r => `[${r.timestamp}] ${r.capability} — ${r.status} (${r.duration})`)
            .join('\n');
          eventBus.emit('capability.completed', {
            capability: capabilityName,
            duration: `${durationMs}ms`,
            result: 'Local replay history shown.',
          });
          contextStore.addMessage('mitra', `Last ${Math.min(5, replays.length)} capability runs:\n${summary}`);
        } else {
          throw new Error('No capability replay history available yet. Run some capabilities first.');
        }

      } else {
        // Issue OpenAPI-compliant request through controlPlane
        const data = await controlPlane.sendCapability(capabilityName, intentName, params);
        const durationMs = Date.now() - startTime;
        const durationStr = `${(durationMs / 1000).toFixed(1)}s`;
        const endTimestamp = new Date().toLocaleTimeString();

        const resultSummary = (data.result && data.result.summary) || `Capability [${capabilityName.toUpperCase()}] executed successfully.`;
        const traceId = (data.result && data.result.trace_id) || data.trace_id || null;

        // Capabilities that emit their own chat bubbles via notification.received in controlPlane:
        // summarize, analyze, translate — don't add a duplicate generic capability card.
        // reminder, ocr — same reason.
        const selfReportingCapabilities = new Set(['summarize', 'analyze', 'translate', 'ocr']);

        if (!selfReportingCapabilities.has(capabilityName)) {
          eventBus.emit('capability.completed', {
            capability: capabilityName,
            duration: durationStr,
            result: resultSummary,
            data: data.result || {}
          });
        }

        contextStore.addReplay({
          timestamp: endTimestamp,
          capability: capabilityName,
          status: 'SUCCESS',
          duration: durationStr,
          traceId: traceId,
        });

        // For self-reporting capabilities, contextStore message is added via notification.received handler
        if (!selfReportingCapabilities.has(capabilityName)) {
          contextStore.addMessage('mitra', '', { 
            isCapability: true,
            capabilityName: capabilityName,
            result: resultSummary,
            duration: durationStr,
            data: data.result || data.data || data
          });
        }
      }


    } catch (e) {
      if (e.name === 'AbortError' || e.message.includes('timeout')) {
        eventBus.emit('capability.timed_out', { capability: capabilityName, error: e.message });
      } else {
        eventBus.emit('capability.failed', { capability: capabilityName, error: e.message });
      }
      contextStore.addMessage('mitra', '', {
        isCapability: true,
        capabilityName: capabilityName,
        result: `Failed: ${e.message}`,
        duration: '0ms',
        data: {}
      });
    } finally {
      this.status = 'Healthy';
      eventBus.emit('health.changed', { status: 'Healthy', latency: this.latency });
      eventBus.emit('runtime.idle', {});
    }
  }
}

export const runtimeService = new RuntimeService();
