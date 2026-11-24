import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { BrandingConfig, SecurityAlert, UserAccount } from '../types/institute';
import { AdminDashboardView } from './PortalHub';
import type { DashboardPayload } from './PortalHub';

interface SuperAdminStatus {
  activated: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  sessionTimeoutMinutes: number;
  smtpConfigured: boolean;
}

interface ActivationSession {
  maskedEmail: string;
  otpauthUri: string;
  manualKey: string;
}

function getPasswordChecks(pw: string) {
  return [
    { label: 'At least 10 characters', ok: pw.length >= 10 },
    { label: 'Uppercase letter (A-Z)', ok: /[A-Z]/.test(pw) },
    { label: 'Lowercase letter (a-z)', ok: /[a-z]/.test(pw) },
    { label: 'Numeric digit (0-9)', ok: /\d/.test(pw) },
    { label: 'Special symbol (!@#$...)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function SuperAdminPortal({
  mode,
  branding,
  onNavigateDashboard,
  onNavigateLogin,
  onDataMutated,
}: {
  mode: 'login' | 'dashboard';
  branding?: BrandingConfig;
  onNavigateDashboard: () => void;
  onNavigateLogin: () => void;
  onDataMutated: () => void;
}) {
  const [status, setStatus] = useState<SuperAdminStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Login / Activation / Reset tab state
  const [gatewayTab, setGatewayTab] = useState<'login' | 'activate' | 'reset'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [hasAuthenticator, setHasAuthenticator] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Request Activation Link state
  const [activationEmail, setActivationEmail] = useState('');

  // Complete Activation Token state (?activationToken=...)
  const [activationToken, setActivationToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('activationToken')?.trim() || '';
  });
  const [activationSession, setActivationSession] = useState<ActivationSession | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [fullName, setFullName] = useState('Primary Super Administrator');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupTotpCode, setSetupTotpCode] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Reset Password state
  const [resetEmail, setResetEmail] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetTotp, setResetTotp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Inactivity & Session Security state
  const [timeoutMinutes, setTimeoutMinutes] = useState(10);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [expiryWarningOpen, setExpiryWarningOpen] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastKeepaliveSentRef = useRef<number>(0);

  const clearClientSession = useCallback(
    (reason?: string) => {
      setDashboard(null);
      setLoginPassword('');
      setTwoFactorCode('');
      setNeeds2FA(false);
      setExpiryWarningOpen(false);
      if (reason) setNotice(reason);
      if (mode === 'dashboard') {
        onNavigateLogin();
      }
    },
    [mode, onNavigateLogin]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiRequest<SuperAdminStatus>('/api/super-admin/status');
      setStatus(res);
      if (res.sessionTimeoutMinutes) {
        setTimeoutMinutes(res.sessionTimeoutMinutes);
      }
      if (!res.activated && !activationToken) {
        setGatewayTab('activate');
      }
    } catch {
      // ignore initial status fetch errors
    }
  }, [activationToken]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<DashboardPayload>('/api/portal/dashboard');
      if (data.role !== 'super_admin') {
        setDashboard(null);
        setError('Access denied. This portal is restricted exclusively to the Primary Super Administrator.');
        if (mode === 'dashboard') {
          onNavigateLogin();
        }
        return;
      }
      setDashboard(data);
      const mins = data.cmsSettings?.sessionTimeoutMinutes || 10;
      setTimeoutMinutes(mins);
      lastActivityRef.current = Date.now();
      setRemainingSeconds(mins * 60);
      setExpiryWarningOpen(false);
      if (mode === 'login') {
        onNavigateDashboard();
      }
    } catch {
      setDashboard(null);
      if (mode === 'dashboard') {
        onNavigateLogin();
      }
    } finally {
      setLoading(false);
    }
  }, [mode, onNavigateDashboard, onNavigateLogin]);

  const verifySessionPassively = useCallback(async () => {
    try {
      const me = await apiRequest<{
        user: UserAccount;
        sessionTimeoutMinutes: number;
        remainingSeconds: number;
      }>('/api/auth/me?passive=1');
      if (me.user.role !== 'super_admin') {
        clearClientSession('Restricted portal: Super Administrator role required.');
        setLoading(false);
        return;
      }
      setTimeoutMinutes(me.sessionTimeoutMinutes || 10);
      setRemainingSeconds(me.remainingSeconds);
      if (!dashboard) {
        await loadDashboard();
      } else if (me.remainingSeconds <= 60) {
        setExpiryWarningOpen(true);
      }
    } catch {
      if (dashboard || mode === 'dashboard') {
        clearClientSession('Session ended or expired. Please sign in with 2FA.');
      }
      setLoading(false);
    }
  }, [clearClientSession, dashboard, loadDashboard, mode]);

  // Initial load + activation token verification
  useEffect(() => {
    fetchStatus();
    verifySessionPassively();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'login' || !activationToken) return;
    let cancelled = false;
    setActivationLoading(true);
    setError('');
    apiRequest<ActivationSession & { valid: boolean }>('/api/super-admin/begin-activation', {
      method: 'POST',
      body: JSON.stringify({ token: activationToken }),
    })
      .then((res) => {
        if (!cancelled) {
          setActivationSession({
            maskedEmail: res.maskedEmail,
            otpauthUri: res.otpauthUri,
            manualKey: res.manualKey,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Activation link is invalid or expired. Request a new activation email.'
          );
          setActivationToken('');
          window.history.replaceState({}, '', '/super-admin/login');
          setGatewayTab('activate');
        }
      })
      .finally(() => {
        if (!cancelled) setActivationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activationToken, mode]);

  // Browser back button / bfcache protection
  useEffect(() => {
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted || dashboard || mode === 'dashboard') {
        verifySessionPassively();
      }
    };
    const onPopState = () => {
      verifySessionPassively();
    };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('popstate', onPopState);
    };
  }, [dashboard, mode, verifySessionPassively]);

  // Activity listener + server keepalive
  useEffect(() => {
    if (!dashboard) return;

    const handleActivity = () => {
      if (expiryWarningOpen) return;
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastKeepaliveSentRef.current > 45_000) {
        lastKeepaliveSentRef.current = now;
        apiRequest('/api/auth/keepalive', { method: 'POST' }).catch(() => {
          clearClientSession('Your Super Admin session expired due to inactivity.');
        });
      }
    };

    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
    };
  }, [clearClientSession, dashboard, expiryWarningOpen]);

  // Countdown + periodic server verification
  useEffect(() => {
    if (!dashboard) return;

    const tickTimer = window.setInterval(() => {
      const limitMs = Math.max(2, timeoutMinutes) * 60_000;
      const elapsed = Date.now() - lastActivityRef.current;
      const leftSec = Math.max(0, Math.floor((limitMs - elapsed) / 1000));
      setRemainingSeconds(leftSec);
      if (leftSec <= 60 && leftSec > 0) {
        setExpiryWarningOpen(true);
      } else if (leftSec === 0) {
        apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        clearClientSession(`Automatically logged out after ${timeoutMinutes} minutes of inactivity.`);
      }
    }, 1000);

    const serverSyncTimer = window.setInterval(() => {
      verifySessionPassively();
    }, 25_000);

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(serverSyncTimer);
    };
  }, [clearClientSession, dashboard, timeoutMinutes, verifySessionPassively]);

  async function handleContinueSession() {
    try {
      const res = await apiRequest<{ ok: boolean; sessionTimeoutMinutes: number }>(
        '/api/auth/keepalive',
        { method: 'POST' }
      );
      lastActivityRef.current = Date.now();
      lastKeepaliveSentRef.current = Date.now();
      const mins = res.sessionTimeoutMinutes || timeoutMinutes;
      setTimeoutMinutes(mins);
      setRemainingSeconds(mins * 60);
      setExpiryWarningOpen(false);
    } catch (err: unknown) {
      clearClientSession(err instanceof Error ? err.message : 'Session expired.');
    }
  }

  async function handleRequestActivation(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/super-admin/request-activation', {
        method: 'POST',
        body: JSON.stringify({ email: activationEmail }),
      });
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to process activation request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteActivation(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (newPassword !== confirmPassword) {
      setError('Password and confirmation password do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest<{ user: UserAccount }>('/api/super-admin/complete-activation', {
        method: 'POST',
        body: JSON.stringify({
          token: activationToken,
          password: newPassword,
          totpCode: setupTotpCode,
          name: fullName,
        }),
      });
      setActivationToken('');
      setActivationSession(null);
      setNewPassword('');
      setConfirmPassword('');
      setSetupTotpCode('');
      window.history.replaceState({}, '', '/super-admin/dashboard');
      await fetchStatus();
      await loadDashboard();
      onDataMutated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Activation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        user?: UserAccount;
        requiresTwoFactor?: boolean;
        hasAuthenticator?: boolean;
        message?: string;
        suspiciousIp?: boolean;
      }>('/api/super-admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          twoFactorCode: needs2FA ? twoFactorCode : undefined,
        }),
      });

      if (res.requiresTwoFactor) {
        setNeeds2FA(true);
        setHasAuthenticator(res.hasAuthenticator ?? true);
        setNotice(res.message || 'Enter your 6-digit Two-Factor Authentication code.');
        return;
      }

      if (res.suspiciousIp) {
        setNotice('Security notice logged: Sign-in detected from a new IP address.');
      }
      await loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setError(msg);
      if (msg.toLowerCase().includes('activation')) {
        setGatewayTab('activate');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendEmail2fa() {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message?: string }>('/api/super-admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          sendEmail2fa: true,
        }),
      });
      setNeeds2FA(true);
      setNotice(res.message || '6-digit verification code dispatched to your verified email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send email 2FA code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestResetOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail }),
      });
      setOtpRequested(true);
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to dispatch OTP.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetWithOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-with-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail,
          otp: resetOtp,
          twoFactorCode: resetTotp,
          newPassword: resetNewPassword,
        }),
      });
      setNotice(res.message);
      setOtpRequested(false);
      setResetOtp('');
      setResetTotp('');
      setResetNewPassword('');
      setGatewayTab('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearClientSession('You have been securely signed out of the Super Admin portal.');
  }

  async function handleLogoutAll() {
    const res = await apiRequest<{ revokedCount: number }>('/api/auth/logout-all', {
      method: 'POST',
    }).catch(() => ({ revokedCount: 0 }));
    clearClientSession(
      `Terminated ${res.revokedCount || 1} active Super Admin session(s) across all devices.`
    );
  }

  async function handleAcknowledgeAlert(id: string) {
    try {
      await apiRequest(`/api/super-admin/security-alerts/${id}/acknowledge`, {
        method: 'POST',
      });
      await loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert.');
    }
  }

  async function copyManualKey() {
    if (!activationSession?.manualKey) return;
    try {
      await navigator.clipboard.writeText(activationSession.manualKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // clipboard blocked fallback
    }
  }

  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const ss = String(remainingSeconds % 60).padStart(2, '0');

  if (loading && mode === 'dashboard' && !dashboard) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-slate-600">
        Verifying Super Administrator session &amp; 2FA clearance...
      </div>
    );
  }

  // AUTHENTICATED SUPER ADMIN DASHBOARD (/super-admin/dashboard)
  if (dashboard && dashboard.role === 'super_admin' && mode === 'dashboard') {
    const unackAlerts: SecurityAlert[] = (dashboard.securityAlerts || []).filter(
      (a) => !a.acknowledged
    );

    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Session Pre-Expiry Warning Modal */}
        {expiryWarningOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 no-print">
            <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-3 text-amber-800">
                <AlertTriangle className="h-6 w-6 shrink-0" />
                <div>
                  <h3 className="text-base font-bold">Super Admin Session Expiring</h3>
                  <p className="text-xs text-slate-600">
                    Automatic idle logout triggers in{' '}
                    <span className="font-mono font-bold text-red-700">
                      {mm}:{ss}
                    </span>
                    . Confirm below to renew your encrypted session.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Sign Out Now
                </button>
                <button
                  type="button"
                  onClick={handleContinueSession}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  Continue Active Session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Primary Super Admin Header Bar */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-[#0B1E3D] to-blue-950 p-5 text-white flex flex-wrap items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3.5">
            {branding?.websiteLogoUrl ? (
              <img
                src={branding.websiteLogoUrl}
                alt="Institute Crest"
                className="h-11 w-11 rounded-lg bg-white p-1 object-contain"
              />
            ) : (
              <div className="h-11 w-11 rounded-lg bg-blue-800/80 border border-blue-700 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-emerald-300" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  Primary Super Admin Authority
                </span>
                <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  Email Verified · 2FA Active · Protected
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold">{dashboard.user.name}</h1>
              <p className="text-xs text-blue-200">
                Complete System Control · Immutable Primary Account · Audit-Tracked
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono ${
                remainingSeconds <= 90
                  ? 'border-amber-400 bg-amber-950/60 text-amber-200'
                  : 'border-blue-800 bg-blue-900/60 text-blue-100'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Auto-lock {mm}:{ss}
            </div>
            <button
              type="button"
              onClick={handleLogoutAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-900/60 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-800"
            >
              <Lock className="h-3.5 w-3.5" />
              Terminate All Sessions
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Security Alerts Feed for Primary Super Admin */}
        {unackAlerts.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2.5 no-print">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-amber-950 inline-flex items-center gap-1.5">
                <BellRing className="h-4 w-4 text-amber-700" />
                Unacknowledged Security Event Alerts ({unackAlerts.length})
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {unackAlerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-amber-200 bg-white p-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          alert.severity === 'Critical'
                            ? 'bg-red-100 text-red-800'
                            : alert.severity === 'Warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="font-semibold text-slate-900">{alert.title}</span>
                    </div>
                    <p className="text-slate-600">{alert.message}</p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {new Date(alert.timestamp).toLocaleString()}
                      {alert.ip ? ` · IP ${alert.ip}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                    className="shrink-0 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Acknowledge
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
            {notice}
          </div>
        )}

        {/* Full 22-Module Institutional Control Dashboard */}
        <AdminDashboardView
          data={dashboard}
          onRefresh={async () => {
            await loadDashboard();
            onDataMutated();
          }}
        />
      </div>
    );
  }

  // DEDICATED SUPER ADMIN LOGIN & EMAIL-VERIFIED ACTIVATION PORTAL (/super-admin/login)
  const passwordChecks = getPasswordChecks(newPassword);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-[#0B1E3D] px-6 py-5 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-800 border border-blue-700 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-blue-200" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                Success Point Educational Institute
              </p>
              <h1 className="text-lg font-bold">Super Administrator Portal</h1>
            </div>
          </div>
          {status && (
            <span
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                status.activated
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
              }`}
            >
              {status.activated
                ? 'Email Verified · 2FA Active'
                : 'Pending Email Verification'}
            </span>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
              {notice}
            </div>
          )}

          {/* SINGLE-USE ACTIVATION LINK FLOW (?activationToken=...) */}
          {activationToken ? (
            activationLoading ? (
              <p className="text-sm text-slate-600 py-6 text-center">
                Validating single-use email activation token...
              </p>
            ) : activationSession ? (
              <form onSubmit={handleCompleteActivation} className="space-y-5">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
                  <p className="text-xs font-bold text-emerald-900 inline-flex items-center gap-1.5">
                    <MailCheck className="h-4 w-4" />
                    Email Ownership Token Verified ({activationSession.maskedEmail})
                  </p>
                  <p className="text-xs text-emerald-800">
                    Complete activation by setting a strong password and enrolling your Authenticator App for mandatory Two-Factor Authentication.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Administrator Display Name
                    </label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Strong Password (min. 10 chars)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Create strong password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                  {passwordChecks.map((chk) => (
                    <div
                      key={chk.label}
                      className={`inline-flex items-center gap-1 ${
                        chk.ok ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{chk.label}</span>
                    </div>
                  ))}
                </div>

                {/* Mandatory 2FA TOTP Enrollment */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B1E3D]">
                    <Smartphone className="h-4 w-4 text-blue-700" />
                    Step 2: Mandatory Authenticator App Enrollment (TOTP 2FA)
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shrink-0">
                      <QRCodeSVG value={activationSession.otpauthUri} size={148} level="M" />
                    </div>
                    <div className="space-y-2.5 text-xs text-slate-700 flex-1">
                      <p>
                        Scan this QR code with Google Authenticator, Microsoft Authenticator, or Authy. Alternatively enter the setup key manually:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-[11px] text-slate-900 break-all">
                          {activationSession.manualKey}
                        </code>
                        <button
                          type="button"
                          onClick={copyManualKey}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-100 shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedKey ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Enter Live 6-Digit Authenticator Code to Verify
                        </label>
                        <input
                          value={setupTotpCode}
                          onChange={(e) => setSetupTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          required
                          inputMode="numeric"
                          placeholder="6-digit code"
                          className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tracking-widest"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-[#0B1E3D] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
                >
                  {submitting
                    ? 'Activating Protected Account...'
                    : 'Activate Primary Super Admin & Enter Dashboard'}
                </button>
              </form>
            ) : null
          ) : (
            <>
              {/* Mode Tabs */}
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setGatewayTab('login');
                    setError('');
                  }}
                  className={`rounded-md py-2 ${
                    gatewayTab === 'login' ? 'bg-white text-[#0B1E3D] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Super Admin Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGatewayTab('activate');
                    setError('');
                  }}
                  className={`rounded-md py-2 ${
                    gatewayTab === 'activate' ? 'bg-white text-[#0B1E3D] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Verify &amp; Activate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGatewayTab('reset');
                    setError('');
                  }}
                  className={`rounded-md py-2 ${
                    gatewayTab === 'reset' ? 'bg-white text-[#0B1E3D] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Reset Password
                </button>
              </div>

              {gatewayTab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  {status && !status.activated && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      This Primary Super Admin account has not been activated yet. Switch to{' '}
                      <button
                        type="button"
                        onClick={() => setGatewayTab('activate')}
                        className="font-bold underline"
                      >
                        Verify &amp; Activate
                      </button>{' '}
                      to confirm email ownership, create your strong password, and pair 2FA.
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Verified Super Admin Email
                    </label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder="Enter authorized Super Admin email"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="Enter strong Super Admin password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  {needs2FA && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-bold text-[#0B1E3D]">
                          6-Digit Two-Factor Authentication Code
                        </label>
                        <button
                          type="button"
                          onClick={handleSendEmail2fa}
                          disabled={submitting}
                          className="text-[11px] font-semibold text-blue-700 hover:underline"
                        >
                          Send Email 2FA Code Instead
                        </button>
                      </div>
                      <input
                        value={twoFactorCode}
                        onChange={(e) =>
                          setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        required
                        inputMode="numeric"
                        placeholder={
                          hasAuthenticator
                            ? 'Enter 6-digit Authenticator or Email OTP code'
                            : 'Enter 6-digit Email 2FA code'
                        }
                        className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-mono tracking-widest"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-[#0B1E3D] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
                  >
                    {submitting
                      ? 'Verifying Credentials...'
                      : needs2FA
                      ? 'Verify 2FA & Open Super Admin Dashboard'
                      : 'Sign In to Super Admin Portal'}
                  </button>
                </form>
              )}

              {gatewayTab === 'activate' && (
                <form onSubmit={handleRequestActivation} className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
                    <p className="font-bold text-[#0B1E3D]">
                      Email-Verified Account Activation Protocol
                    </p>
                    <p>
                      For security, the Primary Super Admin account has no default password and remains locked until you verify ownership via a single-use 30-minute activation link, set a strong password, and pair 2FA.
                    </p>
                    {status && !status.smtpConfigured && (
                      <p className="text-[11px] text-amber-800 pt-1">
                        SMTP mail server environment variables are not configured yet; in preview mode, single-use activation links are emitted to the server console log until SMTP is added in Secrets.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Configured Super Administrator Email
                    </label>
                    <input
                      type="email"
                      value={activationEmail}
                      onChange={(e) => setActivationEmail(e.target.value)}
                      required
                      placeholder="Enter authorized Super Admin email"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || Boolean(status?.activated)}
                    className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {status?.activated
                      ? 'Primary Account Already Activated'
                      : submitting
                      ? 'Dispatching Activation Link...'
                      : 'Send Single-Use Activation Link'}
                  </button>
                </form>
              )}

              {gatewayTab === 'reset' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Super Admin password recovery requires verified Email OTP ownership and your enrolled Authenticator 2FA code.
                  </p>
                  <form onSubmit={handleRequestResetOtp} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Super Admin Email
                      </label>
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        required
                        placeholder="Enter authorized Super Admin email"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-lg border border-blue-700 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Send 6-Digit Email OTP
                    </button>
                  </form>

                  {otpRequested && (
                    <form
                      onSubmit={handleResetWithOtp}
                      className="space-y-3 border-t border-slate-200 pt-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Email OTP Code
                          </label>
                          <input
                            value={resetOtp}
                            onChange={(e) =>
                              setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            required
                            inputMode="numeric"
                            placeholder="6-digit Email OTP"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Authenticator 2FA Code
                          </label>
                          <input
                            value={resetTotp}
                            onChange={(e) =>
                              setResetTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            required
                            inputMode="numeric"
                            placeholder="6-digit 2FA code"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          New Strong Password (min. 10 chars, upper/lower/digit/symbol)
                        </label>
                        <input
                          type="password"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Verify OTP &amp; Reset Password
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>Protected by HttpOnly Sessions · Mandatory 2FA · Lockout Guard</span>
            <span>Auto-lock after {timeoutMinutes} min idle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
