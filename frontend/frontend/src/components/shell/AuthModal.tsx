// components/shell/AuthModal.tsx — Impressive Login & Sign Up Modal for MITRA
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Mail, Lock, Sparkles, LogIn, UserPlus, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useCompanionStore, resolveDisplayName } from '../../store/companion.store';
import { CompanionService } from '../../services/companion.service';
import { authApi } from '../../services/authApi';
import { showToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<Props> = ({ open, onClose }) => {
  const { setAuth, isAuthenticated, isGuest, userName, userEmail, logoutUser } = useCompanionStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [guestViewMode, setGuestViewMode] = useState<'summary' | 'form'>('summary');
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Whenever modal opens for a guest, default to the summary view
  useEffect(() => {
    if (open && isGuest) {
      setGuestViewMode('summary');
      setErrorMsg('');
      setConfirmPassword('');
    }
  }, [open, isGuest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (!confirmPassword.trim()) {
        setErrorMsg('Please confirm your password.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const data = await CompanionService.signup(name.trim(), email.trim(), password);
        setAuth(data.user, data.token, false);
        showToast('success', 'Account Created!', `Welcome to Mitra, ${data.user.name}`);
      } else {
        const data = await CompanionService.login(email.trim(), password);
        setAuth(data.user, data.token, false);
        showToast('success', 'Welcome Back!', `Logged in as ${data.user.name}`);
      }
      onClose();
    } catch (err: any) {
      console.warn('Authentication error:', err);
      const msg = err?.message || 'Authentication failed. Please check your credentials.';
      setErrorMsg(msg);
      showToast('error', 'Auth Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await CompanionService.logout();
      const guestData = await CompanionService.guestLogin();
      setAuth(guestData.user, guestData.token, true);
    } catch {
      logoutUser();
    }
    showToast('info', 'Logged Out', 'Switched to Guest session.');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="settings-backdrop"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 m-auto max-w-md h-fit z-[201] p-5 sm:p-6 bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-y-auto flex flex-col gap-5 text-text-primary"
            style={{ width: 'min(440px, 92vw)', maxHeight: '90dvh' }}
          >
            {/* Header Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-brand" />

            {/* Top Row: Brand & Close */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center text-white shadow-md shadow-brand/20">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-text-primary">Mitra Account</h2>
                  <p className="text-xs text-text-secondary">Universal AI Companion</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* 1. Registered Authenticated User View (non-guest) */}
            {isAuthenticated && !isGuest ? (
              <div className="flex flex-col gap-4 py-2">
                <div className="p-4 rounded-xl bg-surface-overlay border border-border-subtle flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-brand/10 border border-brand/30 flex items-center justify-center text-brand font-bold text-lg">
                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-text-primary">
                      <span>{resolveDisplayName({ name: userName, email: userEmail }, isGuest)}</span>
                      <ShieldCheck size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-xs text-text-secondary truncate">{userEmail || 'Active User'}</p>
                  </div>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed">
                  Your companion memory, workflows, calendar, and history are synchronized to your account.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      onClose();
                      (window as any).__MITRA_SETTINGS__?.();
                    }}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-surface-overlay hover:bg-surface-raised border border-border-subtle text-xs font-semibold text-text-primary flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
                  >
                    <User size={15} />
                    <span>Account</span>
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      (window as any).__MITRA_INTEGRATIONS__?.();
                    }}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-surface-overlay hover:bg-surface-raised border border-border-subtle text-xs font-semibold text-text-primary flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
                  >
                    <Sparkles size={15} />
                    <span>Integrations</span>
                  </button>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
                >
                  <LogIn size={15} className="rotate-180" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : isGuest && guestViewMode === 'summary' ? (
              /* 2. Guest Session Summary View */
              <div className="flex flex-col gap-4 py-2">
                <div className="p-4 rounded-xl bg-surface-overlay border border-border-subtle flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
                    <User size={22} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-text-primary">
                      <span>Guest User</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
                        Temporary Session
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary truncate">{userEmail || 'guest@local'}</p>
                  </div>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed">
                  You're using a temporary guest session. Create an account to keep your Mitra experience across devices.
                </p>

                {/* Primary Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setGuestViewMode('form'); setErrorMsg(''); setConfirmPassword(''); }}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-brand hover:bg-brand-light text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand/20 transition-all cursor-pointer active:scale-95"
                  >
                    <LogIn size={15} />
                    <span>Sign In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setGuestViewMode('form'); setErrorMsg(''); setConfirmPassword(''); }}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-surface-overlay hover:bg-surface-raised border border-border-subtle text-text-primary font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <UserPlus size={15} />
                    <span>Create Account</span>
                  </button>
                </div>

                {/* Social Signup from Guest Session */}
                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('google', 'signup');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        }
                      } catch (err: any) {
                        showToast('info', 'Google Sign-In', err?.message || 'Google OAuth ready. Configure GOOGLE_CLIENT_ID in backend .env.');
                      }
                    }}
                    className="min-h-[44px] py-2 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title="Sign up with Google"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span className="truncate">Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('apple', 'signup');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        }
                      } catch (err: any) {
                        showToast('info', 'Apple Sign-In', err?.message || 'Apple Sign-In ready. Configure APPLE_CLIENT_ID in backend .env.');
                      }
                    }}
                    className="min-h-[44px] py-2 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title="Sign up with Apple"
                  >
                    <svg className="w-3.5 h-3.5 fill-current text-text-primary shrink-0" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.85c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.8 1.44-.61.71-1.14 1.86-1 2.97 1.07.08 2.15-.57 2.81-1.37z" />
                    </svg>
                    <span className="truncate">Apple</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('microsoft', 'signup');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        }
                      } catch (err: any) {
                        showToast('info', 'Microsoft Sign-In', err?.message || 'Microsoft OAuth ready. Configure MICROSOFT_CLIENT_ID in backend .env.');
                      }
                    }}
                    className="min-h-[44px] py-2 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title="Sign up with Microsoft"
                  >
                    <div className="w-3.5 h-3.5 grid grid-cols-2 gap-0.5 shrink-0">
                      <div className="bg-[#F25022] rounded-2xs" />
                      <div className="bg-[#7FBA00] rounded-2xs" />
                      <div className="bg-[#00A4EF] rounded-2xs" />
                      <div className="bg-[#FFB900] rounded-2xs" />
                    </div>
                    <span className="truncate">Microsoft</span>
                  </button>
                </div>

                {/* Secondary Action: Continue as Guest */}
                <div className="flex items-center justify-center pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] px-3 py-2 text-xs text-text-secondary hover:text-text-primary font-medium hover:underline cursor-pointer flex items-center justify-center"
                  >
                    Continue as Guest
                  </button>
                </div>
              </div>
            ) : (
              /* 3. Log In / Create Account Form View */
              <div className="flex flex-col gap-4">
                {isGuest && (
                  <button
                    type="button"
                    onClick={() => setGuestViewMode('summary')}
                    className="self-start text-[11px] text-brand-light hover:underline flex items-center gap-1 font-medium cursor-pointer min-h-[32px]"
                  >
                    <span>← Back to Guest Info</span>
                  </button>
                )}

                {/* Tabs */}
                <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-overlay border border-border-subtle text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrorMsg(''); setConfirmPassword(''); }}
                    className={`min-h-[40px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      mode === 'login'
                        ? 'bg-surface-raised text-text-primary shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <LogIn size={14} />
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setErrorMsg(''); setConfirmPassword(''); }}
                    className={`min-h-[40px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      mode === 'signup'
                        ? 'bg-surface-raised text-text-primary shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <UserPlus size={14} />
                    <span>Create Account</span>
                  </button>
                </div>

                {/* Inline Error */}
                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {/* Name field (signup mode) */}
                  {mode === 'signup' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                        Full Name
                      </label>
                      <div className="relative">
                        <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Your full name"
                          className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  {/* Email field */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                      Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                  </div>

                  {/* Confirm Password field (signup mode) */}
                  {mode === 'signup' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand hover:bg-brand-light text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand/20 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                    style={{ backgroundColor: 'var(--brand)', color: '#ffffff' }}
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin text-white" />
                    ) : (
                      <>
                        <span className="text-white font-bold text-xs tracking-wide">{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                        <ArrowRight size={15} className="text-white" />
                      </>
                    )}
                  </button>
                </form>

                {/* OR Divider */}
                <div className="relative my-1 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border-subtle"></div>
                  </div>
                  <span className="relative px-3 bg-surface-elevated text-[10px] font-bold tracking-wider text-text-secondary uppercase">
                    OR
                  </span>
                </div>

                {/* Social OAuth Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('google', mode === 'signup' ? 'signup' : 'login');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        } else {
                          showToast('info', 'Google Sign-In', 'Google OAuth client ready. Configure GOOGLE_CLIENT_ID in backend .env to authorize.');
                        }
                      } catch (err: any) {
                        showToast('info', 'Google Sign-In', err?.message || 'Google OAuth endpoint ready. Connect backend .env GOOGLE_CLIENT_ID to complete OAuth flow.');
                      }
                    }}
                    className="min-h-[44px] w-full py-2.5 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title={mode === 'signup' ? "Sign up with Google" : "Sign in with Google"}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span className="truncate">Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('apple', mode === 'signup' ? 'signup' : 'login');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        } else {
                          showToast('info', 'Apple Sign-In', 'Apple OAuth client ready. Configure APPLE_CLIENT_ID in backend .env to authorize.');
                        }
                      } catch (err: any) {
                        showToast('info', 'Apple Sign-In', err?.message || 'Apple OAuth endpoint ready. Connect backend .env APPLE_CLIENT_ID to complete OAuth flow.');
                      }
                    }}
                    className="min-h-[44px] w-full py-2.5 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title={mode === 'signup' ? "Sign up with Apple" : "Sign in with Apple"}
                  >
                    <svg className="w-4 h-4 fill-current text-text-primary shrink-0" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.85c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.8 1.44-.61.71-1.14 1.86-1 2.97 1.07.08 2.15-.57 2.81-1.37z" />
                    </svg>
                    <span className="truncate">Apple</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await authApi.startOAuth('microsoft', mode === 'signup' ? 'signup' : 'login');
                        const targetUrl = data?.url || data?.auth_url;
                        if (targetUrl) {
                          window.location.href = targetUrl;
                        } else {
                          showToast('info', 'Microsoft Sign-In', 'Microsoft OAuth client ready. Configure MICROSOFT_CLIENT_ID in backend .env to authorize.');
                        }
                      } catch (err: any) {
                        showToast('info', 'Microsoft Sign-In', err?.message || 'Microsoft OAuth endpoint ready. Connect backend .env MICROSOFT_CLIENT_ID to complete OAuth flow.');
                      }
                    }}
                    className="min-h-[44px] w-full py-2.5 px-2 bg-surface-overlay hover:bg-surface-raised border border-border-subtle rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold text-text-primary cursor-pointer active:scale-95"
                    title={mode === 'signup' ? "Sign up with Microsoft" : "Sign in with Microsoft"}
                  >
                    <div className="w-3.5 h-3.5 grid grid-cols-2 gap-0.5 shrink-0">
                      <div className="bg-[#F25022] rounded-2xs" />
                      <div className="bg-[#7FBA00] rounded-2xs" />
                      <div className="bg-[#00A4EF] rounded-2xs" />
                      <div className="bg-[#FFB900] rounded-2xs" />
                    </div>
                    <span className="truncate">Microsoft</span>
                  </button>
                </div>

                {/* Legal notice */}
                <p className="mt-4 text-center text-[10px] text-text-muted leading-relaxed">
                  By continuing, you agree to MITRA's{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-brand-light underline hover:text-white">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-brand-light underline hover:text-white">
                    Privacy Policy
                  </a>.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
