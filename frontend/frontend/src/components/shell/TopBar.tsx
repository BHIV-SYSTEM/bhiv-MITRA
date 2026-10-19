// components/shell/TopBar.tsx — Mitra top navigation bar (responsive across 320px - 1440px+)
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, PanelRight, Zap, Menu, Settings,
  Calendar, CheckSquare, PlayCircle, TrendingUp, SlidersHorizontal,
  Mic, Clock, Network, Brain, ChevronDown
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore, resolveDisplayName } from '../../store/companion.store';
import CompanionDot from '../primitives/CompanionDot';
import NotificationDropdown from './NotificationDropdown';
import CompanionSwitcher from './CompanionSwitcher';

interface Props { onSearch?: () => void; }

const statusLabel = { active: 'Active', thinking: 'Thinking…', away: 'Away', error: 'Error' };

const TopBar: React.FC<Props> = ({ onSearch }) => {
  const {
    status, userName, userEmail, isAuthenticated, isGuest, authStatus, notifications,
    toggleContextPanel, contextPanel,
    isMobile, toggleMobileMenu,
    sidebar,
  } = useCompanionStore();
  const sidebarCollapsed = sidebar === 'collapsed';
  const unread = notifications.filter(n => !n.read).length;
  const [notifOpen, setNotifOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const displayName = resolveDisplayName({ name: userName, email: userEmail }, isGuest);

  const handleNav = (section: string) => {
    setToolsOpen(false);
    const nav = (window as any).__MITRA_NAV__;
    if (nav) nav(section);
  };

  const handleToolAction = (action: () => void) => {
    setToolsOpen(false);
    action();
  };

  return (
    <header className="zone-topbar glass w-full select-none z-30 border-b border-border-subtle/80">
      <div className="w-full h-full flex items-center justify-between px-3.5 sm:px-4 lg:px-4 gap-3 sm:gap-4">
        {/* ── ZONE 1 (LEFT): MITRA Logo + Brand + Status ── */}
        <div className={cn(
          "flex items-center gap-2 sm:gap-2.5 flex-shrink-0 min-w-0 transition-all duration-300",
          !isMobile && (sidebarCollapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]")
        )}>
          {/* Mobile hamburger */}
          {isMobile && (
            <button
              id="topbar-mobile-menu"
              onClick={toggleMobileMenu}
              className="w-9 h-9 min-w-[36px] flex items-center justify-center rounded-xl hover:bg-surface-overlay active:scale-95 transition-all text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>
          )}

          {/* Brand Logo & Name */}
          <div
            onClick={() => handleNav('chat')}
            className="flex items-center gap-2.5 cursor-pointer group py-1"
            title="MITRA Home"
          >
            <div className="w-8 h-8 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center group-hover:scale-105 group-hover:border-brand/50 transition-all flex-shrink-0 shadow-xs">
              <Zap size={15} className="text-brand-light" />
            </div>
            <span className="text-sm sm:text-base font-bold text-text-primary tracking-tight">MITRA</span>
          </div>

          {/* Companion status indicator pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-overlay/80 border border-border-subtle/80 flex-shrink-0">
            <CompanionDot status={status} size="sm" />
            <span className={cn(
              'text-2xs font-semibold hidden min-[480px]:inline',
              status === 'active'   ? 'text-state-success' :
              status === 'thinking' ? 'text-brand-light animate-pulse' :
              status === 'error'    ? 'text-state-error' :
              'text-text-muted',
            )}>
              {statusLabel[status]}
            </span>
          </div>
        </div>

        {/* ── ZONE 2 (CENTER): Intentionally Empty Flexible Spacer ── */}
        <div className="flex-1 min-w-0" aria-hidden="true" />

        {/* ── ZONE 3 (RIGHT): Search, Tools, Notifications, Profile, Context ── */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Mitra Companion Switcher (Persona & Avatar Selector at user requested position) */}
          <CompanionSwitcher />

          {/* Search Trigger */}
          <button
            id="topbar-search"
            onClick={() => {
              if (onSearch) onSearch();
              const searchFn = (window as any).__MITRA_SEARCH__;
              if (searchFn) searchFn();
            }}
            className="hidden sm:flex min-w-[36px] min-h-[36px] w-9 h-9 items-center justify-center rounded-xl bg-surface-overlay border border-border-subtle text-text-muted hover:border-border-default hover:text-text-primary active:scale-95 transition-all text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
            aria-label="Search or press Ctrl+K"
            title="Search & Commands (⌘K / Ctrl+K)"
          >
            <Search size={14} />
          </button>

          {/* Unified Responsive Tools Menu */}
          <div className="relative">
            <button
              id="topbar-tools-dropdown-btn"
              onClick={() => setToolsOpen(!toolsOpen)}
              className={cn(
                "h-9 min-h-[36px] px-2.5 sm:px-3 flex items-center gap-1.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                toolsOpen
                  ? "bg-brand text-white border-brand shadow-glow"
                  : "bg-surface-overlay hover:bg-surface-hover border-border-subtle text-text-secondary hover:text-text-primary"
              )}
              aria-label="MITRA Tools Menu"
              aria-expanded={toolsOpen}
            >
              <Zap size={13} className={cn(toolsOpen ? "text-white" : "text-brand-light")} />
              <span className="text-xs font-medium">Tools</span>
              <ChevronDown size={12} className={cn("transition-transform duration-200 opacity-60", toolsOpen && "rotate-180")} />
            </button>

            {/* Tools Menu Dropdown */}
            <AnimatePresence>
              {toolsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setToolsOpen(false)}
                    aria-hidden="true"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-11 w-64 sm:w-72 p-2 rounded-2xl bg-surface-elevated border border-border-default shadow-2xl z-50 flex flex-col gap-1 select-none max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain"
                    role="menu"
                    aria-label="Tools Navigation"
                  >
                    {/* Header */}
                    <div className="px-3 py-1.5 border-b border-border-subtle flex items-center justify-between">
                      <span className="text-3xs font-bold text-text-muted uppercase tracking-wider">Mitra Tools</span>
                      <span className="text-3xs text-brand-light font-semibold">Primary Workspace</span>
                    </div>

                    {/* Primary Required Tools */}
                    <div className="grid grid-cols-1 gap-0.5 pt-1">
                      <button
                        onClick={() => handleNav('calendar')}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-brand-light flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Calendar size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Calendar</div>
                          <div className="text-3xs text-text-muted">Schedule & events sync</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleNav('tasks')}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <CheckSquare size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Tasks</div>
                          <div className="text-3xs text-text-muted">Priorities & to-do board</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleNav('workflows')}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <PlayCircle size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Workflows</div>
                          <div className="text-3xs text-text-muted">Automate daily routines</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleNav('analytics')}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <TrendingUp size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Analytics</div>
                          <div className="text-3xs text-text-muted">Productivity & habit monitor</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_INTEGRATIONS__?.())}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <SlidersHorizontal size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Integrations</div>
                          <div className="text-3xs text-text-muted">Google, Outlook, GitHub, Apple</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_SETTINGS__?.())}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Settings size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Settings</div>
                          <div className="text-3xs text-text-muted">Preferences & theme</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleToolAction(() => {
                          const searchFn = (window as any).__MITRA_SEARCH__;
                          if (searchFn) searchFn();
                        })}
                        className="flex sm:hidden items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-overlay text-left transition-colors group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Search size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-text-primary">Search & Commands</div>
                          <div className="text-3xs text-text-muted">Quick finder & shortcut (Ctrl+K)</div>
                        </div>
                      </button>
                    </div>

                    {/* Secondary AI Companion Tools Divider */}
                    <div className="px-3 py-1 mt-1 border-t border-border-subtle flex items-center justify-between">
                      <span className="text-3xs font-bold text-text-muted uppercase tracking-wider">AI Capabilities</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_VOICE_TALK__?.())}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-overlay text-left transition-colors"
                      >
                        <Mic size={13} className="text-emerald-400 flex-shrink-0" />
                        <span className="text-2xs font-medium text-text-secondary truncate">Voice Talk</span>
                      </button>
                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_FOCUS__?.())}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-overlay text-left transition-colors"
                      >
                        <Clock size={13} className="text-amber-400 flex-shrink-0" />
                        <span className="text-2xs font-medium text-text-secondary truncate">Focus Mode</span>
                      </button>
                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_MINDMAP__?.())}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-overlay text-left transition-colors"
                      >
                        <Network size={13} className="text-purple-400 flex-shrink-0" />
                        <span className="text-2xs font-medium text-text-secondary truncate">Mind Map</span>
                      </button>
                      <button
                        onClick={() => handleToolAction(() => (window as any).__MITRA_MEMORY__?.())}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-overlay text-left transition-colors"
                      >
                        <Brain size={13} className="text-indigo-400 flex-shrink-0" />
                        <span className="text-2xs font-medium text-text-secondary truncate">Memory</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications Trigger (Hidden on 320px screens, visible ≥480px) */}
          <div className="relative hidden min-[480px]:block">
            <button
              id="topbar-notifications"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative min-w-[36px] min-h-[36px] w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-overlay text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`${unread} unread notifications`}
              title="Notifications"
            >
              <Bell size={15} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-brand rounded-full flex items-center justify-center text-[9px] text-white font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <NotificationDropdown open={notifOpen} onClose={() => setNotifOpen(false)} />
          </div>

          {/* Account / Login Trigger */}
          <button
            id="topbar-auth-button"
            onClick={() => useCompanionStore.getState().setAuthModalOpen(true)}
            className="flex items-center gap-2 h-9 min-h-[36px] px-2.5 sm:px-3 rounded-xl bg-surface-overlay border border-border-subtle hover:border-brand/40 text-text-primary text-xs transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title={isAuthenticated && !isGuest ? `Account: ${displayName}` : (isGuest ? 'Guest Session — Create account' : 'Log In / Sign Up')}
            aria-label="User Account"
          >
            {authStatus === 'LOADING' ? (
              <div className="w-6 h-6 rounded-full bg-surface-raised animate-pulse" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center text-brand-light font-bold text-2xs flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate text-text-secondary">
              {authStatus === 'LOADING' ? (
                <span className="inline-block w-14 h-3.5 bg-surface-raised animate-pulse rounded" />
              ) : (
                displayName
              )}
            </span>
          </button>

          {/* Desktop Right Context Toggle */}
          {!isMobile && (
            <button
              id="topbar-context-toggle"
              onClick={toggleContextPanel}
              className={cn(
                'w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer',
                contextPanel === 'open'
                  ? 'bg-brand text-white shadow-glow border border-brand'
                  : 'bg-surface-overlay hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle',
              )}
              aria-label="Toggle context panel"
              title="Toggle Assistant Context"
            >
              <PanelRight size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
