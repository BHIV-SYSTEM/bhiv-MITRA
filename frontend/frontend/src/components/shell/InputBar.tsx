// components/shell/InputBar.tsx — Message input with send + voice + attach (responsive)
import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, Mic, Paperclip, Zap, X, Check, Square, Mail, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore } from '../../store/companion.store';
import { showToast } from './Toast';
import { getApiBase, getAuthHeaders } from '../../services/apiConfig';

interface Props {
  onSend:     (message: string, isVoice?: boolean) => void;
  onStop?:    () => void;
  disabled?:  boolean;
}

const quickActions = [
  { label: '📋 Briefing',     value: 'Run my morning briefing' },
  { label: '📧 Email',        value: 'Check my recent emails' },
  { label: '📅 Schedule',     value: 'What\'s on my calendar today?' },
  { label: '✅ Tasks',        value: 'Show my pending tasks' },
];

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'json', 'csv', 'jpg', 'jpeg', 'png', 'webp'] as const;
export const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const FORBIDDEN_EXTENSIONS = ['svg', 'gif', 'bmp', 'tiff', 'tif', 'heic', 'ico'] as const;

export function validateAttachment(file: { name: string; type?: string }): { valid: boolean; error?: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Explicitly reject forbidden image/vector types (SVG, GIF, BMP, TIFF, HEIC, ICO)
  if (FORBIDDEN_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: 'Mitra supports PDF, DOCX, TXT, MD, JSON, CSV, and images (JPEG, PNG, WEBP). SVG, GIF, and other image types are not supported.',
    };
  }

  // Reject unsupported file extensions
  if (!SUPPORTED_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: 'Mitra supports PDF, DOCX, TXT, MD, JSON, CSV, and images (JPEG, PNG, WEBP).',
    };
  }

  // If MIME type is present and claims to be an image, strictly enforce JPEG, PNG, or WEBP
  if (file.type && file.type.startsWith('image/')) {
    if (!SUPPORTED_IMAGE_MIMES.includes(file.type as any)) {
      return {
        valid: false,
        error: 'Mitra supports PDF, DOCX, TXT, MD, JSON, CSV, and images (JPEG, PNG, WEBP).',
      };
    }
  }

  return { valid: true };
}

