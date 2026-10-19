// store/companion.store.ts — Mitra Zustand global state
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useEffect } from 'react';
import {
  getAuthToken,
  setAuthToken as setCanonicalToken,
  clearAuthToken as clearCanonicalToken,
  getApiBase,
  getApiKey,
} from '../services/apiConfig';

// ── Types ────────────────────────────────────────────────
export type CompanionStatus = 'active' | 'thinking' | 'away' | 'error';
export type MessageRole = 'user' | 'assistant';
export type SidebarState = 'expanded' | 'collapsed';
export type PanelState = 'open' | 'closed';

export interface Message {
  id:               string;
  role:             MessageRole;
  content:          string;
  timestamp:        string;
  intent?:          string;
  capabilityResult?: CapabilityResult | null;
  suggestedActions?: string[];
}

export interface CapabilityResult {
  capability: string;
  intent:     string;
  status:     'success' | 'error' | 'pending';
  summary:    string;
  data?:      Record<string, any>;
}

export interface ContextItem {
  id:       string;
  type:     'calendar' | 'email' | 'task' | 'note' | 'contact' | 'knowledge';
  title:    string;
  subtitle?: string;
  value?:   string;
  badge?:   string;
  timestamp?: string;
}

export interface Notification {
  id:        string;
  type:      'info' | 'success' | 'warning' | 'error';
  title:     string;
  body?:     string;
  read:      boolean;
  timestamp: string;
}

export interface UserMemory {
  name?:        string;
  preferences?: Record<string, any>;
  facts?:       Record<string, any>;
}

export type AuthStateStatus = 'LOADING' | 'GUEST' | 'AUTHENTICATED' | 'AUTH_ERROR';

export interface DraftEditState {
  mode?: 'email_draft_edit';
  draftId: string;
  to: string;
  subject: string;
  body: string;
  accountId?: string;
}

// ── Store Interface ─────────────────────────────────────
interface CompanionStore {
  // Identity
  userId:    string;
  userName:  string;
  userEmail: string;
  authToken: string;
  isAuthenticated: boolean;
  isGuest: boolean;
  authStatus: AuthStateStatus;
  authModalOpen:   boolean;
  apiKey:    string;
  apiBase:   string;

  // Companion status & Avatar & Chatbot
  status:    CompanionStatus;
  sessionId: string | null;
  companionAvatar: string;
  companionName: string;
  setCompanionAvatar: (avatar: string, name?: string) => void;
  chatbotOpen: boolean;
  setChatbotOpen: (open: boolean) => void;
  toggleChatbot: () => void;

  // Conversation
  messages:  Message[];
  isLoading: boolean;

  // Structured Draft Editing
  draftEditState: DraftEditState | null;

  // Layout state
  sidebar:      SidebarState;
  contextPanel: PanelState;

  // Mobile state
  isMobile:         boolean;
  mobileMenuOpen:   boolean;
  mobileContextOpen: boolean;

  // Context items (right panel)
  contextItems: ContextItem[];

  // Notifications
  notifications: Notification[];

  // Memory
  memory: UserMemory;

  // ── Actions ──────────────────────────────────────────
  setStatus:    (s: CompanionStatus) => void;
  setSessionId: (id: string) => void;
  setSidebar:   (s: SidebarState) => void;
  setContextPanel: (s: PanelState) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;

  // Draft Edit action
  setDraftEditState: (draft: DraftEditState | null) => void;

  // Mobile actions
  setIsMobile:          (v: boolean) => void;
  setMobileMenuOpen:    (v: boolean) => void;
  setMobileContextOpen: (v: boolean) => void;
  toggleMobileMenu:     () => void;
  toggleMobileContext:  () => void;

