// components/shell/CompanionSwitcher.tsx — Switch Mitra Companion Avatar & Presets
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Upload, RotateCcw, Check, X, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCompanionStore, toggleMitraChatbotWindow } from '../../store/companion.store';
import { companionStorage } from '../../services/companionStorage';
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

export function isVideoAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const s = url.toLowerCase();
  return (
    s.startsWith('data:video/') ||
    s.includes('.mp4') ||
    s.includes('.webm') ||
    s.includes('video/mp4') ||
    s.includes('video/webm')
  );
}

export const CompanionAvatarMedia: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = "w-full h-full object-cover" }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return <Bot size={16} className="text-brand-light" />;
  }

  if (isVideoAssetUrl(src)) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (src !== '/assets/mitra_avatar_default.png') {
          setHasError(true);
        }
      }}
    />
  );
};

export const CompanionSwitcher: React.FC = () => {
  const { companionAvatar, companionName, setCompanionAvatar, chatbotOpen } = useCompanionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore avatar from high-capacity IndexedDB on mount if available
  useEffect(() => {
    companionStorage.getAsset('current_companion').then((asset) => {
      if (asset && asset !== 'default' && asset.length > 20) {
        const current = useCompanionStore.getState().companionAvatar;
        if (current !== asset) {
          useCompanionStore.getState().setCompanionAvatar(asset, 'Custom Companion');
        }
      }
    }).catch(() => {});
  }, []);

  // Sync with web component avatar changes
  useEffect(() => {
    const handleAvatarUpdate = (e: any) => {
      const avatar =
        e.detail?.companionAvatar ||
        e.detail?.avatar ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('mitra_companion_asset') ||
            localStorage.getItem('mitra_avatar_custom') ||
            localStorage.getItem('mitra_custom_avatar')
          : null);
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
      const isWindowOpen = Boolean(e.detail?.open);
      useCompanionStore.getState().setChatbotOpen(isWindowOpen);
    };
    window.addEventListener('mitra:orb-state-changed', handleOrbState);
    return () => {
      window.removeEventListener('mitra:orb-state-changed', handleOrbState);
    };
  }, []);

  const handleSelectPreset = async (preset: CompanionPreset) => {
    setCompanionAvatar(preset.avatarUrl, preset.name);
    await companionStorage.setAsset('current_companion', preset.avatarUrl);
    showToast('success', 'Companion Updated', `Switched to ${preset.name}`);
    setIsOpen(false);
  };

  const handleResetDefault = async () => {
    const defaultPreset = COMPANION_PRESETS[0];
    setCompanionAvatar(defaultPreset.avatarUrl, defaultPreset.name);
    await companionStorage.removeAsset('current_companion');
    showToast('info', 'Reset to Default', 'Restored official Mitra companion avatar');
    setIsOpen(false);
  };

  const processFile = async (file: File) => {
    const isImage = file.type ? file.type.startsWith('image/') : false;
    const isVideo =
      file.type ? file.type.startsWith('video/') :
      (file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.webm'));

    if (!isImage && !isVideo) {
      showToast('error', 'Unsupported Format', 'Please upload PNG, JPG, GIF, WebP, MP4, or WebM');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      showToast('error', 'File Too Large', 'Please upload a companion asset under 30MB');
      return;
    }

    const companionTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Custom Companion';

    // 1. Instant 0ms local preview via object URL
    const previewUrl = URL.createObjectURL(file);
    setCompanionAvatar(previewUrl, companionTitle);
    showToast('success', 'Companion Uploaded', `${file.name} is now your active companion`);
    setIsOpen(false);

    // 2. Read full Data URL in background to persist across reboots in IndexedDB
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCompanionAvatar(dataUrl, companionTitle);
        await companionStorage.setAsset('current_companion', dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Determine current active preset id if matching
  const currentPreset = COMPANION_PRESETS.find(
    p => p.avatarUrl === companionAvatar || p.name === companionName
  );

  const isVideoActive = isVideoAssetUrl(companionAvatar);

  return (
    <div className="relative flex-shrink-0">
      {/* ── TopBar Trigger Button: Official Mitra Avatar Icon ── */}
      <button
        id="topbar-companion-switcher-btn"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-9 h-9 min-w-[36px] min-h-[36px] rounded-full p-0.5 flex items-center justify-center transition-all cursor-pointer relative group active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          isOpen || chatbotOpen
            ? "border-2 border-brand shadow-glow ring-2 ring-brand/40 scale-105"
            : "border border-brand/50 hover:border-brand bg-surface-overlay hover:bg-surface-hover hover:shadow-glow shadow-xs"
        )}
        title="Mitra Companion: Click to choose avatar or switch persona"
        aria-label="Open Mitra Companion Customizer"
        aria-expanded={isOpen}
      >
        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-brand/20">
          <CompanionAvatarMedia
            src={companionAvatar || '/assets/mitra_avatar_default.png'}
            alt={companionName || 'Mitra Companion'}
            className="w-full h-full object-cover rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-110"
          />
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
              aria-label="Custom Companion System"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center text-brand-light">
                    <Sparkles size={13} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-text-primary tracking-tight">Custom Companion</h3>
                    <p className="text-[10px] text-text-muted">Choose persona or upload custom asset</p>
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

              {/* Supported Formats Banner */}
              <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-surface-overlay border border-border-subtle text-[10px] text-text-muted">
                <span className="font-semibold text-text-secondary">Supported Formats:</span>
                <span className="font-mono text-brand-light font-bold">PNG · JPG · GIF · WebP · MP4</span>
              </div>

              {/* Active Companion Banner */}
              <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/25 flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full border-2 border-brand/60 overflow-hidden flex-shrink-0 shadow-sm bg-brand/20 flex items-center justify-center">
                  <CompanionAvatarMedia
                    src={companionAvatar || '/assets/mitra_avatar_default.png'}
                    alt="Active Companion"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-state-success uppercase tracking-wider">
                      {isVideoActive ? '🎬 Looping Video Active' : 'Active Companion'}
                    </span>
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
                          "w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border transition-transform group-hover:scale-105 bg-brand/10",
                          isSelected ? "border-brand ring-1 ring-brand/40" : "border-border-subtle"
                        )}>
                          <CompanionAvatarMedia
                            src={preset.avatarUrl}
                            alt={preset.name}
                            className="w-full h-full object-cover"
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

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "p-3 rounded-xl border border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                  isDragOver
                    ? "border-brand bg-brand/20 scale-[1.01]"
                    : "border-border-default/80 bg-surface-overlay/60 hover:bg-surface-hover hover:border-brand/60"
                )}
              >
                <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand-light mb-1">
                  <Upload size={14} />
                </div>
                <p className="text-xs font-semibold text-text-primary">
                  Upload Custom Companion
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Drag & drop PNG, JPG, GIF, WebP, or MP4
                </p>
                <span className="mt-1 text-[9px] text-brand-light font-medium">
                  ✨ Transparency &amp; Animations Preserved
                </span>
              </div>

              {/* Action Buttons: Toggle Chatbot & Reset */}
              <div className="pt-2 border-t border-border-subtle flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    const opened = toggleMitraChatbotWindow();
                    showToast('info', 'MITRA Companion', opened ? 'Chatbot opened' : 'Chatbot closed');
                    setIsOpen(false);
                  }}
                  className="w-full h-8 px-3 rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 text-brand-light text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
                >
                  <Bot size={13} />
                  <span>{chatbotOpen ? 'Close Floating Chatbot' : 'Open Floating Chatbot'}</span>
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
                  accept="image/png, image/jpeg, image/jpg, image/gif, image/webp, video/mp4, video/webm"
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
