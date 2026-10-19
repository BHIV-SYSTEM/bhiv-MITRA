import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './components/shell/Sidebar';
import TopBar from './components/shell/TopBar';
import ConversationCenter from './components/shell/ConversationCenter';
import ContextPanel from './components/shell/ContextPanel';
import InputBar from './components/shell/InputBar';
import SettingsModal from './components/shell/SettingsModal';
import AuthModal from './components/shell/AuthModal';
import { FocusTimerModal } from './components/modals/FocusTimerModal';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { MemoryDashboardModal } from './components/modals/MemoryDashboardModal';
import { VoiceTalkModal } from './components/modals/VoiceTalkModal';
import { MemoryMindMapModal } from './components/modals/MemoryMindMapModal';
import { IntegrationsModal } from './components/modals/IntegrationsModal';
import InstallPwaBanner from './components/shell/InstallPwaBanner';
import Toast, { showToast } from './components/shell/Toast';
import CalendarPage from './components/pages/CalendarPage';
import TasksPage from './components/pages/TasksPage';
import RemindersPage from './components/pages/RemindersPage';
import WorkflowsPage from './components/pages/WorkflowsPage';
import KnowledgePage from './components/pages/KnowledgePage';
import AnalyticsPage from './components/pages/AnalyticsPage';
import Login from './components/auth/Login';
import { useCompanionStore, useIsMobile, toggleMitraChatbotWindow } from './store/companion.store';
import { CompanionService } from './services/companion.service';
import { getAuthToken, setAuthToken, getApiBase, getAuthHeaders } from './services/apiConfig';
import { cn } from './lib/utils';
import { MessageSquare, Calendar, CheckSquare, PlayCircle, BarChart2 } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const speakAudioResponse = async (text: string) => {
  if (!text) return;
  try {
    const res = await fetch(`${getApiBase()}/api/tts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, language: 'en' }),
    });
    const data = await res.json();
    if (data.audio_base64) {
      const audio = new Audio(`data:audio/${data.audio_format || 'wav'};base64,${data.audio_base64}`);
      audio.setAttribute('playsinline', 'true');
      await audio.play();
      return;
    }
  } catch (err) {
    console.warn('Backend TTS service unavailable, falling back to Web Speech API:', err);
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
};

/* Mobile bottom nav items — 5 primary destinations: Chat, Analytics, Calendar, Tasks, Workflows */
const mobileNavItems = [
  { id: 'chat',      label: 'Chat',      icon: MessageSquare },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'calendar',  label: 'Calendar',  icon: Calendar },
  { id: 'tasks',     label: 'Tasks',     icon: CheckSquare },
  { id: 'workflows', label: 'Workflows', icon: PlayCircle },
];

/* ── Mobile Bottom Navigation ─────────────────────────── */
const MobileBottomNav: React.FC<{
  active: string;
  onSelect: (id: string) => void;
}> = ({ active, onSelect }) => {
  return (
    <nav className="zone-bottomnav mobile-bottom-nav bottom-nav grid grid-cols-5 items-center w-full bg-surface-raised border-t border-border-subtle py-1 px-0.5 select-none z-40">
      {mobileNavItems.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex flex-col items-center justify-center py-1 px-1 transition-all relative cursor-pointer min-h-[44px] min-w-[44px]",
              isActive ? "text-brand-light font-semibold" : "text-text-muted hover:text-text-secondary"
            )}
            aria-label={item.label}
          >
            <Icon size={19} className={cn("transition-transform mb-0.5", isActive && "scale-110 text-brand-light")} />
            <span className="text-[11px] tracking-tight truncate w-full text-center">{item.label}</span>
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute bottom-0 w-6 h-0.5 bg-brand-light rounded-full shadow-glow"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};

/* ── Main App ─────────────────────────────────────────── */
const App: React.FC = () => {
  const {
    userId, sidebar, contextPanel, isMobile, authModalOpen, setAuthModalOpen,
    setStatus, setSessionId, setUserName, setMemory, setAuth, setAuthStatus,
    addMessage, updateMessage, clearMessages, addNotification, addContextItem,
    chatbotOpen,
  } = useCompanionStore();

  const [activeSection, setActiveSection] = useState(() => {
    return (window.location.pathname === '/login' || window.location.hash === '#login') ? 'login' : 'chat';
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [voiceTalkOpen, setVoiceTalkOpen] = useState(false);
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  useEffect(() => {
    (window as any).__MITRA_SETTINGS__ = () => setSettingsOpen(true);
    (window as any).__MITRA_INTEGRATIONS__ = () => setIntegrationsOpen(true);
  }, []);

  // Listen for real <mitra-companion> Floating Orb state changes (Ashwini's orb)
  useEffect(() => {
    const handleOrbState = (e: any) => {
      const isOpen = Boolean(e?.detail?.open);
      useCompanionStore.getState().setChatbotOpen(isOpen);
    };
    window.addEventListener('mitra:orb-state-changed', handleOrbState);
    return () => window.removeEventListener('mitra:orb-state-changed', handleOrbState);
  }, []);

  // Global Ctrl+K / Cmd+K & Ctrl+M / Cmd+M listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const opened = toggleMitraChatbotWindow();
        showToast('info', 'MITRA Companion', opened ? 'Chatbot opened' : 'Chatbot closed');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync isMobile with window size
  useIsMobile();

  const sidebarCollapsed = sidebar === 'collapsed';
  const contextHidden = contextPanel === 'closed';

  // ── Startup: load session + greeting + memory ───────────
  useEffect(() => {
    document.title = 'MITRA — AI Companion';
    const init = async () => {
      // 1. Check for OAuth callback tokens or error query params in URL
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash);
      const urlToken = urlParams.get('token') || hashParams.get('token') || urlParams.get('access_token') || hashParams.get('access_token');
      const urlError = urlParams.get('error') || hashParams.get('error') || urlParams.get('error_description');
      const urlProvider = urlParams.get('provider') || hashParams.get('provider');
      const urlStatus = urlParams.get('status') || hashParams.get('status');
      const cleanPath = window.location.pathname.startsWith('/auth/callback') ? '/' : window.location.pathname;

      if (urlError) {
        let friendlyMsg = 'Sign-in could not be completed. Please try again.';
        if (urlError === 'authorization_denied') {
          friendlyMsg = 'Access was denied by the provider.';
        } else if (urlError === 'missing_code_or_state') {
          friendlyMsg = 'Sign-in was interrupted. Please try again.';
        } else if (urlError === 'invalid_state') {
          friendlyMsg = 'Session expired during sign-in. Please try again.';
        }
        showToast('error', 'Authentication Failed', friendlyMsg);
        setAuthStatus('AUTH_ERROR');
        window.history.replaceState({}, document.title, cleanPath);
      }

      if (urlToken) {
        setAuthToken(urlToken);
        showToast('success', 'Sign In Successful', 'Welcome to Mitra!');
        window.history.replaceState({}, document.title, cleanPath);
      }

      if (urlStatus === 'success' && urlProvider) {
        showToast('success', 'Connected', `Successfully connected ${urlProvider} account.`);
        window.history.replaceState({}, document.title, cleanPath);
      }

      // 2. Session recovery for logged-in user
      const existingToken = urlToken || getAuthToken();
      if (existingToken) {
        setAuthStatus('LOADING');
        try {
          const res = await CompanionService.getMe(existingToken);
          if (res?.user) {
            setAuth(res.user, existingToken, (res.user as any).is_guest);
          } else {
            setAuthStatus('GUEST');
          }
        } catch {
          setAuthStatus('GUEST');
        }
      } else {
        setAuthStatus('GUEST');
      }

      const activeUserId = useCompanionStore.getState().userId;

      try {
        // Memory
        const { facts } = await CompanionService.getMemory(activeUserId);
        if (facts?.name) setUserName(facts.name);
        setMemory(facts);

        // Seed a couple of context items
        addContextItem({
          id: 'ctx_cal_1', type: 'calendar',
          title: "Today's Calendar", subtitle: 'No events yet',
          timestamp: new Date().toISOString(),
        });
        addContextItem({
          id: 'ctx_task_1', type: 'task',
          title: 'Pending Tasks', subtitle: 'Open task board to see all',
          timestamp: new Date().toISOString(),
        });

        addNotification({
          type: 'success', title: 'Mitra is ready',
          body: 'Your AI companion is active and connected.', read: false,
        });
        showToast('success', 'Mitra Connected', 'All systems operational');
      } catch {
        // API fallback - keep messages clean so Welcome Screen renders
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active request controller ref to support generation cancellation
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  const handleStop = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setStatus('active');

    const targetMsgId = activeMessageIdRef.current;
    if (targetMsgId) {
      const currentMessages = useCompanionStore.getState().messages;
      const targetMsg = currentMessages.find(m => m.id === targetMsgId);
      if (targetMsg) {
        if (!targetMsg.content.trim()) {
          updateMessage(targetMsgId, { content: "Generation stopped." });
        } else if (!targetMsg.content.includes("(Generation stopped)")) {
          updateMessage(targetMsgId, { content: `${targetMsg.content}\n\n*(Generation stopped)*` });
        }
      }
      activeMessageIdRef.current = null;
    }
    showToast('info', 'Generation stopped');
  }, [setStatus, updateMessage]);

  const handleNewChat = useCallback(() => {
    // If an ongoing generation exists, cancel it cleanly before clearing chat
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    activeMessageIdRef.current = null;
    setStatus('active');
    clearMessages();
  }, [clearMessages, setStatus]);

  // ── Send message handler ────────────────────────────────
  const handleSend = useCallback(async (message: string, isVoice = false) => {
    // If on another page, switch to chat first
    setActiveSection('chat');

    // If an ongoing generation exists, cancel it cleanly before starting new one
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    addMessage({ role: 'user', content: message });
    setStatus('thinking');

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    // Create assistant placeholder message for streaming / real-time updates
    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeMessageIdRef.current = assistantMsgId;

    // Add placeholder assistant message
    useCompanionStore.setState(s => ({
      messages: [
        ...s.messages,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
        }
      ]
    }));

    try {
      let fullContent = '';
      try {
        // Attempt SSE streaming first
        fullContent = await CompanionService.chatStream(
          userId,
          message,
          (token: string) => {
            // Guard against stale stream updates if controller was aborted
            if (controller.signal.aborted) return;
            fullContent += token;
            updateMessage(assistantMsgId, { content: fullContent });
          },
          controller.signal,
          'web',
          (event: any) => {
            if (controller.signal.aborted) return;
            if (event.type === 'message_start' && event.session_id) {
              setSessionId(event.session_id);
            } else if (event.type === 'approval_required') {
              updateMessage(assistantMsgId, {
                capabilityResult: {
                  capability: event.capability,
                  intent: event.intent,
                  status: 'pending',
                  summary: event.summary || 'Confirmation required',
                  data: {
                    status: 'confirmation_required',
                    pending_action_id: event.pending_action_id,
                    confirmation: event.confirmation,
                  },
                },
              });
            } else if (event.type === 'capability_result') {
              const capStatus: 'error' | 'success' | 'pending' =
                (event.status === 'error' || event.status === 'pending') ? event.status : 'success';
              updateMessage(assistantMsgId, {
                capabilityResult: {
                  capability: event.capability,
                  intent: event.intent,
                  status: capStatus,
                  summary: event.summary,
                  data: event.data,
                },
              });
              if (event.data) {
                addContextItem({
                  id: `ctx_cap_${Date.now()}`,
                  type: (event.capability === 'calendar' ? 'calendar' :
                         event.capability === 'email'    ? 'email'    :
                         event.capability === 'task'     ? 'task'     : 'note'),
                  title: event.summary,
                  subtitle: event.capability,
                  timestamp: new Date().toISOString(),
                });
                showToast(
                  event.status === 'success' ? 'success' : 'info',
                  event.summary,
                  event.capability
                );
              }
            } else if (event.type === 'message_complete') {
              updateMessage(assistantMsgId, {
                content: event.message || fullContent,
                intent: event.intent,
                capabilityResult: event.capability_result || undefined,
                suggestedActions: event.suggested_actions || [],
              });
            }
          }
        );
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError') {
          throw streamErr;
        }
        // Fallback to standard chat endpoint if streaming encountered a non-abort error
        const resp = await CompanionService.chat(userId, message, 'web', controller.signal);
        if (controller.signal.aborted) return;
        fullContent = resp.message;
        if (resp.session_id) setSessionId(resp.session_id);
        updateMessage(assistantMsgId, {
          content: resp.message,
          intent: resp.intent,
          capabilityResult: resp.capability_result || null,
          suggestedActions: resp.suggested_actions || [],
        });

        // Push capability result to context panel
        if (resp.capability_result?.data) {
          addContextItem({
            id:       `ctx_cap_${Date.now()}`,
            type:     (resp.capability_result.capability === 'calendar' ? 'calendar' :
                       resp.capability_result.capability === 'email'    ? 'email'    :
                       resp.capability_result.capability === 'task'     ? 'task'     : 'note'),
            title:    resp.capability_result.summary,
            subtitle: resp.capability_result.capability,
            timestamp: new Date().toISOString(),
          });
          showToast(
            resp.capability_result.status === 'success' ? 'success' : 'info',
            resp.capability_result.summary,
            resp.capability_result.capability
          );
        }
      }

      if (controller.signal.aborted) return;

      setStatus('active');
      activeAbortControllerRef.current = null;
      activeMessageIdRef.current = null;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Handled cleanly by handleStop
        return;
      }
      setStatus('error');
      updateMessage(assistantMsgId, {
        content: "I ran into a small issue — could you try again? I'm working on it.",
      });
      setTimeout(() => setStatus('active'), 3000);
      activeAbortControllerRef.current = null;
      activeMessageIdRef.current = null;
    }
  }, [userId, addMessage, updateMessage, addContextItem, setStatus, setSessionId, setActiveSection]);

  // Expose handleSend and handleNewChat for suggestion chips and header actions
  useEffect(() => {
    (window as any).__MITRA_SEND__ = handleSend;
    (window as any).__MITRA_NEW_CHAT__ = handleNewChat;
    (window as any).__MITRA_STOP__ = handleStop;
  }, [handleSend, handleNewChat, handleStop]);
  // Expose settings toggle for Sidebar
  useEffect(() => { (window as any).__MITRA_SETTINGS__ = () => setSettingsOpen(true); }, []);
  // Expose focus toggle
  useEffect(() => { (window as any).__MITRA_FOCUS__ = () => setFocusOpen(prev => !prev); }, []);
  // Expose search / command palette toggle
  useEffect(() => { (window as any).__MITRA_SEARCH__ = () => setCmdOpen(true); }, []);
  // Expose memory dashboard toggle
  useEffect(() => { (window as any).__MITRA_MEMORY__ = () => setMemoryOpen(prev => !prev); }, []);
  // Expose full-screen voice talk mode
  useEffect(() => { (window as any).__MITRA_VOICE_TALK__ = () => setVoiceTalkOpen(prev => !prev); }, []);
  // Expose brain mind map visualizer
  useEffect(() => { (window as any).__MITRA_MINDMAP__ = () => setMindMapOpen(prev => !prev); }, []);
  // Expose page navigation for action buttons
  useEffect(() => { (window as any).__MITRA_NAV__ = setActiveSection; }, [setActiveSection]);

  // Navigate to chat with a pre-filled message from other pages
  const handleChatNavigate = useCallback((msg: string) => {
    setActiveSection('chat');
    handleSend(msg);
  }, [handleSend]);

  return (
    <div className={cn(
      'mitra-shell',
      sidebarCollapsed && 'sidebar-collapsed',
      contextHidden && 'context-hidden'
    )}>
      {/* Top Header */}
      <TopBar />

      {/* Left Zone — Sidebar */}
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Center Zone — Main Workspace (Chat or Full Page) */}
      <div className={cn("zone-center flex flex-col flex-1 min-w-0 h-full", activeSection === 'chat' ? 'overflow-hidden' : 'overflow-y-auto pb-4')}>
        {activeSection === 'chat' && <ConversationCenter onNewChat={handleNewChat} />}
        {activeSection === 'analytics' && <AnalyticsPage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'calendar' && <CalendarPage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'tasks' && <TasksPage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'reminders' && <RemindersPage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'workflows' && <WorkflowsPage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'knowledge' && <KnowledgePage onChatNavigate={handleChatNavigate} />}
        {activeSection === 'login' && <Login onToggleForm={() => setActiveSection('chat')} />}
      </div>

      {/* Bottom Chat Bar — grid-area 'input' */}
      {activeSection === 'chat' && <InputBar onSend={handleSend} onStop={handleStop} />}

      {/* Right Zone — Context Panel (grid-area 'context') */}
      <ContextPanel />

      {/* Mobile Bottom Navigation (screens < 1024px) */}
      {isMobile && (
        <MobileBottomNav active={activeSection} onSelect={setActiveSection} />
      )}

      {/* Spotlight Command Palette (Ctrl + K) */}
      <CommandPaletteModal isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Companion Memory Dashboard Modal */}
      <MemoryDashboardModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* Full-Screen Hands-Free Voice Talk Mode */}
      <VoiceTalkModal isOpen={voiceTalkOpen} onClose={() => setVoiceTalkOpen(false)} />

      {/* Interactive Brain Mind Map Visualizer */}
      <MemoryMindMapModal isOpen={mindMapOpen} onClose={() => setMindMapOpen(false)} />

      {/* Focus Session & Soundscape Modal */}
      <FocusTimerModal isOpen={focusOpen} onClose={() => setFocusOpen(false)} />

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Auth Modal */}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Integrations Modal */}
      <IntegrationsModal isOpen={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />

      {/* Native PWA Install Banner */}
      <InstallPwaBanner />

      {/* Global Toast Notifications */}
      <Toast />
    </div>
  );
};

export default App;