  addMessage:    (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  setContextItems:  (items: ContextItem[]) => void;
  addContextItem:   (item: ContextItem) => void;
  clearContextItems: () => void;

  addNotification:    (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  markAllRead:        () => void;

  setMemory: (m: Partial<UserMemory>) => void;
  setUserName: (name: string) => void;

  setAuth: (user: { id: string; name: string; email: string; is_guest?: boolean }, token: string, isGuest?: boolean) => void;
  setAuthStatus: (status: AuthStateStatus) => void;
  logoutUser: () => void;
  setAuthModalOpen: (open: boolean) => void;
}

export const getUserId = (): string => {
  if (typeof window === 'undefined') return 'user_default';
  let stored = localStorage.getItem('mitra_user_id');
  if (!stored) {
    stored = 'usr_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('mitra_user_id', stored);
  }
  return stored;
};

export function resolveDisplayName(user?: { name?: string | null; email?: string | null }, isGuest?: boolean): string {
  if (isGuest) return 'Guest User';
  if (user?.name && user.name.trim() && !['user', 'user_default', 'anonymous', 'guest'].includes(user.name.trim().toLowerCase())) {
    return user.name.trim();
  }
  if (user?.email && user.email.includes('@')) {
    const prefix = user.email.split('@')[0].trim();
    if (prefix) return prefix;
  }
  return 'Mitra User';
}

// ── Store Implementation ────────────────────────────────
export const useCompanionStore = create<CompanionStore>()(
  devtools(
    (set, get) => {
      const initialToken = getAuthToken() || '';
      return {
        // Defaults
        userId:          localStorage.getItem('mitra_user_id') || getUserId(),
        userName:        localStorage.getItem('mitra_user_name') || 'Guest User',
        userEmail:       localStorage.getItem('mitra_user_email') || '',
        authToken:       initialToken,
        isAuthenticated: Boolean(initialToken),
        isGuest:         false,
        authStatus:      initialToken ? 'LOADING' : 'GUEST',
        authModalOpen:   false,
        apiKey:          getApiKey(),
        apiBase:         getApiBase(),

        status:    'active',
        sessionId: null,
        companionAvatar: (typeof localStorage !== 'undefined' && (localStorage.getItem('mitra_companion_asset') || localStorage.getItem('mitra_avatar_custom') || localStorage.getItem('mitra_custom_avatar') || localStorage.getItem('mitra_avatar_data_url') || localStorage.getItem('mitra_active_avatar'))) || '/assets/mitra_avatar_default.png',
        companionName: (typeof localStorage !== 'undefined' && localStorage.getItem('mitra_companion_name') && localStorage.getItem('mitra_companion_name') !== 'Mitra Robot') ? (localStorage.getItem('mitra_companion_name') as string) : 'Mitra Companion',
        chatbotOpen: false,

        messages:  [],
        isLoading: false,

        draftEditState: null,

        sidebar:      'expanded',
        contextPanel: 'closed',

        // Mobile defaults
        isMobile:         false,
        mobileMenuOpen:   false,
        mobileContextOpen: false,

        contextItems: [],
        notifications: [],
        memory: {},

        // ── Status & Companion Avatar & Chatbot ──────────────────
        setStatus:    (status)    => set({ status }),
        setSessionId: (sessionId) => set({ sessionId }),
        setChatbotOpen: (chatbotOpen) => set({ chatbotOpen }),
        toggleChatbot: () => set((state) => ({ chatbotOpen: !state.chatbotOpen })),
        setCompanionAvatar: (companionAvatar, companionName = 'Mitra Companion') => {
          const state = get();
          if (state.companionAvatar === companionAvatar && state.companionName === companionName) {
            return; // Prevent recursive event loops
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('mitra_companion_asset', companionAvatar);
            localStorage.setItem('mitra_companion_name', companionName);
            localStorage.setItem('mitra_active_avatar', companionAvatar);
            localStorage.setItem('mitra_avatar_custom', companionAvatar);
            localStorage.setItem('mitra_custom_avatar', companionAvatar);
            localStorage.setItem('mitra_avatar_data_url', companionAvatar);
          }
          set({ companionAvatar, companionName });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mitra:companion-changed', {
              detail: { companionAvatar, companionName }
            }));
            window.dispatchEvent(new CustomEvent('mitra:avatar-changed', {
              detail: { avatar: companionAvatar }
            }));
            if ((window as any).__mitra_event_bus) {
              (window as any).__mitra_event_bus.emit('avatar.changed', { avatar: companionAvatar });
            }
          }
        },

        // ── Draft Edit ─────────────────────────────────
        setDraftEditState: (draftEditState) => set({ draftEditState }),

        // ── Layout ─────────────────────────────────────
        setSidebar:      (sidebar)      => set({ sidebar }),
        setContextPanel: (contextPanel) => set({ contextPanel }),
        toggleSidebar:   () => set(s => ({
          sidebar: s.sidebar === 'expanded' ? 'collapsed' : 'expanded'
        })),
        toggleContextPanel: () => {
          const { isMobile } = get();
          if (isMobile) {
            set(s => ({ mobileContextOpen: !s.mobileContextOpen }));
          } else {
            set(s => ({ contextPanel: s.contextPanel === 'open' ? 'closed' : 'open' }));
          }
        },

        // ── Mobile ─────────────────────────────────────
        setIsMobile:          (isMobile)         => set({ isMobile }),
        setMobileMenuOpen:    (mobileMenuOpen)   => set({ mobileMenuOpen }),
        setMobileContextOpen: (mobileContextOpen) => set({ mobileContextOpen }),
        toggleMobileMenu:     () => set(s => ({ mobileMenuOpen: !s.mobileMenuOpen })),
        toggleMobileContext:  () => set(s => ({ mobileContextOpen: !s.mobileContextOpen })),

        // ── Messages ────────────────────────────────
        addMessage: (msg) => set(s => ({
          messages: [
            ...s.messages,
            {
              ...msg,
              id:        `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
            },
          ],
        })),
        updateMessage: (id, updates) => set(s => ({
          messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m),
        })),
        clearMessages: () => set({ messages: [] }),

        // ── Context Panel ───────────────────────────────
        setContextItems:   (contextItems)  => set({ contextItems }),
        addContextItem:    (item)          => set(s => ({ contextItems: [...s.contextItems, item] })),
        clearContextItems: ()              => set({ contextItems: [] }),

        // ── Notifications ───────────────────────────────
        addNotification: (n) => set(s => ({
          notifications: [
            {
              ...n,
              id:        `notif_${Date.now()}`,
              timestamp: new Date().toISOString(),
            },
            ...s.notifications,
          ],
        })),
        markAllRead: () => set(s => ({
          notifications: s.notifications.map(n => ({ ...n, read: true })),
        })),

        // ── Memory ──────────────────────────────────────
        setMemory:   (m)    => set(s => ({ memory: { ...s.memory, ...m } })),
        setUserName: (name) => {
          if (name) localStorage.setItem('mitra_user_name', name);
          set({ userName: name });
        },

        // ── Authentication Actions ───────────────────────
        setAuthModalOpen: (open) => set({ authModalOpen: open }),

        setAuth: (user, token, isGuestParam?: boolean) => {
          const isGuest = isGuestParam !== undefined ? isGuestParam : Boolean((user as any).is_guest);
          const displayName = resolveDisplayName(user, isGuest);
          if (user.id) localStorage.setItem('mitra_user_id', user.id);
          localStorage.setItem('mitra_user_name', displayName);
          if (user.email) localStorage.setItem('mitra_user_email', user.email);
          if (token) setCanonicalToken(token);
          set({
            userId:          user.id || getUserId(),
            userName:        displayName,
            userEmail:       user.email || '',
            authToken:       token,
            isAuthenticated: Boolean(token),
            isGuest:         isGuest,
            authStatus:      isGuest ? 'GUEST' : 'AUTHENTICATED',
            authModalOpen:   false,
          });
        },

        setAuthStatus: (authStatus) => set({ authStatus }),

        logoutUser: () => {
          clearCanonicalToken();
          localStorage.removeItem('mitra_user_email');
          localStorage.removeItem('mitra_user_name');
          localStorage.removeItem('mitra_user_id');
          const newId = getUserId();
          set({
            userId:          newId,
            userName:        'Guest User',
            userEmail:       '',
            authToken:       '',
            isAuthenticated: false,
            isGuest:         true,
            authStatus:      'GUEST',
            messages:        [],
          });
        },
      };
    },
    { name: 'MitraCompanion' }
  )
);

// ── Custom hook: sync isMobile with window resize (< 1024px) ──
export function useIsMobile() {
  const setIsMobile = useCompanionStore(s => s.setIsMobile);
  const setSidebar = useCompanionStore(s => s.setSidebar);
  const setContextPanel = useCompanionStore(s => s.setContextPanel);
  const isMobile = useCompanionStore(s => s.isMobile);

  useEffect(() => {
    const mobileMql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 1023px)') : null;

    const handleResize = () => {
      const mobile = mobileMql ? mobileMql.matches : false;
      setIsMobile(mobile);

      if (mobile) {
        setSidebar('collapsed');
        setContextPanel('closed');
      }
    };

    handleResize();

    if (mobileMql?.addEventListener) {
      mobileMql.addEventListener('change', handleResize);
    }
    return () => {
      if (mobileMql?.removeEventListener) {
        mobileMql.removeEventListener('change', handleResize);
      }
    };
  }, [setIsMobile, setSidebar, setContextPanel]);

  return isMobile;
}

// ── Universal Chatbot Window Toggle Helper ──
export function toggleMitraChatbotWindow(): boolean {
  try {
    const companion = document.querySelector('mitra-companion') as HTMLElement;
    const shadow = companion?.shadowRoot;
    const shell = shadow?.querySelector('#mitra-shell') as HTMLElement;
    const win = shadow?.querySelector('.mitra-window') as HTMLElement;

    if (!companion || !shadow || !win) {
      console.warn('[MITRA] Companion web component or window not ready yet');
      if (typeof (window as any).__MITRA_TOGGLE_ORB__ === 'function') {
        try {
          (window as any).__MITRA_TOGGLE_ORB__();
          return true;
        } catch (e) {}
      }
      return false;
    }

    const isCurrentlyOpen =
      win.classList.contains('expanded') ||
      win.classList.contains('active') ||
      win.style.display === 'flex' ||
      useCompanionStore.getState().chatbotOpen;

    if (isCurrentlyOpen) {
      win.classList.remove('expanded', 'active', 'open');
      win.style.setProperty('display', 'none', 'important');
      win.style.setProperty('visibility', 'hidden', 'important');
      win.style.setProperty('opacity', '0', 'important');
      win.style.setProperty('pointer-events', 'none', 'important');

      if (companion) {
        companion.style.setProperty('pointer-events', 'none', 'important');
      }
      useCompanionStore.getState().setChatbotOpen(false);
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: false } }));
      return false;
    } else {
      if (companion) {
        companion.style.setProperty('display', 'block', 'important');
        companion.style.setProperty('position', 'fixed', 'important');
        companion.style.setProperty('inset', '0', 'important');
        companion.style.setProperty('pointer-events', 'none', 'important');
        companion.style.setProperty('z-index', '999999', 'important');
      }
      if (shell) {
        shell.style.setProperty('display', 'flex', 'important');
        shell.style.setProperty('flex-direction', 'column', 'important');
        shell.style.setProperty('position', 'fixed', 'important');
        shell.style.setProperty('bottom', '24px', 'important');
        shell.style.setProperty('right', '24px', 'important');
        shell.style.setProperty('top', 'auto', 'important');
        shell.style.setProperty('left', 'auto', 'important');
        shell.style.setProperty('pointer-events', 'auto', 'important');
        shell.style.setProperty('z-index', '999999', 'important');
        shell.style.removeProperty('inset');
      }

      win.classList.add('expanded', 'active', 'open');
      win.style.setProperty('display', 'flex', 'important');
      win.style.setProperty('visibility', 'visible', 'important');
      win.style.setProperty('opacity', '1', 'important');
      win.style.setProperty('pointer-events', 'auto', 'important');
      win.style.setProperty('width', '400px', 'important');
      win.style.setProperty('height', '650px', 'important');
      win.style.setProperty('max-height', 'calc(100vh - 120px)', 'important');
      win.style.setProperty('transform', 'translateY(0) scale(1)', 'important');

      useCompanionStore.getState().setChatbotOpen(true);
      window.dispatchEvent(new CustomEvent('mitra:orb-state-changed', { detail: { open: true } }));
      return true;
    }
  } catch (err) {
    console.error('[MITRA] toggleMitraChatbotWindow error:', err);
    return false;
  }
}

