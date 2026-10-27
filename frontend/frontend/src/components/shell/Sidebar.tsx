// components/shell/Sidebar.tsx — Navigation + conversation history (responsive)
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Calendar, CheckSquare, Bell, BookOpen,
  Settings, ChevronLeft, ChevronRight, Play, X, User, TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore, resolveDisplayName } from '../../store/companion.store';

interface NavItem {
  id:    string;
  icon:  React.ReactNode;
  label: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'chat',        icon: <MessageCircle size={15} />, label: 'Companion' },
  { id: 'analytics',   icon: <TrendingUp    size={15} />, label: 'Analytics & Habits' },
  { id: 'calendar',    icon: <Calendar      size={15} />, label: 'Calendar' },
  { id: 'tasks',       icon: <CheckSquare   size={15} />, label: 'Tasks' },
  { id: 'reminders',   icon: <Bell          size={15} />, label: 'Reminders' },
  { id: 'knowledge',   icon: <BookOpen      size={15} />, label: 'Knowledge' },
  { id: 'workflows',   icon: <Play          size={15} />, label: 'Workflows' },
];

interface Props {
  activeSection?: string;
  onSectionChange?: (id: string) => void;
}

/* ── Desktop / Tablet Sidebar (grid-embedded) ─────────── */
const DesktopSidebar: React.FC<Props> = ({
  activeSection = 'chat', onSectionChange,
}) => {
  const { sidebar, toggleSidebar } = useCompanionStore();
  const collapsed = sidebar === 'collapsed';

  return (
    <aside className={cn(
      'zone-sidebar bg-surface-raised border-r border-border-subtle flex flex-col overflow-hidden transition-all duration-300',
    )}>
      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5" role="navigation" aria-label="Main navigation">
        {navItems.map(item => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => onSectionChange?.(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all duration-150 text-left group',
                active
                  ? 'bg-brand-muted text-brand-light'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay',
              )}
            >
              <span className={cn('flex-shrink-0', active ? 'text-brand-light' : '')}>
                {item.icon}
              </span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {item.badge && item.badge > 0 && (
                <span className="ml-auto w-4 h-4 bg-brand rounded-full text-2xs text-white flex items-center justify-center flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 space-y-0.5 border-t border-border-subtle pt-2">
        <button onClick={() => {
          const fn = (window as any).__MITRA_SETTINGS__;
          if (fn) fn();
        }} className={cn(
          'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all duration-150 text-text-muted hover:text-text-secondary hover:bg-surface-overlay',
        )}>
          <Settings size={15} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-medium"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Collapse toggle */}
        <button
          id="sidebar-collapse-toggle"
          onClick={toggleSidebar}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all duration-150 text-text-muted hover:text-text-secondary hover:bg-surface-overlay"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-medium"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pt-2 px-1 flex items-center justify-center gap-2 text-[10px] text-text-muted/70"
            >
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-brand-light transition-colors">Terms</a>
              <span>·</span>
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-brand-light transition-colors">Privacy</a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
};

/* ── Mobile Sidebar Drawer (overlay) ──────────────────── */
const MobileSidebarDrawer: React.FC<Props> = ({
  activeSection = 'chat', onSectionChange,
}) => {
  const { mobileMenuOpen, setMobileMenuOpen, userName, userEmail, isGuest } = useCompanionStore();
  const displayName = resolveDisplayName({ name: userName, email: userEmail }, isGuest);

  const handleNav = (id: string) => {
    onSectionChange?.(id);
    setMobileMenuOpen(false);
  };

  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mobile-overlay-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="mobile-sidebar-drawer"
            role="dialog"
            aria-label="Navigation menu"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-muted border border-brand/30 flex items-center justify-center">
                  <span className="text-brand-light text-sm font-bold">M</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary">Mitra</p>
                  <p className="text-2xs text-text-muted truncate">Hey, {displayName} 👋</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl hover:bg-surface-overlay active:scale-95 transition-all"
                aria-label="Close menu"
              >
                <X size={18} className="text-text-muted" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-3 px-3 space-y-1" role="navigation" aria-label="Main navigation">
              {navItems.map(item => {
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    id={`mobile-nav-${item.id}`}
                    onClick={() => handleNav(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl transition-all duration-150 text-left cursor-pointer',
                      active
                        ? 'bg-brand-muted text-brand-light font-semibold'
                        : 'text-text-secondary hover:bg-surface-overlay active:bg-surface-overlay',
                    )}
                  >
                    <span className={cn('flex-shrink-0', active ? 'text-brand-light' : '')}>
                      {item.icon}
                    </span>
                    <span className="text-sm">{item.label}</span>
                    {item.badge && item.badge > 0 && (
                      <span className="ml-auto w-5 h-5 bg-brand rounded-full text-xs text-white flex items-center justify-center flex-shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Integrations shortcut in mobile navigation */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  const fn = (window as any).__MITRA_INTEGRATIONS__;
                  if (fn) fn();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-text-secondary hover:bg-surface-overlay active:bg-surface-overlay transition-all text-left cursor-pointer"
              >
                <span className="flex-shrink-0 text-sky-400">🔌</span>
                <span className="text-sm">Integrations & Cloud Sync</span>
              </button>
            </nav>

            {/* Footer */}
            <div className="px-3 pb-4 border-t border-border-subtle pt-3 space-y-1">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  useCompanionStore.getState().setAuthModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-text-primary bg-surface-overlay hover:bg-surface-hover transition-all font-medium cursor-pointer"
              >
                <User size={16} className="text-brand-light" />
                <span className="text-sm font-medium">
                  {isGuest ? 'Create Account / Log In' : 'Account Profile'}
                </span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  const fn = (window as any).__MITRA_SETTINGS__;
                  if (fn) fn();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-text-muted hover:text-text-secondary hover:bg-surface-overlay transition-all cursor-pointer"
              >
                <Settings size={16} />
                <span className="text-sm font-medium">Settings</span>
              </button>
              <div className="pt-2 flex items-center justify-center gap-3 text-xs text-text-muted/70">
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-brand-light transition-colors">Terms of Service</a>
                <span>·</span>
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-brand-light transition-colors">Privacy Policy</a>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

/* ── Exported Sidebar — renders desktop OR mobile version ── */
const Sidebar: React.FC<Props> = (props) => {
  const isMobile = useCompanionStore(s => s.isMobile);

  return (
    <>
      {/* Desktop/Tablet sidebar always rendered (hidden on mobile via CSS) */}
      <DesktopSidebar {...props} />
      {/* Mobile sidebar drawer rendered only on mobile */}
      {isMobile && <MobileSidebarDrawer {...props} />}
    </>
  );
};

export default Sidebar;
