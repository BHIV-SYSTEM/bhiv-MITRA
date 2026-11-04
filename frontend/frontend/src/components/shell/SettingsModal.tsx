// components/shell/SettingsModal.tsx — Settings with theme toggle & user profile
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Monitor, User, Key, Palette, Info, Check, Sparkles, Shield, Send } from 'lucide-react';
import { useCompanionStore } from '../../store/companion.store';
import { showToast } from './Toast';
import { CompanionAvatarMedia, COMPANION_PRESETS } from './CompanionSwitcher';
import { companionStorage } from '../../services/companionStorage';
import { Upload, RotateCcw } from 'lucide-react';

type Theme = 'dark' | 'emerald' | 'violet' | 'light' | 'system';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const { userName, setUserName, apiBase, companionAvatar, companionName, setCompanionAvatar } = useCompanionStore();
  const fileInputSettingsRef = React.useRef<HTMLInputElement>(null);

  const handleSettingsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type ? file.type.startsWith('image/') : false;
    const isVideo = file.type ? file.type.startsWith('video/') : (file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.webm'));

    if (!isImage && !isVideo) {
      showToast('error', 'Unsupported Format', 'Please upload PNG, JPG, GIF, WebP, MP4, or WebM');
      return;
    }

    const title = file.name.replace(/\.[^/.]+$/, '').trim() || 'Custom Companion';
    const previewUrl = URL.createObjectURL(file);
    setCompanionAvatar(previewUrl, title);
    showToast('success', 'Companion Updated', `${file.name} is now your active companion`);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        setCompanionAvatar(dataUrl, title);
        await companionStorage.setAsset('current_companion', dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSettingsResetDefault = async () => {
    const defaultPreset = COMPANION_PRESETS[0];
    setCompanionAvatar(defaultPreset.avatarUrl, defaultPreset.name);
    await companionStorage.removeAsset('current_companion');
    showToast('info', 'Reset to Default', 'Restored official Mitra companion avatar');
  };
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('mitra-theme') as Theme) || 'dark';
  });
  const [localName, setLocalName] = useState(userName);

  // Keep localName synced when modal opens
  useEffect(() => {
    if (open) setLocalName(userName);
  }, [open, userName]);

  // Apply theme dynamically
  useEffect(() => {
    const root = document.documentElement;
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', resolved);
    localStorage.setItem('mitra-theme', theme);
  }, [theme]);

  const handleSaveName = () => {
    const cleanName = localName.trim() || 'User';
    setUserName(cleanName);
    localStorage.setItem('mitra_user_name', cleanName);
    showToast('success', 'Settings Saved', `Display name updated to "${cleanName}"`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="settings-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button onClick={onClose} className="settings-close"><X size={16} /></button>
            </div>

            {/* Sections */}
            <div className="settings-body">
              {/* Appearance */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Palette size={14} /> Appearance</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {([
                    { value: 'dark', icon: <Moon size={15} />, label: 'Midnight' },
                    { value: 'emerald', icon: <Sparkles size={15} className="text-emerald-400" />, label: 'Emerald' },
                    { value: 'violet', icon: <Sparkles size={15} className="text-violet-400" />, label: 'Violet' },
                    { value: 'light', icon: <Sun size={15} className="text-amber-400" />, label: 'Light' },
                    { value: 'system', icon: <Monitor size={15} />, label: 'System' },
                  ] as { value: Theme; icon: React.ReactNode; label: string }[]).map(t => (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        theme === t.value
                          ? 'border-brand bg-brand/15 text-brand-light shadow-sm'
                          : 'border-border-subtle bg-surface-overlay text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Companion Appearance & Avatar */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Sparkles size={14} className="text-brand-light" /> Custom Companion System</h3>
                <div className="p-3 rounded-2xl bg-surface-overlay border border-border-subtle mt-2 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-brand/60 overflow-hidden flex-shrink-0 bg-brand/20 shadow-sm flex items-center justify-center">
                      <CompanionAvatarMedia
                        src={companionAvatar || '/assets/mitra_avatar_default.png'}
                        alt={companionName || 'Active Companion'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-text-primary truncate">
                        {companionName || 'Mitra Companion'}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5 font-mono">
                        PNG · JPG · GIF · WebP · MP4
                      </div>
                      <div className="text-[10px] text-brand-light font-medium mt-0.5">
                        ✨ Transparency &amp; Animations Preserved
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputSettingsRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 text-brand-light text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload size={13} /> Upload Asset
                    </button>
                    <button
                      type="button"
                      onClick={handleSettingsResetDefault}
                      className="px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface-elevated border border-border-subtle text-text-muted hover:text-text-primary text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={12} /> Reset Default
                    </button>
                  </div>

                  {/* Preset Choices */}
                  <div>
                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                      Choose Preset
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {COMPANION_PRESETS.map((p) => {
                        const isSel = companionAvatar === p.avatarUrl;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={async () => {
                              setCompanionAvatar(p.avatarUrl, p.name);
                              await companionStorage.setAsset('current_companion', p.avatarUrl);
                              showToast('success', 'Companion Updated', `Switched to ${p.name}`);
                            }}
                            className={`p-1.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                              isSel ? 'border-brand bg-brand/20 text-text-primary' : 'border-border-subtle bg-surface-overlay text-text-muted hover:text-text-primary'
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-brand/10">
                              <CompanionAvatarMedia src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-[11px] font-semibold truncate">{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    ref={fileInputSettingsRef}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/gif, image/webp, video/mp4, video/webm"
                    onChange={handleSettingsFileUpload}
                    className="hidden"
                  />
                </div>
              </section>

              {/* Profile */}
              <section className="settings-section">
                <h3 className="settings-section-title"><User size={14} /> Profile</h3>
                <div className="settings-field">
                  <label className="settings-label">Display Name</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text" value={localName}
                      onChange={e => setLocalName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); }}
                      className="settings-input flex-1"
                      placeholder="Your name"
                    />
                    <button
                      onClick={handleSaveName}
                      className="px-3 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              </section>

              {/* Connection */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Key size={14} /> Connection</h3>
                <div className="settings-field">
                  <label className="settings-label">API Endpoint</label>
                  <div className="settings-value">{apiBase}</div>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Status</label>
                  <div className="settings-value">
                    <span className="settings-status-dot" /> Connected
                  </div>
                </div>
              </section>

              {/* Telegram Integration */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Send size={14} className="text-sky-400" /> Telegram Bot Integration</h3>
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-3 mt-2">
                  <div>
                    <div className="text-xs font-semibold text-white">@blackhole_mitra_bot</div>
                    <div className="text-3xs text-sky-300/80 mt-0.5">Chat directly with MITRA AI Assistant on Telegram</div>
                  </div>
                  <a
                    href="https://t.me/blackhole_mitra_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1 transition-colors no-underline whitespace-nowrap"
                  >
                    Chat on Telegram →
                  </a>
                </div>
              </section>

              {/* About */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Info size={14} /> About</h3>
                <p className="settings-about">Mitra v5.0.0 — Universal AI Companion</p>
                <p className="settings-about-sub">11 capabilities · Email · Calendar · WhatsApp · Tasks · Reminders</p>
              </section>

              {/* Legal & Compliance */}
              <section className="settings-section">
                <h3 className="settings-section-title"><Shield size={14} /> Legal & Compliance</h3>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline flex items-center gap-1 font-medium">
                    Terms of Service ↗
                  </a>
                  <span className="text-text-muted">·</span>
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline flex items-center gap-1 font-medium">
                    Privacy Policy ↗
                  </a>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="settings-footer">
              <button onClick={onClose} className="settings-btn-cancel">Cancel</button>
              <button onClick={handleSaveName} className="settings-btn-save">Save Changes</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
