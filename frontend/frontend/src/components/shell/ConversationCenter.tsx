import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Calendar, ArrowRight, UserPlus,
  ChevronRight, Compass, CheckSquare, Bell,
  CheckCircle2, AlertTriangle, Circle, Ban, RotateCcw,
  X, Loader2, LayoutGrid, Maximize2, BarChart2, PlayCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore, toggleMitraChatbotWindow } from '../../store/companion.store';
import { showToast } from './Toast';
import { CompanionService } from '../../services/companion.service';
import { authApi } from '../../services/authApi';
import { getApiBase, getAuthHeaders } from '../../services/apiConfig';
import ConversationCard from '../cards/ConversationCard';
import { DailyBriefingCard } from '../cards/DailyBriefingCard';
import { MessageSquare } from 'lucide-react';

const ThinkingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    className="flex items-center gap-3 py-2"
  >
    <div className="w-7 h-7 rounded-full bg-brand-muted border border-brand/30 flex items-center justify-center text-xs font-semibold text-brand-light flex-shrink-0">
      <Zap size={13} className="text-brand-light animate-pulse" />
    </div>
    <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-elevated border border-border-subtle">
      <span className="inline-flex items-center gap-1">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </div>
  </motion.div>
);

const CompanionHomeView: React.FC<{
  onAction: (prompt: string) => void;
  onNavigate: (section: string) => void;
}> = ({ onAction, onNavigate }) => {
  const { userName, userEmail, isGuest, authStatus, setAuthModalOpen, userId, companionAvatar, companionName } = useCompanionStore();
  const userFirstName = isGuest
    ? 'Guest User'
    : (userName ? userName.trim().split(' ')[0] : (userEmail ? userEmail.split('@')[0] : 'Mitra User'));

  // Guest conversion banner dismissal state (persisted per session)
  const [guestDismissed, setGuestDismissed] = useState(() => {
    return sessionStorage.getItem('mitra_guest_conversion_dismissed') === 'true';
  });

  // Briefing and status summary data
  const [briefing, setBriefing] = useState<any>(null);
  const [calendarConnected, setCalendarConnected] = useState<string | null>(null);

  // Fetch live briefing data and calendar connection status
  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      try {
        const [briefingData, connData] = await Promise.all([
          CompanionService.getDailyBriefing(userId).catch(() => null),
          authApi.getConnections().catch(() => ({ connections: [] })),
        ]);

        if (!isMounted) return;

        if (briefingData) setBriefing(briefingData);

        const g = connData?.connections?.find((c: any) => c.provider.toLowerCase() === 'google' && (c.status === 'active' || c.status === 'connected'));
        const m = connData?.connections?.find((c: any) => c.provider.toLowerCase() === 'microsoft' && (c.status === 'active' || c.status === 'connected'));

        const hasGCalScope = Boolean(g?.scopes?.some((s: string) => s.toLowerCase().includes('calendar')));

        if (g && hasGCalScope) {
          setCalendarConnected('Google Calendar connected');
        } else if (g && !hasGCalScope) {
          setCalendarConnected('Needs authorization');
        } else if (m) {
          setCalendarConnected('Outlook Calendar connected');
        } else {
          setCalendarConnected('No calendar connected');
        }
      } catch {
        if (isMounted) setCalendarConnected('No calendar connected');
      }
    };

    loadStatus();
    return () => { isMounted = false; };
  }, [userId]);

  // Dynamic time-of-day greeting
  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  };

  const currentDateDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const dismissGuestBanner = () => {
    setGuestDismissed(true);
    sessionStorage.setItem('mitra_guest_conversion_dismissed', 'true');
  };

  const getCalendarStatusInfo = () => {
    if (!calendarConnected || calendarConnected === 'No calendar connected') {
      return {
        label: 'Not connected',
        icon: Circle,
        classes: 'text-text-muted bg-surface-overlay/80 border-border-subtle hover:border-brand/40',
      };
    }
    if (calendarConnected.includes('connected')) {
      return {
        label: calendarConnected.includes('Google') ? 'Google Calendar' : 'Outlook Calendar',
        icon: CheckCircle2,
        classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15',
      };
    }
    if (calendarConnected.includes('Needs') || calendarConnected.includes('authorization')) {
      return {
        label: 'Needs authorization',
        icon: AlertTriangle,
        classes: 'text-amber-400 bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/15',
      };
    }
    return {
      label: 'Sync unavailable',
      icon: Ban,
      classes: 'text-text-muted bg-surface-overlay/80 border-border-subtle',
    };
  };

  const calInfo = getCalendarStatusInfo();
  const CalIcon = calInfo.icon;

  // Rich Quick Action items as specified in user requirements
  const quickActionsList = [
    {
      id: 'briefing_q',
      label: 'Morning Briefing',
      desc: 'Summary of schedule & tasks',
      icon: Zap,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      type: 'prompt',
      value: 'Run my morning briefing',
    },
    {
      id: 'plan',
      label: 'Plan My Day',
      desc: 'Prioritize tasks & routines',
      icon: Compass,
      color: 'text-brand-light bg-brand/10 border-brand/20',
      type: 'prompt',
      value: 'Plan my day',
    },
    {
      id: 'open_cal',
      label: 'Calendar Schedule',
      desc: 'Upcoming events & meetings',
      icon: Calendar,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      type: 'nav',
      value: 'calendar',
    },
    {
      id: 'tasks_q',
      label: 'Tasks & To-Dos',
      desc: 'Open pending priority board',
      icon: CheckSquare,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      type: 'nav',
      value: 'tasks',
    },
    {
      id: 'remind_q',
      label: 'Create Reminder',
      desc: 'Set timed companion alert',
      icon: Bell,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      type: 'prompt',
      value: 'Create a reminder',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-4 sm:gap-5 py-3 sm:py-5">
      {/* ── 1. Compact MITRA Companion Hero Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-surface-elevated/90 border border-border-subtle shadow-sm"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={() => {
              const opened = toggleMitraChatbotWindow();
              showToast('info', 'MITRA Companion', opened ? 'Chatbot opened' : 'Chatbot closed');
            }}
            className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand-light flex-shrink-0 shadow-xs overflow-hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            title="Open MITRA Companion Chatbot"
          >
            {companionAvatar ? (
              <img
                src={companionAvatar}
                alt={companionName || 'Mitra Companion'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Zap size={18} className="text-brand-light" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-bold uppercase tracking-wider text-brand-light">Personal AI Companion</span>
              <span className="w-1.5 h-1.5 rounded-full bg-state-success" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-text-primary tracking-tight truncate mt-0.5">
              {authStatus === 'LOADING' ? (
                <span className="inline-flex items-center gap-2">
                  {getGreetingTime()}, <span className="inline-block w-20 h-5 bg-surface-raised animate-pulse rounded align-middle" />
                </span>
              ) : (
                `${getGreetingTime()}, ${userFirstName}`
              )}
            </h1>
            <p className="text-2xs text-text-muted mt-0.5">{currentDateDisplay}</p>
          </div>
        </div>

        {/* Semantic Calendar Connection State Pill */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            onClick={() => onNavigate('calendar')}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-2xs font-semibold cursor-pointer transition-all active:scale-95",
              calInfo.classes
            )}
            title="Calendar synchronization status"
          >
            <CalIcon size={12} className="flex-shrink-0" />
            <span>{calInfo.label}</span>
          </div>
        </div>
      </motion.div>

      {/* ── Guest Session Banner (dismissible) ── */}
      {isGuest && !guestDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 flex-shrink-0 mt-0.5">
              <UserPlus size={15} />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-amber-200">Save Your Companion Workspace</div>
              <p className="text-2xs text-amber-300/80 leading-relaxed mt-0.5">
                You are in a guest session. Create an account to preserve conversations, schedule, and connected accounts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={dismissGuestBanner}
              className="px-2.5 py-1.5 rounded-xl text-2xs text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors cursor-pointer"
            >
              Continue as guest
            </button>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            >
              <span>Create account</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── 2. Primary Conversation Prompt Area ── */}
      <div className="pt-2 pb-1 select-none">
        <h2 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight">
          How can I help you today?
        </h2>
        <p className="text-xs sm:text-sm text-text-muted max-w-xl leading-relaxed mt-1">
          Ask questions, plan your daily agenda, manage tasks, or run automated workflows.
        </p>
      </div>

      {/* ── 3. Suggested Actions (Rich MITRA Action Cards) ── */}
      <div>
        <div className="text-3xs font-bold uppercase tracking-wider text-text-muted mb-2 px-0.5">
          Suggested Actions
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full">
          {quickActionsList.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => {
                  if (action.type === 'nav') {
                    onNavigate(action.value);
                  } else {
                    onAction(action.value);
                  }
                }}
                className="group flex items-center justify-between text-left p-3 rounded-2xl border border-border-subtle bg-surface-elevated/70 hover:border-brand/40 hover:bg-surface-hover hover:-translate-y-0.5 transition-all duration-150 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105", action.color)}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-text-primary group-hover:text-brand-light transition-colors truncate">
                      {action.label}
                    </div>
                    <div className="text-3xs text-text-muted truncate">
                      {action.desc}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-text-muted group-hover:text-brand-light group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2 opacity-60 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Meaningful Schedule Context (Rendered only when events exist) ── */}
      {briefing && briefing.today_events && briefing.today_events.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-2"
        >
          <div className="text-3xs font-bold uppercase tracking-wider text-text-muted mb-2 px-1 flex items-center justify-between">
            <span>Today's Schedule</span>
            <span className="text-3xs text-brand-light font-medium cursor-pointer hover:underline" onClick={() => onNavigate('calendar')}>
              View Calendar
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {briefing.today_events.slice(0, 3).map((ev: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-between text-xs hover:border-border-default transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Calendar size={14} className="text-brand-light flex-shrink-0" />
                  <span className="font-semibold text-text-primary truncate">{ev.title || 'Scheduled Event'}</span>
                </div>
                <span className="text-2xs text-text-muted flex-shrink-0 font-medium">
                  {ev.start ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const CompactConversationHeader: React.FC<{
  onNavigate: (section: string) => void;
  onClearChat: () => void;
}> = ({ onNavigate, onClearChat }) => {
  const { userName, userEmail, isGuest } = useCompanionStore();
  const userFirstName = isGuest
    ? 'Guest User'
    : (userName ? userName.trim().split(' ')[0] : (userEmail ? userEmail.split('@')[0] : 'Mitra User'));

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  };

  const currentDateDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center justify-between gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-surface-elevated/70 border border-border-subtle/80 backdrop-blur-sm shadow-2xs"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center text-brand-light flex-shrink-0">
          <Zap size={14} className="text-brand-light" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-primary tracking-tight truncate">
              {getGreetingTime()}, {userFirstName}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-3xs font-medium">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active</span>
            </span>
          </div>
          <p className="text-3xs text-text-muted mt-0.5">{currentDateDisplay}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onNavigate('calendar')}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle hover:border-brand/40 bg-surface-overlay/80 hover:bg-surface-hover text-2xs font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          title="Open Calendar"
        >
          <Calendar size={12} className="text-brand-light flex-shrink-0" />
          <span>Calendar</span>
        </button>

        <button
          onClick={onClearChat}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle hover:border-red-500/30 bg-surface-overlay/80 hover:bg-red-500/10 text-2xs font-medium text-text-muted hover:text-red-400 transition-colors cursor-pointer"
          title="Start fresh conversation"
        >
          <RotateCcw size={11} className="flex-shrink-0" />
          <span>New Chat</span>
        </button>
      </div>
    </motion.div>
  );
};

const WorkspaceHubView: React.FC<{
  onExpandFullScreen: () => void;
  onNavigate: (section: string) => void;
}> = ({ onExpandFullScreen, onNavigate }) => {
  return (
    <div className="w-full flex flex-col gap-4 sm:gap-5 py-3 sm:py-5">
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 sm:p-6 rounded-2xl bg-surface-elevated/90 border border-brand/25 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-brand/15 border border-brand/35 flex items-center justify-center text-brand-light flex-shrink-0 shadow-xs">
            <LayoutGrid size={20} className="text-brand-light" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-bold uppercase tracking-wider text-brand-light">Mitra Workspace</span>
              <span className="w-1.5 h-1.5 rounded-full bg-state-success animate-pulse" />
              <span className="text-3xs font-medium text-state-success">Companion Active in Chatbot</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight truncate mt-0.5">
              Workspace Overview
            </h2>
            <p className="text-2xs text-text-muted mt-0.5">
              Mitra Companion is active in the chatbot window. Background chat is closed to keep your workspace clear.
            </p>
          </div>
        </div>

        <button
          onClick={onExpandFullScreen}
          className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-glow transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer flex-shrink-0"
        >
          <Maximize2 size={13} />
          <span>Switch to Full-Screen Chat</span>
        </button>
      </motion.div>

      {/* Quick Navigation Cards */}
      <div>
        <div className="text-3xs font-bold uppercase tracking-wider text-text-muted mb-2.5 px-1">
          Workspace Modules
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'calendar',
              label: 'Calendar & Schedule',
              desc: 'Upcoming events & Google Calendar sync',
              icon: Calendar,
              color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
            },
            {
              id: 'tasks',
              label: 'Tasks & Priorities',
              desc: 'Kanban board & priority to-dos',
              icon: CheckSquare,
              color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
            },
            {
              id: 'analytics',
              label: 'Analytics & Habits',
              desc: 'Productivity monitors & focus logs',
              icon: BarChart2,
              color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
            },
            {
              id: 'workflows',
              label: 'Automated Workflows',
              desc: 'Daily routines & smart actions',
              icon: PlayCircle,
              color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => onNavigate(card.id)}
                className="p-4 rounded-2xl bg-surface-elevated/70 border border-border-subtle hover:border-brand/40 hover:bg-surface-hover transition-all text-left group cursor-pointer active:scale-[0.98] shadow-xs"
              >
                <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center mb-3 group-hover:scale-105 transition-transform", card.color)}>
                  <Icon size={16} />
                </div>
                <div className="text-xs font-bold text-text-primary group-hover:text-brand-light transition-colors">
                  {card.label}
                </div>
                <p className="text-2xs text-text-muted mt-1 leading-relaxed">
                  {card.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface ConversationCenterProps {
  onNewChat?: () => void;
}

const ConversationCenter: React.FC<ConversationCenterProps> = ({ onNewChat }) => {
  const { messages, status, clearMessages, setDraftEditState, chatbotOpen, setChatbotOpen } = useCompanionStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isThinking = status === 'thinking';

  const handleClearChat = useCallback(() => {
    if (onNewChat) {
      onNewChat();
    } else {
      clearMessages();
    }
  }, [onNewChat, clearMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Handle action prompt execution
  const handleActionSend = useCallback((prompt: string) => {
    const send = (window as any).__MITRA_SEND__;
    if (send) send(prompt);
  }, []);

  const handleNavigate = useCallback((section: string) => {
    const nav = (window as any).__MITRA_NAV__;
    if (nav) nav(section);
  }, []);

  const [viewingDraft, setViewingDraft] = useState<any | null>(null);
  const [isFetchingDraft, setIsFetchingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const handleActionConfirm = useCallback((action: string, _messageId: string) => {
    const nav = (window as any).__MITRA_NAV__;
    const send = (window as any).__MITRA_SEND__;
    const actionLower = action.toLowerCase();

    if (actionLower.includes('calendar') || actionLower.includes('view_event') || actionLower.includes('view event')) {
      if (nav) nav('calendar');
    } else if (actionLower.includes('task') || actionLower.includes('view_task') || actionLower.includes('board')) {
      if (nav) nav('tasks');
    } else if (actionLower.includes('reminder') || actionLower.includes('create_reminder')) {
      if (nav) nav('reminders');
    } else if (actionLower.includes('workflow')) {
      if (nav) nav('workflows');
    } else if (
      actionLower.startsWith('view_draft') ||
      actionLower.includes('view full draft') ||
      actionLower.includes('view draft')
    ) {
      const targetMsg = messages.find(m => m.id === _messageId);
      let draftId = '';
      if (action.includes(':')) {
        draftId = action.split(':', 2)[1].trim();
      }
      if (!draftId && targetMsg?.capabilityResult?.data?.draft_id) {
        draftId = String(targetMsg.capabilityResult.data.draft_id);
      }

      if (draftId) {
        setIsFetchingDraft(true);
        setDraftError(null);
        setViewingDraft({ id: draftId, loading: true });
        fetch(`${getApiBase()}/api/communication/drafts/${encodeURIComponent(draftId)}`, {
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
        })
          .then(async (res) => {
            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error || errJson.detail?.error || 'Failed to load draft');
            }
            return res.json();
          })
          .then((data) => {
            setViewingDraft(data.draft || data);
          })
          .catch((err) => {
            setDraftError(err.message || 'Failed to load draft details.');
            if (targetMsg?.capabilityResult?.data) {
              setViewingDraft({
                id: draftId,
                recipient: targetMsg.capabilityResult.data.recipient || targetMsg.capabilityResult.data.to,
                subject: targetMsg.capabilityResult.data.subject,
                content: targetMsg.capabilityResult.data.content || targetMsg.capabilityResult.data.body,
              });
            }
          })
          .finally(() => {
            setIsFetchingDraft(false);
          });
      } else if (targetMsg?.capabilityResult?.data) {
        setViewingDraft(targetMsg.capabilityResult.data);
      }
    } else if (
      actionLower.startsWith('edit_draft') ||
      actionLower.includes('edit before sending') ||
      actionLower.includes('edit draft')
    ) {
      let draftId = '';
      if (action.includes(':')) {
        draftId = action.split(':', 2)[1].trim();
      }
      const targetMsg = messages.find(m => m.id === _messageId);
      const data = targetMsg?.capabilityResult?.data || {};
      if (!draftId && data.draft_id) {
        draftId = String(data.draft_id);
      }
      const recipient = data.recipient || data.to || '';
      const subject = data.subject || '';
      const content = data.content || data.body || '';
      const accountId = data.account_id || '';

      // Set structured draft edit mode — ZERO synthetic prompt, ZERO send() / LLM calls
      setDraftEditState({
        mode: 'email_draft_edit',
        draftId: draftId || '',
        to: recipient,
        subject: subject,
        body: content,
        accountId: accountId,
      });

      // If draftId is available, refresh canonical draft server-side to guarantee freshest state
      if (draftId) {
        fetch(`${getApiBase()}/api/communication/drafts/${encodeURIComponent(draftId)}`, {
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
        })
          .then(res => res.ok ? res.json() : null)
          .then(serverData => {
            if (serverData && serverData.draft) {
              setDraftEditState({
                mode: 'email_draft_edit',
                draftId: draftId,
                to: serverData.draft.recipient || recipient,
                subject: serverData.draft.subject || subject,
                body: serverData.draft.content || content,
                accountId: serverData.draft.account_id || accountId,
              });
            }
          })
          .catch(() => {});
      }
    } else if (send) {
      send(action);
    }
  }, [messages, setDraftEditState]);

  return (
    <main className="flex flex-col flex-1 min-w-0 overflow-hidden bg-surface-base w-full h-full">
      <div className="flex-1 overflow-y-auto px-2.5 sm:px-6 py-4 overscroll-contain">
        <div className="companion-container">
          {messages.length === 0 ? (
            <CompanionHomeView
              onAction={handleActionSend}
              onNavigate={handleNavigate}
            />
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <CompactConversationHeader
                onNavigate={handleNavigate}
                onClearChat={handleClearChat}
              />
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <ConversationCard
                    key={msg.id}
                    message={msg}
                    onActionConfirm={handleActionConfirm}
                  />
                ))}
                {isThinking && (
                  <ThinkingIndicator key="thinking" />
                )}
              </AnimatePresence>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Structured Draft Viewer Modal */}
      {viewingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg p-5 rounded-2xl bg-surface-elevated border border-border-subtle shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="text-lg">📧</span>
                <h3 className="text-sm font-semibold text-text-primary">Gmail Draft Preview</h3>
                {viewingDraft.id && (
                  <span className="text-3xs font-mono text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">
                    {String(viewingDraft.id).slice(0, 10)}...
                  </span>
                )}
              </div>
              <button
                onClick={() => setViewingDraft(null)}
                className="text-text-muted hover:text-text-primary p-1 rounded-md"
              >
                <X size={16} />
              </button>
            </div>

            {isFetchingDraft ? (
              <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
                <Loader2 size={16} className="animate-spin text-brand" />
                <span>Fetching draft details from Gmail...</span>
              </div>
            ) : draftError ? (
              <div className="p-3 rounded-lg bg-state-error/10 border border-state-error/20 text-xs text-state-error">
                {draftError}
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-text-muted font-medium">To: </span>
                  <span className="text-text-primary font-medium">{viewingDraft.recipient || viewingDraft.to || '(No recipient)'}</span>
                </div>
                <div>
                  <span className="text-text-muted font-medium">Subject: </span>
                  <span className="text-text-primary font-medium">{viewingDraft.subject || '(No subject)'}</span>
                </div>
                <div className="pt-1">
                  <span className="text-text-muted font-medium block mb-1">Body:</span>
                  <div className="p-3 rounded-lg bg-surface-base border border-border-subtle text-text-primary whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                    {viewingDraft.content || viewingDraft.snippet || '(Empty draft body)'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                onClick={() => {
                  const recipient = viewingDraft.recipient || viewingDraft.to || '';
                  const subject = viewingDraft.subject || '';
                  const content = viewingDraft.content || viewingDraft.snippet || '';
                  setDraftEditState({
                    mode: 'email_draft_edit',
                    draftId: viewingDraft.id || viewingDraft.draft_id || '',
                    to: recipient,
                    subject: subject,
                    body: content,
                    accountId: viewingDraft.account_id || '',
                  });
                  setViewingDraft(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-light transition-all"
              >
                Edit Draft
              </button>
              <button
                onClick={() => setViewingDraft(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay text-text-muted hover:text-text-primary border border-border-subtle"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
};

export default ConversationCenter;

