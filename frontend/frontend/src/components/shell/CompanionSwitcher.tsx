// components/shell/CompanionSwitcher.tsx — Switch Mitra Companion Avatar & Presets
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Upload, RotateCcw, Check, X, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore, toggleMitraChatbotWindow } from '../../store/companion.store';
import { showToast } from './Toast';

export interface CompanionPreset {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  avatarUrl: string;
}

export const COMPANION_PRESETS: CompanionPreset[] = [
  {
    id: 'official-companion',
    name: 'Mitra Companion',
    subtitle: 'Official AI Companion (Default)',
    badge: '🤖 Companion',
    avatarUrl: '/assets/mitra_avatar_default.png',
  },
  {
    id: 'cyber-holo',
    name: 'Cyber Hologram',
    subtitle: 'Neon cybernetic matrix entity',
    badge: '⚡ Cyber',
    avatarUrl: '/assets/preset_cyber_holo.png',
  },
  {
    id: 'cosmic-sphere',
    name: 'Cosmic AI',
    subtitle: 'Deep cosmos sphere companion',
    badge: '🌌 Cosmic',
    avatarUrl: '/assets/preset_cosmic_sphere.png',
  },
  {
    id: 'quantum-orb',
    name: 'Quantum Orb',
    subtitle: 'Quantum neural core assistant',
    badge: '🔮 Quantum',
    avatarUrl: '/assets/preset_quantum_orb.png',
  },
];

