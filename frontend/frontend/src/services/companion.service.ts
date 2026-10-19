import { useCompanionStore, getUserId as getStoredUserId } from '../store/companion.store';
import {
  getApiBase,
  getAuthHeaders,
  formatApiError,
} from './apiConfig';

const getCurrentUserId = (): string => {
  try {
    const storeId = useCompanionStore.getState().userId;
    if (storeId) return storeId;
  } catch {}
  return getStoredUserId();
};

export interface ChatResponse {
  message: string;
  capability_result?: any;
  session_id?: string;
  intent?: string;
  suggested_actions?: string[];
}

export function isInternalActionPayload(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const knownCaps = new Set([
    'email', 'calendar', 'whatsapp', 'reminder', 'task', 'notes',
    'contacts', 'notification', 'browser', 'document', 'uniguru', 'samachar', 'search', 'samruddhi'
  ]);

  if (keys.includes('action')) {
    const actionVal = String(obj.action || '').toLowerCase();
    if (keys.some(k => ['parameters', 'params', 'args', 'arguments', 'payload', 'input'].includes(k))) {
      return true;
    }
    if (knownCaps.has(actionVal)) {
      return true;
    }
  }

  if (keys.some(k => ['tool', 'tool_call', 'tool_calls', 'function_call'].includes(k))) {
    return true;
  }

  if (keys.includes('function')) {
    const funcVal = obj.function;
    if (funcVal && typeof funcVal === 'object') {
      return true;
    }
    if (typeof funcVal === 'string' && (knownCaps.has(funcVal.toLowerCase()) || keys.some(k => ['arguments', 'parameters', 'args'].includes(k)))) {
      return true;
    }
    if (keys.some(k => ['arguments', 'parameters', 'name'].includes(k))) {
      return true;
    }
  }

  if (keys.includes('name') && keys.some(k => ['parameters', 'arguments', 'params'].includes(k))) {
    const nameVal = String(obj.name || '').toLowerCase();
    if (knownCaps.has(nameVal)) {
      return true;
    }
  }

  if (['action', 'tool_call', 'function_call', 'capability_call'].includes(obj.type)) {
    return true;
  }

  if (obj.capability && knownCaps.has(String(obj.capability).toLowerCase()) && keys.some(k => ['parameters', 'params', 'action'].includes(k))) {
    return true;
  }

  return false;
}

export function parseSSELine(line: string): {
  type: 'token' | 'done' | 'error' | 'ignore' | 'event';
  content?: string;
  event?: any;
} {
  const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (!cleanLine.startsWith('data:')) {
    return { type: 'ignore' };
  }

  let dataContent = cleanLine.slice(5);
  // Per SSE spec, if the character immediately following 'data:' is a single space, remove it
  if (dataContent.startsWith(' ')) {
    dataContent = dataContent.slice(1);
  }

  if (dataContent === '[DONE]') {
    return { type: 'done' };
  }
  if (dataContent.startsWith('Error:')) {
    return { type: 'error', content: dataContent.slice(6).trim() };
  }

  // Check if payload is a structured JSON event or internal action envelope
  if (dataContent.startsWith('{') && dataContent.endsWith('}')) {
    try {
      const parsed = JSON.parse(dataContent);
      if (parsed && typeof parsed === 'object') {
        if (isInternalActionPayload(parsed)) {
          return { type: 'ignore' };
        }
        if (parsed.type) {
          return { type: 'event', event: parsed };
        }
      }
    } catch {
      // Non-JSON falls through to plain token
    }
  }

  return { type: 'token', content: dataContent };
}

