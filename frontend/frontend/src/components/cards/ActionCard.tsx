// components/cards/ActionCard.tsx — Capability result + action buttons
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import Badge from '../primitives/Badge';

interface ActionItem {
  label:  string;
  action: string;
  variant?: 'primary' | 'ghost';
}

interface Props {
  capability: string;
  intent:     string;
  status:     'success' | 'error' | 'pending';
  summary:    string;
  data?:      Record<string, any>;
  actions?:   ActionItem[];
  onAction?:  (action: string) => void;
  compact?:   boolean;
  className?: string;
}

const capabilityIcon: Record<string, string> = {
  email:        '📧',
  calendar:     '📅',
  task:         '✅',
  reminder:     '🔔',
  whatsapp:     '💬',
  notes:        '📝',
  contacts:     '👤',
  browser:      '🔍',
  document:     '📄',
  uniguru:      '📚',
  notification: '🔔',
};

const statusIcon = {
  success: <CheckCircle size={13} className="text-state-success" />,
  error:   <AlertCircle size={13} className="text-state-error" />,
  pending: <Clock       size={13} className="text-state-warning" />,
};

const statusVariant = {
  success: 'success',
  error:   'error',
  pending: 'warning',
} as const;

export const INTERNAL_PRESENTATION_KEYS = new Set([
  'trace_id',
  'internal_trace_id',
  'idempotency_key',
  'governance_flags',
  'decision',
  'severity',
  'ontology_reference',
  'reasoning_trace',
  'concept_resolution',
  'status',
  'status_code',
  'error_code',
  'delivery_state',
  'latency_ms',
  'source',
  'verification_status',
  'knowledge_evidence',
  'fbtrace_id',
  'account_id',
  'user_id',
  'execution_id',
  'request_id',
  '_debug',
]);

const ActionCard: React.FC<Props> = ({
  capability, intent, status, summary, data, actions = [],
  onAction, compact = false, className,
}) => {
  const icon = capabilityIcon[capability] || '⚡';

  // Filter internal plumbing fields from display while preserving meaningful user fields
  const displayEntries = data
    ? Object.entries(data).filter(([k, v]) => {
        if (INTERNAL_PRESENTATION_KEYS.has(k.toLowerCase())) return false;
        if (v === null || v === undefined || v === '') return false;
        return true;
      })
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'card card-brand w-full',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {capability}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {statusIcon[status]}
          <Badge variant={statusVariant[status]} dot>
            {status}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <p className={cn(
        'text-text-primary leading-snug',
        compact ? 'text-xs' : 'text-sm',
      )}>
        {summary}
      </p>

      {/* Data snippets */}
      {!compact && displayEntries.length > 0 && (
        <div className="mt-2.5 p-2.5 bg-surface-raised rounded-md border border-border-subtle">
          {displayEntries.slice(0, 4).map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline gap-2 text-xs py-0.5">
              <span className="text-text-muted capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="text-text-primary font-medium truncate max-w-[60%]">
                {typeof v === 'string' ? v : JSON.stringify(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          {actions.map((a, i) => (
            <button
              key={a.action}
              onClick={() => onAction?.(a.action)}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-md transition-all duration-150 active:scale-95',
                i === 0
                  ? 'bg-brand text-white hover:bg-brand-light'
                  : 'bg-surface-overlay text-text-secondary border border-border-subtle hover:border-border-default hover:text-text-primary',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default ActionCard;
