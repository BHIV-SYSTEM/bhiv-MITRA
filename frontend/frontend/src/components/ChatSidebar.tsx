import React, { useState, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, X, Search, Clock, Edit2, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ChatConversationItem {
  id: string;
  session_id?: string;
  title: string;
  timestamp?: string;
  created_at?: string;
  updated_at?: string;
  turns_count?: number;
}

interface ChatSidebarProps {
  conversations: ChatConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename?: (id: string, newTitle: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

// Group conversations by time category (ChatGPT-style)
function groupConversations(items: ChatConversationItem[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const last7DaysStart = todayStart - 6 * 86400000;

  const groups: { [key: string]: ChatConversationItem[] } = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };

  items.forEach((conv) => {
    const rawTime = conv.updated_at || conv.timestamp || conv.created_at;
    const time = rawTime ? new Date(rawTime).getTime() : Date.now();

    if (time >= todayStart) {
      groups.Today.push(conv);
    } else if (time >= yesterdayStart) {
      groups.Yesterday.push(conv);
    } else if (time >= last7DaysStart) {
      groups['Previous 7 Days'].push(conv);
    } else {
      groups.Older.push(conv);
    }
  });

  return groups;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations = [],
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Filter by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => (c.title || 'New Conversation').toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  // Grouped items
  const grouped = useMemo(() => groupConversations(filteredConversations), [filteredConversations]);

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editTitle.trim() && onRename) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer sidebar */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-80',
          'bg-surface-raised border-r border-border-subtle shadow-2xl',
          'transform transition-transform duration-300 ease-out flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Chat history sidebar"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center text-brand-light">
              <Clock size={14} />
            </div>
            <h2 className="text-sm font-bold text-text-primary tracking-tight">Chat History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-overlay transition-colors"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 border-b border-border-subtle/50">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-light active:bg-brand text-white py-2.5 px-3 rounded-xl text-xs font-semibold transition-all shadow-glow active:scale-[0.98] cursor-pointer"
          >
            <Plus size={15} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search filter */}
        {conversations.length > 3 && (
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-overlay border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3 overscroll-contain">
          {conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-overlay border border-border-subtle mb-2 text-text-muted">
                <MessageSquare size={18} />
              </div>
              <p className="text-xs font-medium text-text-secondary">No conversations yet</p>
              <p className="text-3xs text-text-muted mt-0.5">Start chatting with Mitra to build your history</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-text-muted">
              No chats matching "{searchQuery}"
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={category} className="space-y-1">
                  <div className="px-2.5 py-1 text-3xs font-semibold text-text-muted uppercase tracking-wider">
                    {category}
                  </div>
                  {items.map((conv) => {
                    const isActive = activeId === conv.id || activeId === conv.session_id;
                    const isEditing = editingId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          onSelect(conv.id);
                          onClose();
                        }}
                        className={cn(
                          'group relative flex items-center px-2.5 py-2 rounded-xl cursor-pointer transition-all text-xs select-none',
                          isActive
                            ? 'bg-brand/15 text-brand-light font-medium border border-brand/30 shadow-xs'
                            : 'hover:bg-surface-overlay text-text-secondary hover:text-text-primary'
                        )}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onSelect(conv.id);
                            onClose();
                          }
                        }}
                      >
                        <MessageSquare
                          size={14}
                          className={cn('flex-shrink-0 mr-2', isActive ? 'text-brand-light' : 'text-text-muted')}
                        />

                        {isEditing ? (
                          <div
                            className="flex-1 flex items-center gap-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(conv.id, e);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                              className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-surface-elevated border border-brand/50 rounded text-text-primary focus:outline-none"
                            />
                            <button
                              onClick={(e) => handleSaveRename(conv.id, e)}
                              className="p-1 hover:text-state-success text-text-muted"
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 hover:text-state-error text-text-muted"
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0 mr-1">
                            <p className="truncate leading-snug">{conv.title || 'New Conversation'}</p>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onRename && (
                              <button
                                onClick={(e) => handleStartRename(conv.id, conv.title || 'New Conversation', e)}
                                aria-label="Rename conversation"
                                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                            <button
                              onClick={(e) => onDelete(conv.id, e)}
                              aria-label="Delete conversation"
                              className="p-1 rounded text-text-muted hover:text-state-error hover:bg-state-error/10 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};

export default ChatSidebar;