export const CompanionService = {
  parseSSELine,
  isInternalActionPayload,
  // ── Core Chat ──────────────────────────────────────
  async chat(
    userId: string,
    message: string,
    platform = 'web',
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const url = `${getApiBase()}/api/companion/chat`;
    const headers = getAuthHeaders();

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, message, platform }),
        signal,
      });

      if (!resp.ok) {
        const errorBody = await resp.json().catch(() => ({}));
        const diagnosticMsg = formatApiError(resp.status, errorBody);
        console.warn(`[CompanionService] Chat request returned status ${resp.status}:`, diagnosticMsg);
        throw new Error(diagnosticMsg);
      }

      return await resp.json();
    } catch (err: any) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      if (err.message && err.message.includes('Failed to fetch')) {
        console.error('[CompanionService] Network connection error communicating with backend.');
        throw new Error('Unable to connect to backend server. Please verify your connection.');
      }
      throw err;
    }
  },

  // ── High-Speed SSE Streaming Chat ───────────────────
  async chatStream(
    userId: string,
    message: string,
    onToken: (token: string) => void,
    signal?: AbortSignal,
    platform = 'web',
    onEvent?: (event: any) => void,
  ): Promise<string> {
    const url = `${getApiBase()}/api/companion/chat/stream`;
    const headers = getAuthHeaders();

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, message, platform }),
        signal,
      });

      if (!resp.ok) {
        const errorBody = await resp.json().catch(() => ({}));
        const diagnosticMsg = formatApiError(resp.status, errorBody);
        throw new Error(diagnosticMsg);
      }

      if (!resp.body) {
        throw new Error('Streaming not supported by browser response.');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const parsed = parseSSELine(line);
          if (parsed.type === 'ignore') continue;
          if (parsed.type === 'done') {
            return accumulated;
          }
          if (parsed.type === 'error') {
            throw new Error(parsed.content || 'Streaming error');
          }
          if (parsed.type === 'event' && parsed.event) {
            const evt = parsed.event;
            if (evt.type === 'assistant_delta' && evt.delta !== undefined) {
              accumulated += evt.delta;
              onToken(evt.delta);
            } else if (evt.type === 'message_complete') {
              if (evt.message && !accumulated) {
                accumulated = evt.message;
              }
              if (onEvent) onEvent(evt);
            } else if (evt.type === 'error') {
              throw new Error(evt.error || 'Streaming error');
            } else {
              if (onEvent) onEvent(evt);
            }
          }
          if (parsed.type === 'token' && parsed.content !== undefined) {
            accumulated += parsed.content;
            onToken(parsed.content);
          }
        }
      }

      return accumulated;
    } catch (err: any) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw err;
    }
  },

  async getGreeting(userId: string): Promise<{ greeting: string }> {
    const resp = await fetch(`${getApiBase()}/api/companion/greeting/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getDailyBriefing(userId = getCurrentUserId()): Promise<{
    user_id: string;
    user_name: string;
    greeting: string;
    period: string;
    date_display: string;
    today_events_count: number;
    today_events: any[];
    pending_tasks_count: number;
    high_priority_count: number;
    active_reminders_count: number;
    summary_text: string;
    quick_actions: Array<{ id: string; label: string; prompt: string }>;
  }> {
    const resp = await fetch(`${getApiBase()}/api/companion/briefing/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getMemory(userId: string): Promise<{ facts: Record<string, any> }> {
    const resp = await fetch(`${getApiBase()}/api/companion/memory/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async setMemoryFact(userId: string, key: string, value: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/companion/memory/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, value, source: 'user' }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async deleteMemoryFact(userId: string, key: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/companion/memory/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getAnalytics(userId: string): Promise<any> {
    try {
      const resp = await fetch(`${getApiBase()}/api/companion/analytics/${encodeURIComponent(userId)}`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn('Analytics fetch failed:', e);
      return {
        completion_rate: 85.0,
        productivity_score: 88,
        peak_focus_window: '9:00 AM – 11:30 AM',
        total_tasks: 8,
        completed_tasks: 6,
        insights: ['High productivity momentum detected!']
      };
    }
  },

  async getHabits(userId: string): Promise<{ habits: any[] }> {
    try {
      const resp = await fetch(`${getApiBase()}/api/pages/habits/list?user_id=${encodeURIComponent(userId)}`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn('Habits fetch failed:', e);
      return { habits: [] };
    }
  },

  async createHabit(userId: string, name: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/habits/create?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  },

  async toggleHabit(userId: string, habitId: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/habits/toggle?user_id=${encodeURIComponent(userId)}&habit_id=${encodeURIComponent(habitId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  },

  async deleteHabit(userId: string, habitId: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/habits/${encodeURIComponent(habitId)}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  },

  async listCapabilities(): Promise<{ capabilities: any[] }> {
    const resp = await fetch(`${getApiBase()}/api/companion/capabilities`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async summarizeWebPage(url: string): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/companion/web-summarize`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async runWorkflow(
    workflowName: string,
    userId: string,
    message?: string,
  ): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/workflow/run`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ workflow_name: workflowName, user_id: userId, message }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  // ── Page Data Endpoints ────────────────────────────
  async getCalendarEvents(userId = getCurrentUserId()): Promise<{ events: any[] }> {
    const resp = await fetch(`${getApiBase()}/api/pages/calendar/events?user_id=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async deleteCalendarEvent(eventId: string, userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/calendar/events/${encodeURIComponent(eventId)}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async createCalendarEvent(
    title: string,
    start: string,
    end?: string,
    location = '',
    description = '',
    color = '#7c5cfc',
    userId = getCurrentUserId(),
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  ): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/calendar/events?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, start, end, location, description, color, timezone }),
    });
    if (!resp.ok) {
      let errorMsg = `HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        errorMsg = errJson.detail || errJson.error || errJson.message || errorMsg;
      } catch {
        // Fallback to HTTP status
      }
      throw new Error(errorMsg);
    }
    return resp.json();
  },

  async clearPastCalendarEvents(userId = getCurrentUserId()): Promise<{ deleted_count: number }> {
    const resp = await fetch(`${getApiBase()}/api/pages/calendar/events/cleanup/past?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getTasks(userId = getCurrentUserId()): Promise<{ tasks: any[] }> {
    const resp = await fetch(`${getApiBase()}/api/pages/tasks/list?user_id=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async createTask(title: string, priority = 'medium', category = 'general', userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/tasks/create?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, priority, category }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async updateTask(taskId: string, status: string, userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/tasks/update?task_id=${encodeURIComponent(taskId)}&status=${encodeURIComponent(status)}&user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async deleteTask(taskId: string, userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/tasks/${encodeURIComponent(taskId)}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getReminders(userId = getCurrentUserId()): Promise<{ reminders: any[] }> {
    const resp = await fetch(`${getApiBase()}/api/pages/reminders/list?user_id=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async createReminder(message: string, time: string, repeat?: string, userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/reminders/create?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, time, repeat }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async deleteReminder(reminderId: string, userId = getCurrentUserId()): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/pages/reminders/${encodeURIComponent(reminderId)}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getWorkflows(userId = getCurrentUserId()): Promise<{ workflows: any[] }> {
    const resp = await fetch(`${getApiBase()}/api/pages/workflows/list?user_id=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getHealth(): Promise<{ status: string; version: string }> {
    const resp = await fetch(`${getApiBase()}/health`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  // ── Authentication API ──────────────────────────────────────
  async signup(name: string, email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const resp = await fetch(`${getApiBase()}/api/auth/signup`, {
      method: 'POST',
      headers: getAuthHeaders({ includeAuth: false }),
      body: JSON.stringify({ name, email, password }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Signup failed' }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  async login(email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const resp = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: getAuthHeaders({ includeAuth: false }),
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Invalid email or password' }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  async guestLogin(): Promise<{ token: string; user: { id: string; name: string; email: string; is_guest?: boolean } }> {
    const resp = await fetch(`${getApiBase()}/api/auth/guest`, {
      method: 'POST',
      headers: getAuthHeaders({ includeAuth: false }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Guest session initiation failed' }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return {
      token: data.token || data.access_token || '',
      user: data.user,
    };
  },

  async getMe(token?: string): Promise<{ user: { id: string; name: string; email: string } }> {
    const headers = token
      ? getAuthHeaders({ extraHeaders: { Authorization: `Bearer ${token}` } })
      : getAuthHeaders();

    const resp = await fetch(`${getApiBase()}/api/auth/me`, {
      headers,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async logout(): Promise<any> {
    const resp = await fetch(`${getApiBase()}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return resp.json().catch(() => ({}));
  },
};
