// components/cards/ConversationCard.tsx — Chat message bubble with Nilesh TTS voice output
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { cn, formatTime } from '../../lib/utils';
import { Message } from '../../store/companion.store';
import ActionCard from './ActionCard';
import CommunicationConfirmationCard from './CommunicationConfirmationCard';
import FormattedMarkdown from '../primitives/FormattedMarkdown';
import { getApiBase, getAuthHeaders } from '../../services/apiConfig';

interface Props {
  message: Message;
  onActionConfirm?: (action: string, messageId: string) => void;
}

const ConversationCard: React.FC<Props> = ({ message, onActionConfirm }) => {
  const isAssistant = message.role === 'assistant';
  const [isPlaying, setIsPlaying] = useState(false);
  const hasContent = Boolean(message.content && message.content.trim().length > 0);
  const hasCapability = Boolean(message.capabilityResult);

  // When the assistant placeholder has empty or whitespace-only content and has no capability card,
  // do not render the empty styled message bubble or empty card shell.
  if (isAssistant && !hasContent && !hasCapability) {
    return null;
  }

  const handleSpeak = async () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);

    try {
      // Try Nilesh's Live TTS Service endpoint on Render
      const res = await fetch(`${getApiBase()}/api/tts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          text: message.content,
          language: 'en',
        }),
      });

      const data = await res.json();
      if (data.audio_base64) {
        const audio = new Audio(`data:audio/${data.audio_format || 'wav'};base64,${data.audio_base64}`);
        audio.setAttribute('playsinline', 'true');
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => fallbackBrowserSpeech();
        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('Nilesh TTS service unavailable, falling back to Web Speech API:', err);
    }

    fallbackBrowserSpeech();
  };

  const fallbackBrowserSpeech = () => {
    if (!('speechSynthesis' in window)) {
      setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'flex gap-2 sm:gap-3 w-full',
        isAssistant ? 'flex-row' : 'flex-row-reverse',
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-2xs sm:text-xs font-semibold select-none',
        isAssistant
          ? 'bg-brand-muted text-brand-light border border-brand/30'
          : 'bg-surface-elevated text-text-secondary border border-border-subtle',
      )}>
        {isAssistant ? 'M' : 'U'}
      </div>

      {/* Content column */}
      <div className={cn(
        'flex flex-col gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[75%] lg:max-w-[72%]',
        isAssistant ? 'items-start' : 'items-end',
      )}>
        {/* Bubble */}
        {hasContent && (
          <div className={cn(
            'relative group px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-lg text-sm leading-relaxed break-words',
            isAssistant
              ? 'bg-surface-elevated border border-border-subtle text-text-primary rounded-tl-sm'
              : 'bg-brand-dim text-text-primary border border-brand/30 rounded-tr-sm',
          )}>
            {isAssistant ? <FormattedMarkdown content={message.content} /> : message.content}
          </div>
        )}

        {/* Inline communication approval card (B.COMM-3 Structured Pending Action) */}
        {isAssistant && message.capabilityResult && message.capabilityResult.data?.confirmation && (
          <CommunicationConfirmationCard
            confirmation={message.capabilityResult.data.confirmation}
            onConfirm={(result) => {
              // Structured confirmation executed via dedicated REST endpoint — zero LLM reinterpretation
            }}
            onCancel={() => {
              // Action cancelled via dedicated REST endpoint
            }}
          />
        )}

        {/* Inline capability result (for other capabilities or non-confirmation results) */}
        {isAssistant && message.capabilityResult && !message.capabilityResult.data?.confirmation && (
          <ActionCard
            capability={message.capabilityResult.capability}
            intent={message.capabilityResult.intent}
            status={message.capabilityResult.status}
            summary={message.capabilityResult.summary}
            data={message.capabilityResult.data}
            actions={(message.capabilityResult.data?.actions || message.suggestedActions || []).map((a: any) =>
              typeof a === 'string' ? { label: a, action: a } : { label: a.label, action: a.action }
            )}
            onAction={(action) => onActionConfirm?.(action, message.id)}
            compact
          />
        )}

        {/* Smart Interactive Action Pills for Assistant Responses */}
        {isAssistant && !message.capabilityResult && hasContent && (
          <div className="flex flex-wrap gap-1.5 mt-1 select-none">
            {(() => {
              const text = message.content.toLowerCase();
              const pills: { label: string; action: string; icon: string }[] = [];

              if (text.includes('calendar') || text.includes('event') || text.includes('schedule') || text.includes('meeting')) {
                pills.push({ label: 'View Calendar', action: 'calendar', icon: '📅' });
                pills.push({ label: 'Add Event', action: 'Create a new calendar event', icon: '➕' });
              } else if (text.includes('task') || text.includes('todo') || text.includes('briefing') || text.includes('project')) {
                pills.push({ label: 'View Tasks', action: 'tasks', icon: '✅' });
                pills.push({ label: 'New Task', action: 'Create a new high priority task', icon: '📝' });
              } else if (text.includes('reminder') || text.includes('alarm') || text.includes('remember')) {
                pills.push({ label: 'Reminders', action: 'reminders', icon: '🔔' });
                pills.push({ label: 'Set Reminder', action: 'Set a reminder for evening', icon: '⏰' });
              } else {
                pills.push({ label: 'Key Bullets', action: 'Summarize the key takeaways in 3 bullet points', icon: '📌' });
                pills.push({ label: 'Explain Details', action: 'Can you break this down step by step?', icon: '💡' });
              }

              return pills.map(p => (
                <button
                  key={p.label}
                  onClick={() => onActionConfirm?.(p.action, message.id)}
                  className="px-2.5 py-1 rounded-lg bg-surface-overlay border border-border-subtle hover:border-brand/40 text-text-muted hover:text-brand-light text-2xs font-medium flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ));
            })()}
          </div>
        )}

        {/* Timestamp & Voice Speaker Button */}
        <div className="flex items-center gap-2 text-2xs text-text-muted select-none">
          <span>{formatTime(message.timestamp)}</span>
          {isAssistant && (
            <button
              onClick={handleSpeak}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
                isPlaying ? 'text-brand-light bg-brand-muted font-medium' : 'hover:text-brand-light'
              )}
              title={isPlaying ? 'Stop Voice' : 'Listen to Voice Output (Nilesh TTS)'}
            >
              {isPlaying ? <VolumeX size={12} className="animate-pulse" /> : <Volume2 size={12} />}
              <span>{isPlaying ? 'Speaking...' : 'Voice'}</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(ConversationCard);