const InputBar: React.FC<Props> = ({ onSend, onStop, disabled }) => {
  const [value, setValue] = useState('');
  const [showQuick, setShowQuick] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { status, isMobile, draftEditState, setDraftEditState, addMessage } = useCompanionStore();
  const transcriptRef = useRef('');
  const autoSendTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local state for structured draft editing mode
  const [editTo, setEditTo] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [draftSubmitError, setDraftSubmitError] = useState<string | null>(null);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);

  useEffect(() => {
    if (draftEditState) {
      setEditTo(draftEditState.to || '');
      setEditSubject(draftEditState.subject || '');
      setEditBody(draftEditState.body || '');
      setDraftSubmitError(null);
    }
  }, [draftEditState]);

  const handleDraftSubmit = async () => {
    if (isSubmittingDraft || !draftEditState) return;
    setDraftSubmitError(null);
    setIsSubmittingDraft(true);

    try {
      const draftId = draftEditState.draftId;
      const res = await fetch(
        `${getApiBase()}/api/communication/drafts/${encodeURIComponent(draftId)}/prepare-send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            recipient: editTo.trim(),
            subject: editSubject.trim(),
            body: editBody.trim(),
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.status === 'confirmation_required' || data.confirmation)) {
        setDraftEditState(null);
        addMessage({
          role: 'assistant',
          content: data.message || "I've prepared the email. Please review and confirm before I send it.",
          capabilityResult: {
            capability: 'email',
            intent: 'SEND_MESSAGE',
            status: 'pending',
            summary: 'Confirmation required',
            data: {
              status: 'confirmation_required',
              pending_action_id: data.pending_action_id,
              confirmation: data.confirmation,
            },
          },
        });
      } else {
        const errMsg = data.error || data.message || 'Failed to prepare email send.';
        setDraftSubmitError(errMsg);
      }
    } catch (err: any) {
      setDraftSubmitError(err?.message || 'Network error while preparing draft send.');
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  const isThinking = status === 'thinking';

  useEffect(() => {
    (window as any).__MITRA_SET_INPUT__ = (newVal: string) => {
      setValue(newVal);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    };
    return () => {
      delete (window as any).__MITRA_SET_INPUT__;
    };
  }, []);

  const clearAutoSendTimer = () => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAttachment(file);
    if (!validation.valid) {
      showToast('error', 'Unsupported file type', validation.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    showToast('info', 'File selected', file.name);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = () => {
    clearAutoSendTimer();
    const trimmed = value.trim();
    if ((!trimmed && !selectedFile) || disabled || isThinking) return;
    const msgToSend = selectedFile
      ? (trimmed ? `${trimmed} [Attached file: ${selectedFile.name}]` : `[Attached file: ${selectedFile.name}]`)
      : trimmed;
    onSend(msgToSend, false);
    setValue('');
    clearSelectedFile();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    clearAutoSendTimer();
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, isMobile ? 100 : 120) + 'px';
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const stopActiveStream = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      activeStreamRef.current = null;
    }
  };

  // ── Cancel Voice Input (Stops & Discards) ─────
  const cancelVoiceInput = () => {
    clearAutoSendTimer();
    setIsListening(false);
    if ((window as any)._activeRecognition) {
      try {
        (window as any)._activeRecognition.onend = null;
        (window as any)._activeRecognition.abort();
      } catch {}
      (window as any)._activeRecognition = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }
    stopActiveStream();
    transcriptRef.current = '';
    setValue('');
    showToast('info', 'Voice input cancelled.');
  };

  // ── Finish & Send Voice Input ─────
  const stopAndSendVoiceInput = () => {
    clearAutoSendTimer();
    setIsListening(false);
    if ((window as any)._activeRecognition) {
      try { (window as any)._activeRecognition.stop(); } catch {}
      (window as any)._activeRecognition = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    stopActiveStream();

    const textToSend = transcriptRef.current.trim() || value.trim();
    if (textToSend) {
      onSend(textToSend, true);
      setValue('');
      transcriptRef.current = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } else {
      showToast('info', 'No speech detected.');
    }
  };

  // ── Toggle Voice Input (Start or Finish) ─────
  const toggleVoiceInput = () => {
    clearAutoSendTimer();
    if (isListening) {
      stopAndSendVoiceInput();
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // ── Strategy A: Native Web Speech API ─────
    if (SR) {
      try {
        transcriptRef.current = '';
        const recognition = new SR();
        (window as any)._activeRecognition = recognition;

        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          showToast('info', '🎙️ Listening... Speak now');
        };

        recognition.onresult = (event: any) => {
          let currentText = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentText += event.results[i][0].transcript;
          }
          if (currentText) {
            transcriptRef.current = currentText;
            setValue(currentText);
          }
        };

        recognition.onerror = (err: any) => {
          console.warn('SpeechRecognition notice:', err.error);
          if (err.error !== 'aborted') {
            setIsListening(false);
            try { (window as any)._activeRecognition?.stop(); } catch {}
            (window as any)._activeRecognition = null;
            startMediaRecorderFallback();
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          const finalSpeech = transcriptRef.current.trim() || value.trim();
          if (finalSpeech) {
            setValue(finalSpeech);
            showToast('info', 'Voice captured! Auto-sending in 5s — tap X to cancel.', 'reminder');
            clearAutoSendTimer();
            autoSendTimerRef.current = setTimeout(() => {
              const currentVal = transcriptRef.current.trim() || value.trim() || finalSpeech;
              if (currentVal) {
                onSend(currentVal, true);
                setValue('');
                transcriptRef.current = '';
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
              }
            }, 5000);
          } else {
            // If Web Speech yielded no text, try MediaRecorder fallback
            startMediaRecorderFallback();
          }
        };

        recognition.start();
        return;
      } catch (err) {
        console.warn('SpeechRecognition failed to start, falling back to MediaRecorder:', err);
      }
    }

    // ── Strategy B: MediaRecorder + Backend STT Whisper Fallback ─────
    startMediaRecorderFallback();
  };

  const startMediaRecorderFallback = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('error', 'Microphone is not supported on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      audioChunksRef.current = [];

      const supportedMime = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg'
      ].find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || '';

      const mediaRecorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stopActiveStream();
        setIsListening(false);

        const existingVal = value.trim();
        if (existingVal) {
          showToast('info', 'Voice captured! Tap check to send or X to cancel.');
          return;
        }

        if (audioChunksRef.current.length > 0) {
          showToast('info', 'Transcribing speech audio...');
          try {
            const actualType = mediaRecorder.mimeType || supportedMime || 'audio/mp4';
            const ext = actualType.includes('webm') ? 'webm' : actualType.includes('mp4') ? 'mp4' : actualType.includes('aac') ? 'aac' : 'm4a';
            const blob = new Blob(audioChunksRef.current, { type: actualType });
            const formData = new FormData();
            formData.append('file', blob, `voice_${Date.now()}.${ext}`);

            // Primary active backend endpoint & relative fallback
            const sttEndpoints = [
              `${getApiBase()}/api/stt`,
              '/api/stt',
            ];

            let data: any = null;
            let success = false;

            for (const endpoint of sttEndpoints) {
              try {
                const response = await fetch(endpoint, {
                  method: 'POST',
                  headers: getAuthHeaders({ contentType: null }),
                  body: formData,
                });
                if (response.ok) {
                  data = await response.json();
                  success = true;
                  break;
                }
              } catch (e) {
                console.warn(`STT endpoint ${endpoint} failed, trying next fallback...`);
              }
            }

            if (success && data && data.text && data.text.trim()) {
              const transcribedText = data.text.trim();
              setValue(transcribedText);
              transcriptRef.current = transcribedText;
              showToast('info', 'Voice transcribed! Auto-sending in 5s — tap X to cancel.', 'reminder');
              clearAutoSendTimer();
              autoSendTimerRef.current = setTimeout(() => {
                const currentVal = transcriptRef.current.trim() || value.trim() || transcribedText;
                if (currentVal) {
                  onSend(currentVal, true);
                  setValue('');
                  transcriptRef.current = '';
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                }
              }, 5000);
            } else {
              showToast('error', 'Could not transcribe speech. Please speak clearly and try again.');
            }
          } catch (err) {
            console.warn('STT API request failed:', err);
            showToast('error', 'Speech transcription service unavailable.');
          }
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);
      showToast('info', '🎙️ Recording voice... Speak now');
    } catch (err: any) {
      stopActiveStream();
      setIsListening(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('error', 'Microphone permission denied in browser settings.');
      } else {
        showToast('error', 'Could not start audio recorder on this device.');
      }
    }
  };

  return (
    <div className="zone-input bg-surface-raised border-t border-border-subtle py-2 sm:py-2.5">
      <div className="companion-container flex flex-col gap-1.5 sm:gap-2">
        {draftEditState ? (
          <div id="email-draft-edit-composer" className="flex flex-col gap-2.5 w-full py-1">
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-brand/20 text-brand-light flex items-center justify-center">
                  <Mail size={12} />
                </div>
                <span className="text-xs font-semibold text-text-primary tracking-wide">
                  Editing email draft
                </span>
                {draftEditState.draftId && (
                  <span className="text-3xs font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-base border border-border-subtle" title="Draft ID">
                    ID: {draftEditState.draftId.slice(0, 10)}...
                  </span>
                )}
              </div>
              <button
                id="draft-edit-close"
                type="button"
                onClick={() => setDraftEditState(null)}
                className="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-surface-overlay"
                title="Cancel and close editor"
                aria-label="Cancel and close editor"
              >
                <X size={14} />
              </button>
            </div>

            {/* Error Alert */}
            {draftSubmitError && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-2xs text-red-300">
                {draftSubmitError}
              </div>
            )}

            {/* Structured Fields */}
            <div className="flex flex-col gap-2 text-xs">
              {/* To Field */}
              <div className="flex items-center gap-2 bg-surface-overlay px-2.5 py-1.5 rounded-lg border border-border-subtle">
                <span className="text-text-muted font-medium w-16 flex-shrink-0">To:</span>
                <input
                  id="draft-edit-to"
                  type="email"
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="bg-transparent flex-1 text-text-primary outline-none text-xs placeholder:text-text-muted/60"
                />
              </div>

              {/* Subject Field */}
              <div className="flex items-center gap-2 bg-surface-overlay px-2.5 py-1.5 rounded-lg border border-border-subtle">
                <span className="text-text-muted font-medium w-16 flex-shrink-0">Subject:</span>
                <input
                  id="draft-edit-subject"
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Email subject"
                  className="bg-transparent flex-1 text-text-primary outline-none text-xs placeholder:text-text-muted/60"
                />
              </div>

              {/* Message / Body Field */}
              <div className="flex flex-col gap-1">
                <span className="text-text-muted font-medium text-2xs px-1">Message:</span>
                <textarea
                  id="draft-edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Write your email message..."
                  rows={3}
                  className="w-full bg-surface-overlay text-text-primary text-xs rounded-lg px-3 py-2 border border-border-subtle focus:outline-none focus:border-brand/50 resize-y leading-relaxed placeholder:text-text-muted/60 min-h-[70px] max-h-[200px]"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-border-subtle">
              <button
                id="draft-edit-cancel"
                type="button"
                disabled={isSubmittingDraft}
                onClick={() => setDraftEditState(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary bg-surface-overlay border border-border-subtle hover:bg-surface-raised hover:text-text-primary transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="draft-edit-submit"
                type="button"
                disabled={isSubmittingDraft || !editTo.trim() || !editBody.trim()}
                onClick={handleDraftSubmit}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-light transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingDraft ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Preparing...</span>
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Quick actions */}
            {showQuick && !value && !isListening && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex gap-1.5 flex-wrap"
              >
                {quickActions.map(qa => (
                  <button
                    key={qa.value}
                    onClick={() => { onSend(qa.value); setShowQuick(false); }}
                    className="text-2xs px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle hover:border-brand/40 hover:text-brand-light text-text-muted transition-colors cursor-pointer"
                  >
                    {qa.label}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Hidden file input for attachment foundation */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md,.json,.csv,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
            />

            {/* Selected Attachment Preview */}
            {selectedFile && (
              <div className="flex items-center gap-2 px-2.5 py-1 mb-1.5 rounded-lg bg-surface-overlay border border-border-default text-xs text-text-primary w-fit max-w-full select-none shadow-sm animate-in fade-in duration-150">
                <Paperclip size={12} className="text-brand-light flex-shrink-0" />
                <span className="truncate max-w-[200px] sm:max-w-[280px] font-medium text-text-primary">{selectedFile.name}</span>
                <span className="text-text-muted text-3xs">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  className="text-text-muted hover:text-red-400 p-0.5 rounded transition-colors ml-1 cursor-pointer"
                  aria-label="Remove attached file"
                  title="Remove attached file"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Input container */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Quick action toggle */}
              {!isListening && (
                <button
                  onClick={() => setShowQuick(!showQuick)}
                  className={cn(
                    'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    showQuick ? 'bg-brand-muted text-brand-light' : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay',
                  )}
                  aria-label="Quick actions"
                  title="Quick prompts"
                >
                  <Zap size={14} />
                </button>
              )}

              {/* Textarea wrapper */}
              <div className="flex-1 relative min-w-0 flex items-center">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={value}
                  onChange={handleChange}
                  onKeyDown={handleKey}
                  placeholder={
                    isListening
                      ? 'Listening... Speak into your mic'
                      : isThinking
                      ? 'Mitra is thinking... Click Stop to cancel'
                      : disabled
                      ? 'Processing...'
                      : 'Ask Mitra anything...'
                  }
                  disabled={disabled}
                  className={cn(
                    'w-full bg-surface-overlay text-text-primary text-xs sm:text-sm rounded-lg px-3 py-2 border transition-colors resize-none overflow-y-auto leading-relaxed placeholder:text-text-muted/60',
                    isListening ? 'border-red-500/60 bg-red-500/5 text-red-300 animate-pulse' : 'border-border-subtle focus:outline-none focus:border-brand/50',
                  )}
                  style={{ maxHeight: isMobile ? '100px' : '120px' }}
                />
              </div>

              {/* Attach file (accessible on mobile + desktop) */}
              {!isListening && (
                <button
                  id="inputbar-attach"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 min-w-[32px] min-h-[32px] items-center justify-center rounded-lg transition-colors flex cursor-pointer",
                    selectedFile
                      ? "bg-brand-muted text-brand-light border border-brand/40"
                      : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay"
                  )}
                  aria-label="Attach file"
                  title="Attach file (PDF, DOCX, TXT, MD, JSON, CSV, JPEG, PNG, WEBP)"
                >
                  <Paperclip size={14} />
                </button>
              )}

              {/* Live Audio Waveform Animation when recording */}
              {isListening && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 flex-shrink-0">
                  <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-5 bg-red-400 rounded-full animate-bounce" />
                  <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1 h-4 bg-red-400 rounded-full animate-bounce [animation-delay:-0.4s]" />
                </div>
              )}

              {/* Listening / Recorded Voice Controls: Cancel (X) & Finish (Check) */}
              {isListening ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={cancelVoiceInput}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors cursor-pointer"
                    title="Cancel & clear text"
                    aria-label="Cancel & clear text"
                  >
                    <X size={14} />
                  </button>
                  {/* Send / Stop Button */}
                  <button
                    type="button"
                    onClick={stopAndSendVoiceInput}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30 transition-colors cursor-pointer"
                    title="Finish and send voice message"
                    aria-label="Finish and send voice message"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                /* Mic Button */
                <button
                  id="inputbar-voice"
                  onClick={toggleVoiceInput}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-brand-light hover:bg-brand-muted transition-colors cursor-pointer"
                  aria-label="Voice input"
                  title="Click to speak (Voice STT)"
                >
                  <Mic size={14} />
                </button>
              )}

              {/* Send or Stop Button */}
              {!isListening && (
                isThinking ? (
                  <button
                    id="inputbar-stop"
                    type="button"
                    onClick={onStop}
                    className="flex-shrink-0 w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-all duration-150 active:scale-95 cursor-pointer shadow-glow-sm"
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <Square size={12} className="fill-current text-red-400" />
                  </button>
                ) : (
                  <button
                    id="inputbar-send"
                    type="button"
                    onClick={handleSend}
                    disabled={(!value.trim() && !selectedFile) || disabled}
                    className={cn(
                      'flex-shrink-0 w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg transition-all duration-150 active:scale-95',
                      (value.trim() || selectedFile) && !disabled
                        ? 'bg-brand text-white hover:bg-brand-light shadow-glow-sm cursor-pointer'
                        : 'bg-surface-overlay text-text-muted cursor-not-allowed',
                    )}
                    aria-label="Send message"
                  >
                    <Send size={13} />
                  </button>
                )
              )}
            </div>

            {/* Hint — only on desktop */}
            <div className="flex items-center justify-between text-2xs text-text-muted hidden md:flex px-1">
              <span>
                Press <kbd className="px-1 py-0.5 bg-surface-overlay border border-border-subtle rounded text-2xs">Enter</kbd> to send · <kbd className="px-1 py-0.5 bg-surface-overlay border border-border-subtle rounded text-2xs">Shift+Enter</kbd> for line break
              </span>
              <span className="flex items-center gap-1 opacity-70">
                <span>Press</span>
                <kbd className="px-1 py-0.5 bg-surface-overlay border border-border-subtle rounded text-2xs">Ctrl + K</kbd>
                <span>for Command Palette</span>
              </span>
            </div>

            {/* Legal Links Bar */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-text-muted/60 pt-0.5">
              <span>MITRA AI can make mistakes. Verify important info.</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/terms');
                  (window as any).__MITRA_NAV__?.('terms');
                }}
                className="hover:text-brand-light transition-colors underline decoration-dotted cursor-pointer bg-transparent border-0 p-0 text-[10px] text-text-muted/60"
              >
                Terms of Service
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/privacy');
                  (window as any).__MITRA_NAV__?.('privacy');
                }}
                className="hover:text-brand-light transition-colors underline decoration-dotted cursor-pointer bg-transparent border-0 p-0 text-[10px] text-text-muted/60"
              >
                Privacy Policy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InputBar;
