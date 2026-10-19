import { eventBus } from './eventBus.js';

/**
 * ContextStore — localStorage-backed companion state with v5 session support.
 */
export class ContextStore {
  constructor() {
    this.storageKey = 'mitra_context_store';
    this.state = this.loadState();

    eventBus.on('context.updated', (newState) => {
      this.state = { ...this.state, ...newState };
      this.saveState();
    });
  }

  loadState() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          history: [],
          dockMode: 'floating',
          replays: [],
          avatar: null,
          position: null,
          sessionId: null,
          userId: null,
          windowState: 'minimized',
          ...parsed
        };
      }
    } catch (e) {
      console.warn('[MITRA] Failed to load context from localStorage', e);
    }
    return {
      history: [],
      dockMode: 'floating',
      replays: [],
      avatar: null,
      position: null,
      sessionId: null,
      userId: null,
      windowState: 'minimized',
    };
  }

  saveState() {
    try {
      const stateToSave = { ...this.state };
      if (stateToSave.avatar && stateToSave.avatar.length > 500 * 1024) {
        stateToSave.avatar = 'indexed_db_asset';
      }
      localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
      eventBus.emit('context.saved', { timestamp: new Date().toISOString() });
    } catch (e) {
      console.warn('[MITRA] Failed to save context to localStorage', e);
    }
  }

  // ─── Reset / Clear Methods ──────────────────────────────────────────────────

  clearHistory() {
    this.state.history = [];
    this.saveState();
    eventBus.emit('context.cleared', { type: 'history' });
  }

  resetAll() {
    this.state = {
      history: [],
      dockMode: 'floating',
      replays: [],
      avatar: null,
      position: null,
      sessionId: null,
      userId: null,
    };
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      // Non-fatal
    }
    eventBus.emit('context.cleared', { type: 'all' });
  }

  // ─── v5 Session & User ID ───────────────────────────────────────────────────

  setSessionId(id) {
    this.state.sessionId = id || null;
    this.saveState();
  }

  getSessionId() {
    return this.state.sessionId || null;
  }

  setUserId(id) {
    this.state.userId = id || null;
    this.saveState();
  }

  getUserId() {
    return this.state.userId
      || localStorage.getItem('mitra_user_id')
      || this._parseUserIdFromToken()
      || null;
  }

  _parseUserIdFromToken() {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) return null;
      const payloadB64 = token.split('.')[1];
      if (!payloadB64) return null;
      const payload = JSON.parse(atob(payloadB64));
      return payload.sub || payload.id || payload.user_id || null;
    } catch {
      return null;
    }
  }

  // ─── History ────────────────────────────────────────────────────────────────

  addMessage(role, text, metadata = {}) {
    this.state.history.push({
      role,
      text,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    this.saveState();
  }

  getHistory() {
    return this.state.history || [];
  }

  // ─── Replays ────────────────────────────────────────────────────────────────

  addReplay(replayItem) {
    if (!this.state.replays) this.state.replays = [];
    this.state.replays.push(replayItem);
    this.saveState();
    eventBus.emit('replay.generated', replayItem);
  }

  getReplays() {
    return this.state.replays || [];
  }

  // ─── Dock Mode ──────────────────────────────────────────────────────────────

  setDockMode(mode) {
    if (!mode) return;
    const validMode = (mode === 'left' || mode === 'right' || mode === 'floating') ? mode : 'floating';
    this.state.dockMode = validMode;
    this.saveState();
  }

  getDockMode() {
    return this.state.dockMode || 'floating';
  }

  // ─── Avatar ─────────────────────────────────────────────────────────────────

  setAvatar(avatarDataUrl) {
    this.state.avatar = avatarDataUrl;
    try {
      if (typeof localStorage !== 'undefined') {
        if (avatarDataUrl && avatarDataUrl !== 'default' && avatarDataUrl.length > 20) {
          if (avatarDataUrl.length < 500 * 1024) {
            localStorage.setItem('mitra_avatar_custom', avatarDataUrl);
            localStorage.setItem('mitra_custom_avatar', avatarDataUrl);
            localStorage.setItem('mitra_avatar_data_url', avatarDataUrl);
          } else {
            localStorage.setItem('mitra_companion_asset_indexed', 'true');
          }
        } else {
          localStorage.removeItem('mitra_avatar_data_url');
          localStorage.removeItem('mitra_avatar_custom');
          localStorage.removeItem('mitra_custom_avatar');
          localStorage.removeItem('mitra_companion_asset');
        }
      }
    } catch (e) {
      console.warn('[ContextStore] Non-critical localStorage avatar set skipped:', e);
    }
    this.saveState();
    try {
      eventBus.emit('avatar.changed', { avatar: avatarDataUrl });
    } catch (e) {
      console.error('[ContextStore] Failed to emit avatar.changed:', e);
    }
  }

  getAvatar() {
    return this.state.avatar || (typeof localStorage !== 'undefined' ? (localStorage.getItem('mitra_avatar_custom') || localStorage.getItem('mitra_custom_avatar') || localStorage.getItem('mitra_avatar_data_url')) : null);
  }

  // ─── Window State ────────────────────────────────────────────────────────────

  setWindowState(state) {
    if (!state) return;
    this.state.windowState = state === 'expanded' ? 'expanded' : 'minimized';
    this.saveState();
  }

  getWindowState() {
    return this.state.windowState || 'minimized';
  }

  // ─── Position ───────────────────────────────────────────────────────────────

  setPosition(position) {
    if (!position || position.left == null || position.top == null) return;
    this.state.position = position;
    this.saveState();
    eventBus.emit('position.changed', { position });
  }

  // ─── Host App & Page Context ────────────────────────────────────────────────
  getHostApp() {
    const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    if (pathname.includes('/pages/samachar')) return 'samachar';
    if (pathname.includes('/pages/uniguru')) return 'uniguru';
    if (pathname.includes('/pages/gurukul')) return 'gurukul';
    if (pathname.includes('/pages/samruddhi')) return 'samruddhi';
    if (pathname.includes('/pages/setu')) return 'setu';
    if (pathname.includes('/pages/niyantran')) return 'niyantran';
    if (pathname.includes('/pages/artha')) return 'artha';
    return 'dashboard';
  }

  getCurrentPage() {
    return typeof window !== 'undefined' ? window.location.pathname || 'index.html' : 'index.html';
  }

  getPosition() {
    return this.state.position || null;
  }
}

export const contextStore = new ContextStore();