export const CompanionSwitcher: React.FC = () => {
  const { companionAvatar, companionName, setCompanionAvatar, chatbotOpen } = useCompanionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync avatar error reset when avatar changes
  useEffect(() => {
    setAvatarError(false);
  }, [companionAvatar]);

  // Sync with web component avatar changes
  useEffect(() => {
    const handleAvatarUpdate = (e: any) => {
      const avatar = e.detail?.companionAvatar || e.detail?.avatar || (typeof localStorage !== 'undefined' ? (localStorage.getItem('mitra_companion_asset') || localStorage.getItem('mitra_avatar_custom') || localStorage.getItem('mitra_custom_avatar')) : null);
      const current = useCompanionStore.getState().companionAvatar;
      if (avatar && avatar !== 'default' && avatar !== current) {
        useCompanionStore.getState().setCompanionAvatar(avatar, 'Custom Companion');
      }
    };
    window.addEventListener('mitra:companion-changed', handleAvatarUpdate);
    window.addEventListener('mitra:avatar-changed', handleAvatarUpdate);
    window.addEventListener('storage', handleAvatarUpdate);
    return () => {
      window.removeEventListener('mitra:companion-changed', handleAvatarUpdate);
      window.removeEventListener('mitra:avatar-changed', handleAvatarUpdate);
      window.removeEventListener('storage', handleAvatarUpdate);
    };
  }, []);

  // Sync with web component chatbot open/close state
  useEffect(() => {
    const handleOrbState = (e: any) => {
      const isOpen = Boolean(e.detail?.open);
      useCompanionStore.getState().setChatbotOpen(isOpen);
    };
    window.addEventListener('mitra:orb-state-changed', handleOrbState);
    return () => {
      window.removeEventListener('mitra:orb-state-changed', handleOrbState);
    };
  }, []);

  const handleSelectPreset = (preset: CompanionPreset) => {
    setCompanionAvatar(preset.avatarUrl, preset.name);
    showToast('success', 'Companion Updated', `Switched to ${preset.name}`);
    setIsOpen(false);
  };

  const handleResetDefault = () => {
    const defaultPreset = COMPANION_PRESETS[0];
    setCompanionAvatar(defaultPreset.avatarUrl, defaultPreset.name);
    showToast('info', 'Reset to Default', 'Restored official Mitra companion avatar');
    setIsOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Invalid File', 'Please upload a PNG, JPG, GIF, or WebP image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'File Too Large', 'Please upload an image under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCompanionAvatar(result, 'Custom Companion');
        showToast('success', 'Custom Companion Set', 'Your uploaded avatar is now active');
        setIsOpen(false);
      }
    };
    reader.readAsDataURL(file);

    // Reset file input value so same file can be uploaded again if needed
    e.target.value = '';
  };

  // Determine current active preset id if matching
  const currentPreset = COMPANION_PRESETS.find(
    p => p.avatarUrl === companionAvatar || p.name === companionName
  );

  return (
    <div className="relative flex-shrink-0">
      {/* ── TopBar Trigger Button: Official Mitra Avatar Icon ── */}
      <button
        id="topbar-companion-switcher-btn"
        onClick={() => {
          const opened = toggleMitraChatbotWindow();
          showToast('info', 'MITRA Companion', opened ? 'Chatbot opened' : 'Chatbot closed');
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-9 h-9 min-w-[36px] min-h-[36px] rounded-full p-0.5 flex items-center justify-center transition-all cursor-pointer relative group active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          chatbotOpen
            ? "border-2 border-brand shadow-glow ring-2 ring-brand/40 scale-105"
            : "border border-brand/50 hover:border-brand bg-surface-overlay hover:bg-surface-hover hover:shadow-glow shadow-xs"
        )}
        title={`Mitra Companion: ${companionName} (Click to toggle Chatbot)`}
        aria-label="Open Mitra Companion Chatbot"
        aria-expanded={chatbotOpen}
      >
        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-brand/20">
          {!avatarError ? (
            <img
              src={companionAvatar || '/assets/mitra_avatar_default.png'}
              alt={companionName || 'Mitra Companion'}
              className="w-full h-full object-cover rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-110"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <Bot size={16} className="text-brand-light" />
          )}
        </div>

        {/* Live Active Status Indicator Dot */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-state-success border-2 border-surface-raised shadow-xs animate-pulse"
          title="Mitra Active"
        />
      </button>

      {/* ── Companion Switcher Dropdown Modal / Popover ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop click dismiss */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-11 w-72 sm:w-80 p-3.5 rounded-2xl bg-surface-elevated border border-border-default shadow-2xl z-50 flex flex-col gap-3 select-none max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain"
              role="dialog"
              aria-label="Switch Mitra Companion"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center text-brand-light">
                    <Sparkles size={13} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-text-primary tracking-tight">Mitra Companion</h3>
                    <p className="text-[10px] text-text-muted">Switch persona or customize avatar</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Active Companion Banner */}
              <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/25 flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full border-2 border-brand/60 overflow-hidden flex-shrink-0 shadow-sm bg-brand/20">
                  <img
                    src={companionAvatar || '/assets/mitra_avatar_default.png'}
                    alt="Active Companion"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/mitra_avatar_default.png';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-state-success uppercase tracking-wider">Active Companion</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-state-success" />
                  </div>
                  <div className="text-xs font-bold text-text-primary truncate mt-0.5">
                    {companionName || 'Mitra Companion'}
                  </div>
                </div>
              </div>

              {/* Preset Companions List */}
              <div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5 px-1">
                  Preset Companions
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {COMPANION_PRESETS.map((preset) => {
                    const isSelected =
                      companionAvatar === preset.avatarUrl ||
                      (currentPreset && currentPreset.id === preset.id);

                    return (
                      <button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className={cn(
                          "flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all cursor-pointer group active:scale-[0.98]",
                          isSelected
                            ? "bg-brand/15 border-brand/60 text-text-primary shadow-xs"
                            : "bg-surface-overlay hover:bg-surface-hover border-border-subtle/80 text-text-secondary hover:text-text-primary"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border transition-transform group-hover:scale-105",
                          isSelected ? "border-brand ring-1 ring-brand/40" : "border-border-subtle"
                        )}>
                          <img
                            src={preset.avatarUrl}
                            alt={preset.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/assets/mitra_avatar_default.png';
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-text-primary truncate">
                              {preset.name}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-raised text-brand-light font-medium flex-shrink-0 border border-border-subtle">
                              {preset.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-text-muted truncate mt-0.5">
                            {preset.subtitle}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons: Custom Upload & Reset */}
              <div className="pt-2 border-t border-border-subtle flex flex-col gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-8 px-3 rounded-xl bg-surface-overlay hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
                >
                  <Upload size={13} className="text-brand-light" />
                  <span>Upload Custom Avatar</span>
                </button>

                <button
                  onClick={handleResetDefault}
                  className="w-full h-8 px-3 rounded-xl bg-surface-overlay/50 hover:bg-surface-overlay border border-border-subtle/60 text-text-muted hover:text-text-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                >
                  <RotateCcw size={11} />
                  <span>Reset to Official Default</span>
                </button>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/gif, image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompanionSwitcher;
