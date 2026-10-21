import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Mail, Calendar, ShieldCheck,
  Package, Bug, GitPullRequest, Lock, AlertTriangle,
  Smartphone, CheckCircle2, Trash2, ChevronDown, ChevronUp, Radio
} from 'lucide-react';
import { authApi } from '../../services/authApi';
import { getApiBase, getAuthHeaders } from '../../services/apiConfig';
import { useCompanionStore } from '../../store/companion.store';
import { ServiceLogo } from '../primitives/ServiceLogo';
import { ConnectionStatusBadge } from '../primitives/ConnectionStatusBadge';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({ isOpen, onClose }) => {
  const { isGuest, setAuthModalOpen } = useCompanionStore();

  // Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Google Connection State (backed by backend GET /api/connections)
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<'not_connected' | 'active' | 'needs_reauthorization'>('not_connected');
  const [googleAddress, setGoogleAddress] = useState('');
  const [googleAccessLevel, setGoogleAccessLevel] = useState<string>('full');
  const [googleUpgradeRequired, setGoogleUpgradeRequired] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isDisconnectingGoogle, setIsDisconnectingGoogle] = useState(false);
  const [isUpgradingGoogle, setIsUpgradingGoogle] = useState(false);

  // Microsoft Connection State (backed by backend GET /api/connections)
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [microsoftStatus, setMicrosoftStatus] = useState<'not_connected' | 'active' | 'needs_reauthorization'>('not_connected');
  const [microsoftAddress, setMicrosoftAddress] = useState('');
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [isDisconnectingMicrosoft, setIsDisconnectingMicrosoft] = useState(false);

  // GitHub Connection State (backed by backend GET /api/connections)
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubStatus, setGithubStatus] = useState<'not_connected' | 'active' | 'needs_reauthorization'>('not_connected');
  const [githubUsername, setGithubUsername] = useState('');
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [isDisconnectingGithub, setIsDisconnectingGithub] = useState(false);

  // Apple Connection State (backed by backend GET /api/connections)
  const [appleConnected, setAppleConnected] = useState(false);
  const [appleStatus, setAppleStatus] = useState<'not_connected' | 'active' | 'needs_reauthorization'>('not_connected');
  const [appleEmail, setAppleEmail] = useState('');
  const [isConnectingApple, setIsConnectingApple] = useState(false);
  const [isDisconnectingApple, setIsDisconnectingApple] = useState(false);

  // App Password Fallback State (Legacy/Alternative)
  const [appPasswordMode, setAppPasswordMode] = useState(false);
  const [inputGmail, setInputGmail] = useState('');
  const [inputAppPassword, setInputAppPassword] = useState('');

  // WhatsApp State
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Meta WhatsApp Business Embedded Signup State (Coexistence)
  const [waBusinessConnected, setWaBusinessConnected] = useState(false);
  const [waBusinessPhone, setWaBusinessPhone] = useState('');
  const [waBusinessWabaId, setWaBusinessWabaId] = useState('');
  const [waVerifiedName, setWaVerifiedName] = useState('');
  const [waCoexistenceMode, setWaCoexistenceMode] = useState(false);
  const [isConnectingWaBusiness, setIsConnectingWaBusiness] = useState(false);
  const [isDisconnectingWaBusiness, setIsDisconnectingWaBusiness] = useState(false);
  const [showPersonalAlertsOtp, setShowPersonalAlertsOtp] = useState(false);

  // Global Feedback Messages
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

  const API_BASE = getApiBase();

  const handleSync = async (provider: string) => {
    setSyncingProvider(provider);
    setStatusMessage(`Synchronizing ${provider === 'google' ? 'Google' : 'Microsoft'} Calendar events...`);
    setErrorMessage(null);
    try {
      await fetchConnections();
      setStatusMessage(`${provider === 'google' ? 'Google' : 'Microsoft'} Calendar synchronized.`);
    } catch (err: any) {
      setErrorMessage(`Failed to synchronize ${provider} Calendar.`);
    } finally {
      setSyncingProvider(null);
    }
  };

  const fetchConnections = useCallback(async () => {
    try {
      // 1. Fetch OAuth connected accounts metadata from backend
      const data = await authApi.getConnections();

      // Check Google connection
      const googleConn = data.connections?.find(
        (c) => c.provider.toLowerCase() === 'google'
      );
      if (googleConn) {
        setGoogleConnected(true);
        setGoogleAddress(googleConn.email || 'Connected Google Account');
        const accessLevel = (googleConn as any).gmail_access_level || 'send_only';
        const upgradeReq = (googleConn as any).gmail_upgrade_required ?? (accessLevel !== 'full');
        setGoogleAccessLevel(accessLevel);
        setGoogleUpgradeRequired(upgradeReq);
        if (googleConn.status === 'needs_reauthorization') {
          setGoogleStatus('needs_reauthorization');
        } else {
          setGoogleStatus('active');
        }
      } else {
        setGoogleConnected(false);
        setGoogleStatus('not_connected');
        setGoogleAddress('');
        setGoogleAccessLevel('none');
        setGoogleUpgradeRequired(false);
      }

      // Check Microsoft connection
      const msConn = data.connections?.find(
        (c) => c.provider.toLowerCase() === 'microsoft'
      );
      if (msConn) {
        setMicrosoftConnected(true);
        setMicrosoftAddress(msConn.email || 'Connected Microsoft Account');
        if (msConn.status === 'needs_reauthorization') {
          setMicrosoftStatus('needs_reauthorization');
        } else {
          setMicrosoftStatus('active');
        }
      } else {
        setMicrosoftConnected(false);
        setMicrosoftStatus('not_connected');
        setMicrosoftAddress('');
      }

      // Check GitHub connection
      const ghConn = data.connections?.find(
        (c) => c.provider.toLowerCase() === 'github'
      );
      if (ghConn) {
        setGithubConnected(true);
        setGithubUsername(ghConn.email || (ghConn as any).username || 'Connected GitHub Account');
        if (ghConn.status === 'needs_reauthorization') {
          setGithubStatus('needs_reauthorization');
        } else {
          setGithubStatus('active');
        }
      } else {
        setGithubConnected(false);
        setGithubStatus('not_connected');
        setGithubUsername('');
      }

      // Check Apple connection
      const appleConn = data.connections?.find(
        (c) => c.provider.toLowerCase() === 'apple'
      );
      if (appleConn) {
        setAppleConnected(true);
        setAppleEmail(appleConn.email || 'Apple Account');
        setAppleStatus(appleConn.status === 'needs_reauthorization' ? 'needs_reauthorization' : 'active');
      } else {
        setAppleConnected(false);
        setAppleStatus('not_connected');
        setAppleEmail('');
      }

      // 2. Fetch WhatsApp status (Personal Alerts)
      try {
        const res = await fetch(`${API_BASE}/api/integrations`, { headers: getAuthHeaders() });
        if (res.ok) {
          const intData = await res.json();
          if (intData.whatsapp?.verified) {
            setWhatsappConnected(true);
            setWhatsappNumber(intData.whatsapp.phone || '');
          }
        }
      } catch (e) {
        console.warn("WhatsApp integration check warning:", e);
      }

      // 3. Fetch Meta WhatsApp Business Coexistence status
      try {
        const waRes = await fetch(`${API_BASE}/api/whatsapp/business/status`, { headers: getAuthHeaders() });
        if (waRes.ok) {
          const waData = await waRes.json();
          if (waData.status === 'connected') {
            setWaBusinessConnected(true);
            setWaBusinessPhone(waData.display_phone_number || waData.phone_number_id || '');
            setWaBusinessWabaId(waData.waba_id || '');
            setWaVerifiedName(waData.verified_name || '');
            setWaCoexistenceMode(Boolean(waData.coexistence_mode));
          } else {
            setWaBusinessConnected(false);
            setWaBusinessPhone('');
            setWaBusinessWabaId('');
            setWaVerifiedName('');
          }
        }
      } catch (e) {
        console.warn("WhatsApp Business status check warning:", e);
      }
    } catch (err) {
      console.warn("Failed fetching user connections:", err);
    }
  }, [API_BASE]);

  // Load real connections on modal open
  useEffect(() => {
    if (!isOpen) return;
    fetchConnections();
  }, [isOpen, fetchConnections]);

  // Load Meta Facebook SDK for WhatsApp Business Embedded Signup
  useEffect(() => {
    if ((window as any).FB) return;
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: '1325283592858854',
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v25.0'
      });
    };
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  // ESC key listener and body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 1. Real Google OAuth Flow Handler (Redirects to Google Consent)
  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    setStatusMessage("Initiating PKCE-protected Google OAuth transaction...");
    setErrorMessage(null);
    try {
      const data = await authApi.startOAuth('google', 'connect');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No authorization URL returned from OAuth start endpoint.");
      }
    } catch (err: any) {
      setIsConnectingGoogle(false);
      setErrorMessage(err.message || "Failed starting Google connection. Please try again.");
    }
  };

  // 1b. Real Google OAuth Upgrade Flow Handler
  const handleUpgradeGoogle = async () => {
    setIsUpgradingGoogle(true);
    setStatusMessage("Initiating Gmail permissions upgrade (read, search, draft)...");
    setErrorMessage(null);
    try {
      const data = await authApi.startOAuth('google', 'upgrade_gmail');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No authorization URL returned from OAuth upgrade endpoint.");
      }
    } catch (err: any) {
      setIsUpgradingGoogle(false);
      setErrorMessage(err.message || "Failed starting Gmail upgrade flow. Please try again.");
    }
  };

  // 2. Real Google OAuth Disconnect Handler
  const handleDisconnectGoogle = async () => {
    setIsDisconnectingGoogle(true);
    setStatusMessage("Disconnecting Google account...");
    setErrorMessage(null);
    try {
      await authApi.disconnectAccount('google');
      setGoogleConnected(false);
      setGoogleStatus('not_connected');
      setGoogleAddress('');
      setStatusMessage("Google account disconnected successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed disconnecting Google account.");
    } finally {
      setIsDisconnectingGoogle(false);
    }
  };

  // 3. Real Microsoft OAuth Flow Handler
  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    setStatusMessage("Initiating PKCE-protected Microsoft OAuth transaction...");
    setErrorMessage(null);
    try {
      const data = await authApi.startOAuth('microsoft', 'connect');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No authorization URL returned from Microsoft OAuth endpoint.");
      }
    } catch (err: any) {
      setIsConnectingMicrosoft(false);
      setErrorMessage(err.message || "Failed starting Microsoft connection. Please try again.");
    }
  };

  // 4. Real Microsoft OAuth Disconnect Handler
  const handleDisconnectMicrosoft = async () => {
    setIsDisconnectingMicrosoft(true);
    setStatusMessage("Disconnecting Microsoft account...");
    setErrorMessage(null);
    try {
      await authApi.disconnectAccount('microsoft');
      setMicrosoftConnected(false);
      setMicrosoftStatus('not_connected');
      setMicrosoftAddress('');
      setStatusMessage("Microsoft account disconnected successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed disconnecting Microsoft account.");
    } finally {
      setIsDisconnectingMicrosoft(false);
    }
  };

  // 5. Real GitHub OAuth Flow Handler
  const handleConnectGithub = async () => {
    setIsConnectingGithub(true);
    setStatusMessage("Initiating secure GitHub OAuth transaction...");
    setErrorMessage(null);
    try {
      const data = await authApi.startOAuth('github', 'connect');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No authorization URL returned from GitHub OAuth endpoint.");
      }
    } catch (err: any) {
      setIsConnectingGithub(false);
      setErrorMessage(err.message || "Failed starting GitHub connection. Please try again.");
    }
  };

  // 6. Real GitHub OAuth Disconnect Handler
  const handleDisconnectGithub = async () => {
    setIsDisconnectingGithub(true);
    setStatusMessage("Disconnecting GitHub account...");
    setErrorMessage(null);
    try {
      await authApi.disconnectAccount('github');
      setGithubConnected(false);
      setGithubStatus('not_connected');
      setGithubUsername('');
      setStatusMessage("GitHub account disconnected successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed disconnecting GitHub account.");
    } finally {
      setIsDisconnectingGithub(false);
    }
  };

  // 7. Real Apple Sign-In Connect & Disconnect Handlers
  const handleConnectApple = async () => {
    setIsConnectingApple(true);
    setStatusMessage("Redirecting to Apple Sign-In authorization...");
    setErrorMessage(null);
    try {
      const data = await authApi.startOAuth('apple', 'login');
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setErrorMessage("Apple Sign-In is not configured on this server. Please configure APPLE_CLIENT_ID in backend .env.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Apple Sign-In is not configured on this server. Please configure APPLE_CLIENT_ID in backend .env.");
    } finally {
      setIsConnectingApple(false);
    }
  };

  const handleDisconnectApple = async () => {
    setIsDisconnectingApple(true);
    setStatusMessage("Disconnecting Apple account...");
    setErrorMessage(null);
    try {
      await authApi.disconnectAccount('apple');
      setAppleConnected(false);
      setAppleStatus('not_connected');
      setAppleEmail('');
      setStatusMessage("Apple account disconnected successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed disconnecting Apple account.");
    } finally {
      setIsDisconnectingApple(false);
    }
  };

  // 5. Fallback App Password Handler
  const handleSaveGmailAppPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGmail || !inputAppPassword) return;
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/gmail`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: inputGmail,
          app_password: inputAppPassword,
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setGoogleConnected(true);
        setGoogleStatus('active');
        setGoogleAddress(inputGmail);
        setAppPasswordMode(false);
        setStatusMessage(`Gmail account ${inputGmail} connected (AES-256 encrypted App Password).`);
      } else {
        setErrorMessage(data.detail || data.message || "Failed saving Gmail App Password.");
      }
    } catch (err: any) {
      setErrorMessage("Network error connecting Gmail account.");
    } finally {
      setIsVerifying(false);
    }
  };

  // 6. WhatsApp OTP Dispatch
  const handleSendWhatsappOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappNumber) return;
    setIsVerifying(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/whatsapp/send-otp`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: whatsappNumber })
      });
      const data = await res.json();
      if (res.ok && (data.status === 'success' || data.otp_sent)) {
        setShowOtpModal(true);
        setStatusMessage(`OTP dispatched to ${whatsappNumber}. Enter 6-digit code to verify.`);
      } else {
        setErrorMessage(data.detail || data.message || "Failed sending OTP to WhatsApp.");
      }
    } catch (err: any) {
      setErrorMessage("Network error sending WhatsApp OTP.");
    } finally {
      setIsVerifying(false);
    }
  };

  // 7. WhatsApp OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/whatsapp/verify-otp`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: whatsappNumber, otp: otpCode })
      });
      const data = await res.json();
      if (res.ok && (data.status === 'success' || data.verified)) {
        setWhatsappConnected(true);
        setShowOtpModal(false);
        setOtpCode('');
        setStatusMessage(`WhatsApp number ${whatsappNumber} verified successfully!`);
      } else {
        setErrorMessage(data.detail || data.message || "Invalid OTP code. Please check and try again.");
      }
    } catch (err: any) {
      setErrorMessage("Network error verifying WhatsApp OTP.");
    } finally {
      setIsVerifying(false);
    }
  };

  // 8. Meta WhatsApp Business Embedded Signup (Coexistence)
  const handleLaunchMetaEmbeddedSignup = () => {
    if (isGuest) {
      setErrorMessage("Please sign in with a registered account to connect WhatsApp Business.");
      setAuthModalOpen(true);
      return;
    }

    if (!(window as any).FB) {
      setErrorMessage("Meta SDK is still initializing. Please wait a moment and try again.");
      return;
    }

    setIsConnectingWaBusiness(true);
    setStatusMessage("Opening Meta WhatsApp Business Signup (Coexistence mode)...");
    setErrorMessage(null);

    let sessionWabaId: string | null = null;
    let sessionPhoneId: string | null = null;

    // Listen for Meta Embedded Signup postMessage events
    const handleMetaMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.type === 'WA_EMBEDDED_SIGNUP') {
          if (payload.event === 'FINISH') {
            const data = payload.data || {};
            sessionWabaId = data.waba_id || null;
            sessionPhoneId = data.phone_number_id || null;
            setStatusMessage("Meta signup completed. Exchanging authorization code...");
          } else if (payload.event === 'CANCEL') {
            setIsConnectingWaBusiness(false);
            setErrorMessage("WhatsApp Business Signup was cancelled.");
          } else if (payload.event === 'ERROR') {
            setIsConnectingWaBusiness(false);
            setErrorMessage(`Meta Signup Error: ${payload.data?.error_message || 'Unknown error'}`);
          }
        }
      } catch (e) {
        // Ignore non-json messages
      }
    };

    window.addEventListener('message', handleMetaMessage);

    const handleFbLoginCallback = (response: any) => {
      window.removeEventListener('message', handleMetaMessage);

      if (response && response.authResponse && response.authResponse.code) {
        const authCode = response.authResponse.code;
        setStatusMessage("Securely validating credentials and establishing Coexistence...");
        
        fetch(`${API_BASE}/api/whatsapp/embedded-signup/exchange`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: authCode,
            waba_id: sessionWabaId,
            phone_number_id: sessionPhoneId
          })
        })
          .then(async (exchangeRes) => {
            const data = await exchangeRes.json();
            if (exchangeRes.ok && data.status === 'connected') {
              setWaBusinessConnected(true);
              setWaBusinessPhone(data.display_phone_number || data.phone_number_id || '');
              setWaBusinessWabaId(data.waba_id || '');
              setWaVerifiedName(data.verified_name || '');
              setWaCoexistenceMode(Boolean(data.coexistence_mode));
              setStatusMessage(`WhatsApp Business Connected (${data.display_phone_number || 'Coexistence Active'})`);
            } else {
              setErrorMessage(data.detail || data.message || "Failed to exchange Meta authorization code.");
            }
          })
          .catch((err: any) => {
            setErrorMessage(err.message || "Network error exchanging Meta authorization code.");
          })
          .finally(() => {
            setIsConnectingWaBusiness(false);
          });
      } else {
        setIsConnectingWaBusiness(false);
        if (response && response.status === 'unknown') {
          setErrorMessage("Meta onboarding window was closed without completing.");
        } else {
          setErrorMessage("Meta authorization was not completed.");
        }
      }
    };

    try {
      (window as any).FB.login(
        handleFbLoginCallback,
        {
          config_id: '1600310887693339',
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
            features: ['app_only_install']
          }
        }
      );
    } catch (fbErr: any) {
      window.removeEventListener('message', handleMetaMessage);
      setIsConnectingWaBusiness(false);
      console.warn("FB.login error:", fbErr);
      if (fbErr?.message?.includes("http pages") || window.location.protocol === 'http:') {
        setErrorMessage("Meta requires HTTPS for Facebook Login. In local development on HTTP, use an HTTPS tunnel (e.g. ngrok or Cloudflare tunnel) to test live Meta OAuth.");
      } else {
        setErrorMessage(fbErr?.message || "Failed to launch Meta Embedded Signup.");
      }
    }
  };

  const handleDisconnectWaBusiness = async () => {
    setIsDisconnectingWaBusiness(true);
    setStatusMessage("Disconnecting WhatsApp Business Account...");
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/business/disconnect`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setWaBusinessConnected(false);
        setWaBusinessPhone('');
        setWaBusinessWabaId('');
        setWaVerifiedName('');
        setStatusMessage("WhatsApp Business Account disconnected successfully.");
      } else {
        const data = await res.json();
        setErrorMessage(data.detail || data.message || "Failed to disconnect WhatsApp Business.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error disconnecting WhatsApp Business.");
    } finally {
      setIsDisconnectingWaBusiness(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 z-50 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="integrations-modal-title"
    >
      <div
        className="bg-surface-raised border border-border-subtle rounded-3xl max-w-2xl w-full text-white shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="p-5 sm:p-6 border-b border-border-subtle flex-shrink-0 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand/15 border border-brand/30 text-brand-light text-3xs font-semibold uppercase tracking-wider mb-1.5">
              <Lock size={11} className="text-brand" /> Encrypted Connections Vault
            </div>
            <h2 id="integrations-modal-title" className="text-xl sm:text-2xl font-bold text-gray-100 tracking-tight">
              MITRA Service Connections
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 leading-relaxed">
              Connect your personal accounts to enable automated email dispatch, calendar synchronization, and executive briefings.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Close dialog (Escape)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          {/* Guest Session Notice */}
          {isGuest && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <span className="text-amber-200 leading-snug">
                  You are in a Guest session. External integrations require an authenticated account.
                </span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  setAuthModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-all shrink-0 cursor-pointer"
              >
                Create Account
              </button>
            </div>
          )}

          {/* Web Application Calendar Sync Notice */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5 text-xs text-gray-300">
            <span className="text-blue-400 text-sm mt-0.5">ℹ️</span>
            <div className="leading-relaxed">
              <strong className="text-white">Mobile Sync Notice:</strong> Web browsers cannot directly write to native mobile device calendars without an active Google Calendar or Microsoft Outlook connection.
            </div>
          </div>

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. GOOGLE INTEGRATION CARD */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="google" size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-200 text-sm sm:text-base">Google Account</h3>
                  <p className="text-xs text-gray-400">Gmail dispatch & Google Calendar sync</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {googleStatus === 'active' ? (
                  <>
                    {googleUpgradeRequired ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                        Gmail Send Only
                      </span>
                    ) : (
                      <ConnectionStatusBadge status={syncingProvider === 'google' ? 'SYNCING' : 'CONNECTED'} />
                    )}
                    {googleUpgradeRequired && (
                      <button
                        onClick={handleUpgradeGoogle}
                        disabled={isUpgradingGoogle}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {isUpgradingGoogle ? "Redirecting..." : "Upgrade Gmail Access"}
                      </button>
                    )}
                    <button
                      onClick={() => handleSync('google')}
                      disabled={syncingProvider === 'google'}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-medium rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {syncingProvider === 'google' ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                      onClick={handleDisconnectGoogle}
                      disabled={isDisconnectingGoogle}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {isDisconnectingGoogle ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </>
                ) : googleStatus === 'needs_reauthorization' ? (
                  <>
                    <ConnectionStatusBadge status="NEEDS_REAUTH" />
                    <button
                      onClick={handleConnectGoogle}
                      disabled={isConnectingGoogle}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      {isConnectingGoogle ? "Redirecting..." : "Reconnect Google"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    className="px-4 py-2 bg-white text-black hover:bg-gray-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingGoogle ? "Connecting..." : "Connect Google"}
                  </button>
                )}
              </div>
            </div>

            {/* Google Account Metadata & Capabilities */}
            {googleConnected && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Account: <strong className="text-gray-200">{googleAddress}</strong></span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <ShieldCheck size={12} /> AES-256 Encrypted
                  </span>
                </div>

                {googleUpgradeRequired && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center justify-between gap-2">
                    <span>MITRA needs additional Gmail permissions to read messages, search mailbox, and save drafts.</span>
                    <button
                      onClick={handleUpgradeGoogle}
                      disabled={isUpgradingGoogle}
                      className="shrink-0 px-2.5 py-1 bg-amber-500 text-black font-semibold text-[11px] rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      Upgrade Now
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Mail size={12} className={googleUpgradeRequired ? "text-amber-400" : "text-blue-400"} />
                    {googleUpgradeRequired ? "Gmail Send Only" : (googleAccessLevel === 'full' ? "Gmail API (Send, Read, Draft)" : `Gmail API (${googleAccessLevel})`)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Calendar size={12} className="text-emerald-400" /> Google Calendar API
                  </span>
                </div>
              </div>
            )}

            {/* App Password Fallback Trigger */}
            {!googleConnected && (
              <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-500">
                <span>OAuth unavailable or using app passwords?</span>
                <button
                  onClick={() => setAppPasswordMode(!appPasswordMode)}
                  className="text-brand-light hover:underline cursor-pointer"
                >
                  {appPasswordMode ? "Hide App Password Form" : "Use App Password"}
                </button>
              </div>
            )}

            {appPasswordMode && !googleConnected && (
              <form onSubmit={handleSaveGmailAppPassword} className="mt-3 pt-3 border-t border-white/10 space-y-3">
                <input
                  type="email"
                  required
                  value={inputGmail}
                  onChange={(e) => setInputGmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#242424] text-white text-xs border border-white/10 focus:outline-none focus:border-brand"
                />
                <input
                  type="password"
                  required
                  value={inputAppPassword}
                  onChange={(e) => setInputAppPassword(e.target.value)}
                  placeholder="Gmail 16-character App Password"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#242424] text-white text-xs border border-white/10 focus:outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {isVerifying ? "Encrypting & Connecting..." : "Save Gmail App Password"}
                </button>
              </form>
            )}
          </div>

          {/* 2. MICROSOFT INTEGRATION CARD */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="microsoft" size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-200 text-sm sm:text-base">Microsoft Account</h3>
                  <p className="text-xs text-gray-400">Outlook mail dispatch & Microsoft Calendar sync</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {microsoftStatus === 'active' ? (
                  <>
                    <ConnectionStatusBadge status={syncingProvider === 'microsoft' ? 'SYNCING' : 'CONNECTED'} />
                    <button
                      onClick={() => handleSync('microsoft')}
                      disabled={syncingProvider === 'microsoft'}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-medium rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {syncingProvider === 'microsoft' ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                      onClick={handleDisconnectMicrosoft}
                      disabled={isDisconnectingMicrosoft}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {isDisconnectingMicrosoft ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </>
                ) : microsoftStatus === 'needs_reauthorization' ? (
                  <>
                    <ConnectionStatusBadge status="NEEDS_REAUTH" />
                    <button
                      onClick={handleConnectMicrosoft}
                      disabled={isConnectingMicrosoft}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      {isConnectingMicrosoft ? "Redirecting..." : "Reconnect Microsoft"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectMicrosoft}
                    disabled={isConnectingMicrosoft}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingMicrosoft ? "Connecting..." : "Connect Microsoft"}
                  </button>
                )}
              </div>
            </div>

            {/* Microsoft Account Metadata & Capabilities */}
            {microsoftConnected && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Account: <strong className="text-gray-200">{microsoftAddress}</strong></span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <ShieldCheck size={12} /> AES-256 Encrypted
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Mail size={12} className="text-blue-400" /> Outlook Graph API (Send)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Calendar size={12} className="text-emerald-400" /> Microsoft Calendar API
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 3. GITHUB DEVELOPER INTEGRATION CARD */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="github" size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-200 text-sm sm:text-base">GitHub Developer Account</h3>
                  <p className="text-xs text-gray-400">Repositories, GitHub Issues & Pull Requests API</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {githubStatus === 'active' ? (
                  <>
                    <ConnectionStatusBadge status="CONNECTED" />
                    <button
                      onClick={handleDisconnectGithub}
                      disabled={isDisconnectingGithub}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                    >
                      {isDisconnectingGithub ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </>
                ) : githubStatus === 'needs_reauthorization' ? (
                  <>
                    <ConnectionStatusBadge status="NEEDS_REAUTH" />
                    <button
                      onClick={handleConnectGithub}
                      disabled={isConnectingGithub}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      {isConnectingGithub ? "Redirecting..." : "Reconnect GitHub"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectGithub}
                    disabled={isConnectingGithub}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingGithub ? "Connecting..." : "Connect GitHub"}
                  </button>
                )}
              </div>
            </div>

            {/* GitHub Account Metadata & Capabilities */}
            {githubConnected && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Account: <strong className="text-gray-200">{githubUsername}</strong></span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <ShieldCheck size={12} /> AES-256 Encrypted
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Package size={12} className="text-purple-400" /> Repositories API
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Bug size={12} className="text-amber-400" /> Issues API
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <GitPullRequest size={12} className="text-emerald-400" /> Pull Requests API
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 4. APPLE SIGN-IN / IDENTITY CARD */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="apple" size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-200 text-sm sm:text-base">Apple Account</h3>
                  <p className="text-xs text-gray-400">Sign in with Apple & Private Relay Email identity</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {appleStatus === 'active' ? (
                  <>
                    <ConnectionStatusBadge status="CONNECTED" />
                    <button
                      onClick={handleDisconnectApple}
                      disabled={isDisconnectingApple}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                    >
                      {isDisconnectingApple ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </>
                ) : appleStatus === 'needs_reauthorization' ? (
                  <>
                    <ConnectionStatusBadge status="NEEDS_REAUTH" />
                    <button
                      onClick={handleConnectApple}
                      disabled={isConnectingApple}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      {isConnectingApple ? "Redirecting..." : "Reconnect Apple"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectApple}
                    disabled={isConnectingApple}
                    className="px-4 py-2 bg-white text-black hover:bg-gray-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingApple ? "Connecting..." : "Connect Apple"}
                  </button>
                )}
              </div>
            </div>

            {/* Apple Account Metadata & Capabilities */}
            {appleConnected && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Identity: <strong className="text-gray-200">{appleEmail}</strong></span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <ShieldCheck size={12} /> ES256 Verified
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <Lock size={12} className="text-gray-300" /> Sign in with Apple
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px]">
                    <ShieldCheck size={12} className="text-brand-light" /> Private Relay Support
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 5. APPLE CALENDAR & NATIVE CALENDAR (SEPARATE FROM APPLE SIGN-IN, WITH VECTOR LOGO) */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="apple_calendar" size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-200 text-sm sm:text-base">Apple Calendar & Native iOS Calendar</h3>
                  <p className="text-xs text-gray-400">Direct device calendar access & local sandbox bridge</p>
                </div>
              </div>
              <div className="self-start sm:self-center shrink-0">
                <ConnectionStatusBadge status="UNAVAILABLE" label="Unavailable via Web" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-400 leading-relaxed space-y-2">
              <p>
                Due to Apple iOS and macOS browser sandbox security restrictions, web applications cannot write directly to native Apple Calendars or Reminders without an intermediary cloud connection.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                  💡 Tip: Connect Google Calendar or Microsoft Outlook to sync with iOS Calendar
                </span>
              </div>
            </div>
          </div>

          {/* 6. WHATSAPP BUSINESS & MESSAGING INTEGRATION CARD */}
          <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-white/10 hover:border-white/15 transition-all space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <ServiceLogo service="whatsapp" size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-200 text-sm sm:text-base">WhatsApp Business</h3>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full">
                      Coexistence Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">Official Meta Cloud API • Keep your mobile app active</p>
                </div>
              </div>
              <div className="self-start sm:self-center shrink-0">
                <ConnectionStatusBadge status={waBusinessConnected ? 'CONNECTED' : 'NOT_CONNECTED'} />
              </div>
            </div>

            {/* Main WhatsApp Business Connection Body */}
            {waBusinessConnected ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-gray-400">Business Number: </span>
                    <strong className="text-emerald-300 font-mono text-xs">{waBusinessPhone || 'Connected'}</strong>
                    {waVerifiedName && (
                      <span className="block text-[11px] text-gray-400">Name: {waVerifiedName}</span>
                    )}
                    {waBusinessWabaId && (
                      <span className="block text-[10px] text-gray-500 font-mono">WABA ID: {waBusinessWabaId}</span>
                    )}
                  </div>
                  <button
                    onClick={handleDisconnectWaBusiness}
                    disabled={isDisconnectingWaBusiness}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    {isDisconnectingWaBusiness ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-500/10 text-[11px] text-emerald-400/90">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Mobile App & Cloud API Coexistence Verified
                  </span>
                  <span className="text-emerald-600">•</span>
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <Lock size={11} /> AES-256 Token Vault
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-white/5">
                <p className="text-xs text-gray-300 leading-relaxed">
                  Connect via official <strong>Meta Embedded Signup</strong>. With <em>Coexistence</em>, you retain complete access to your WhatsApp Business mobile app on your phone while MITRA delivers morning briefings, client notifications, and calendar alerts.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLaunchMetaEmbeddedSignup}
                    disabled={isConnectingWaBusiness}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Smartphone size={14} />
                    {isConnectingWaBusiness ? "Connecting via Meta..." : "Connect WhatsApp Business (Coexistence)"}
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] text-gray-400 leading-normal flex items-start gap-2">
                  <span className="text-emerald-400 text-xs mt-0.5">ℹ️</span>
                  <span>
                    When Meta prompts you during signup, choose your existing WhatsApp Business number. A confirmation notification will appear in your mobile phone app to approve dual-access coexistence.
                  </span>
                </div>
              </div>
            )}

            {/* Collapsible Personal WhatsApp OTP Fallback */}
            <div className="pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowPersonalAlertsOtp(!showPersonalAlertsOtp)}
                className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-gray-200 transition-colors py-1 cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Radio size={12} className="text-emerald-400" />
                  Personal Number Alert Delivery (Direct OTP Fallback)
                </span>
                {showPersonalAlertsOtp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showPersonalAlertsOtp && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  {whatsappConnected ? (
                    <div className="flex items-center justify-between text-xs text-gray-400 p-2.5 rounded-xl bg-white/[0.02]">
                      <span>Personal Alerts: <strong className="text-gray-200">{whatsappNumber}</strong></span>
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                        <ShieldCheck size={12} /> Active
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={handleSendWhatsappOtp} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="tel"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="flex-1 px-4 py-2 rounded-xl bg-[#242424] text-white placeholder-gray-500 text-xs border border-white/10 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={isVerifying || !whatsappNumber}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-medium text-xs rounded-xl transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {isVerifying ? "Sending..." : "Verify Personal Number"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* OTP Modal Overlay */}
        {showOtpModal && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl rounded-3xl p-6 flex flex-col justify-center items-center text-center z-10">
            <h3 className="text-lg font-bold mb-1 text-gray-100">Verify WhatsApp Number</h3>
            <p className="text-xs text-gray-400 mb-4">Enter the 6-digit code sent to {whatsappNumber}</p>
            <form onSubmit={handleVerifyOtp} className="w-full max-w-xs space-y-4">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full px-4 py-3 text-center text-xl tracking-widest font-mono rounded-xl bg-[#1E1E1E] text-white border border-white/20 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpCode.length !== 6 || isVerifying}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isVerifying ? "Verifying..." : "Confirm OTP"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
