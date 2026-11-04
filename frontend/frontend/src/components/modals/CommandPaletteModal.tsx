import React, { useState, useEffect, useRef } from 'react';
import {
  motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Search, Calendar, CheckSquare, Bell, BookOpen, PlayCircle, Zap, ArrowRight, X, Clock } from 'lucide-react';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Tools';
  label: string;
  subtitle: string;
  icon: any;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigateTo = (section: string) => {
    const nav = (window as any).__MITRA_NAV__;
    if (nav) nav(section);
    onClose();
  };

  const sendPrompt = (prompt: string) => {
    navigateTo('chat');
    setTimeout(() => {
      const send = (window as any).__MITRA_SEND__;
      if (send) send(prompt);
    }, 100);
  };

  const commandItems: CommandItem[] = [
    {
      id: 'nav-chat',
      category: 'Navigation',
      label: 'Go to Chat',
      subtitle: 'Open AI Assistant Chat Thread',
      icon: Zap,
      action: () => navigateTo('chat')
    },
    {
      id: 'nav-calendar',
      category: 'Navigation',
      label: 'Go to Calendar',
      subtitle: 'View events, schedule and week strip',
      icon: Calendar,
      action: () => navigateTo('calendar')
    },
    {
      id: 'nav-tasks',
      category: 'Navigation',
      label: 'Go to Tasks',
      subtitle: 'Manage your tasks & priorities',
      icon: CheckSquare,
      action: () => navigateTo('tasks')
    },
    {
      id: 'nav-reminders',
      category: 'Navigation',
      label: 'Go to Reminders',
      subtitle: 'View active reminders and set alerts',
      icon: Bell,
      action: () => navigateTo('reminders')
    },
    {
      id: 'nav-knowledge',
      category: 'Navigation',
      label: 'Go to Knowledge Base',
      subtitle: 'Search saved documents & topics',
      icon: BookOpen,
      action: () => navigateTo('knowledge')
    },
    {
      id: 'nav-workflows',
      category: 'Navigation',
      label: 'Go to Workflows',
      subtitle: 'Run automation workflows & agents',
      icon: PlayCircle,
      action: () => navigateTo('workflows')
    },
    {
      id: 'act-focus',
      category: 'Tools',
      label: 'Start Focus Session & Soundscapes',
      subtitle: 'Launch Pomodoro timer + ambient audio',
      icon: Clock,
      action: () => {
        onClose();
        const focusFn = (window as any).__MITRA_FOCUS__;
        if (focusFn) focusFn();
      }
    },
    {
      id: 'act-briefing',
      category: 'Actions',
      label: 'Run Morning Briefing',
      subtitle: 'Ask Mitra for a proactive summary of today',
      icon: Zap,
      action: () => sendPrompt('Run morning briefing')
    },
    {
      id: 'act-add-task',
      category: 'Actions',
      label: 'Create New Task',
      subtitle: 'Ask Mitra to add a new task',
      icon: CheckSquare,
      action: () => sendPrompt('Add a task: ')
    },
    {
      id: 'act-add-event',
      category: 'Actions',
      label: 'Add Calendar Event',
      subtitle: 'Schedule a new event on calendar',
      icon: Calendar,
      action: () => sendPrompt('Schedule a calendar event for ')
    },
    {
      id: 'act-reminder',
      category: 'Actions',
      label: 'Set New Reminder',
      subtitle: 'Create a timed reminder alert',
      icon: Bell,
      action: () => sendPrompt('Remind me to ')
    },
    {
      id: 'whatsapp-web',
      category: 'Actions',
      label: 'Open WhatsApp Web Automation (QR Code)',
      subtitle: 'Connect personal WhatsApp, sync contacts and send messages',
      icon: MessageSquare,
      action: () => {
        onClose();
        (window as any).__MITRA_WHATSAPP_WEB__?.();
      }
    }
  ];

  const filtered = commandItems.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm select-none" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-xl rounded-2xl bg-surface-elevated border border-brand/30 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Search Input Bar */}
          <div className="flex items-center px-4 py-3 border-b border-border-subtle gap-3 bg-surface-overlay/50">
            <Search size={18} className="text-brand-light flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search (e.g. 'calendar', 'task', 'focus')..."
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-text-muted hover:text-text-primary p-1">
                <X size={14} />
              </button>
            )}
            <kbd className="px-1.5 py-0.5 text-2xs bg-surface-overlay border border-border-subtle rounded text-text-muted font-mono hidden xs:inline">ESC</kbd>
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                No matching commands found for "{query}"
              </div>
            ) : (
              filtered.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-brand/15 border border-brand/30 text-text-primary shadow-sm'
                        : 'hover:bg-surface-overlay text-text-secondary border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-brand text-white' : 'bg-surface-overlay text-text-muted'
                      }`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-text-primary truncate">{item.label}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-overlay border border-border-subtle text-text-muted font-mono uppercase">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-2xs text-text-muted truncate">{item.subtitle}</p>
                      </div>
                    </div>

                    <ArrowRight size={14} className={`flex-shrink-0 transition-transform ${isSelected ? 'translate-x-0.5 text-brand-light' : 'opacity-30'}`} />
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Shortcuts Legend */}
          <div className="px-4 py-2 bg-surface-overlay/80 border-t border-border-subtle flex items-center justify-between text-2xs text-text-muted">
            <span className="flex items-center gap-2">
              <span><kbd className="px-1 bg-surface-base border border-border-subtle rounded">↑</kbd> <kbd className="px-1 bg-surface-base border border-border-subtle rounded">↓</kbd> Navigate</span>
              <span><kbd className="px-1 bg-surface-base border border-border-subtle rounded">↵</kbd> Select</span>
            </span>
            <span>Mitra Spotlight</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
