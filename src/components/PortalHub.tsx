import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  Plus,
  Settings,
  Shield,
  Ticket,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  ALL_USER_ROLES,
  ASSAM_DISTRICTS,
  CERTIFICATE_TYPES,
  COURSE_CATEGORIES,
} from '../types/institute';
import type {
  AdmitCardRecord,
  ApplicationRecord,
  AssignmentRecord,
  AttendanceRecord,
  AuditLog,
  BackupRecord,
  BrandingConfig,
  Centre,
  CertificateDocumentType,
  CertificateRecord,
  CertificateRequest,
  CmsSettings,
  CmsVersion,
  Course,
  DocumentTemplateConfig,
  EnquiryRecord,
  ExamDefinition,
  ExamResult,
  GalleryItem,
  LoginAttemptRecord,
  MarksheetRecord,
  MigrationRecord,
  NotificationItem,
  OnlineClassSession,
  PaymentRecord,
  PermissionKey,
  SecurityAlert,
  SessionRecord,
  StaffTask,
  StudentIdHistoryItem,
  StudentProfile,
  StudyMaterial,
  SubjectMark,
  SupportTicket,
  UserAccount,
  UserRole,
  WhatsAppSettings,
} from '../types/institute';
import {
  BrandingAndTemplatesPanel,
  CmsManagerPanel,
  SecurityAndBackupPanel,
} from './CmsAndBrandingManager';
import {
  AdmitCardView,
  CertificateView,
  FeeReceiptRow,
  MarksheetView,
  MigrationCertificateView,
  StudentIdCardView,
} from './DocumentGenerators';

interface AuthStatus {
  adminClaimed: boolean;
  envAdminConfigured: boolean;
  sessionTimeoutMinutes: number;
}

interface DistrictAnalyticsRow {
  district: string;
  centres: number;
  activeCentres: number;
  students: number;
  applications: number;
  revenue: number;
}

export interface DashboardPayload {
  role: UserRole;
  user: UserAccount;
  permissions?: PermissionKey[];
  overview?: {
    totalStudents: number;
    totalApplications: number;
    approvedAdmissions: number;
    pendingApplications: number;
    totalCourses: number;
    totalStaff: number;
    totalFranchises: number;
    activeFranchises: number;
    totalRevenue: number;
    pendingPayments: number;
  };
  profile?: StudentProfile;
  centre?: Centre;
  district?: string;
  commissionSummary?: {
    commissionRate: number;
    totalCollected: number;
    commissionEarned: number;
    netRemittance: number;
  };
  cmsSettings?: CmsSettings;
  branding?: BrandingConfig;
  documentTemplates?: DocumentTemplateConfig[];
  whatsappSettings?: WhatsAppSettings;
  cmsVersions?: CmsVersion[];
  backups?: BackupRecord[];
  rolePermissions?: Record<UserRole, PermissionKey[]>;
  sessions?: SessionRecord[];
  loginAttempts?: LoginAttemptRecord[];
  securityAlerts?: SecurityAlert[];
  studentIdHistory?: StudentIdHistoryItem[];
  courses?: Course[];
  centres?: Centre[];
  users?: UserAccount[];
  applications?: ApplicationRecord[];
  students?: StudentProfile[];
  admitCards?: AdmitCardRecord[];
  marksheets?: MarksheetRecord[];
  migrations?: MigrationRecord[];
  attendance?: AttendanceRecord[];
  studyMaterials?: StudyMaterial[];
  onlineClasses?: OnlineClassSession[];
  assignments?: AssignmentRecord[];
  exams?: ExamDefinition[];
  results?: ExamResult[];
  examResults?: ExamResult[];
  payments?: PaymentRecord[];
  certificates?: CertificateRecord[];
  certificateRequests?: CertificateRequest[];
  notifications?: NotificationItem[];
  gallery?: GalleryItem[];
  enquiries?: EnquiryRecord[];
  tickets?: SupportTicket[];
  supportTickets?: SupportTicket[];
  tasks?: StaffTask[];
  staffTasks?: StaffTask[];
  staff?: UserAccount[];
  auditLogs?: AuditLog[];
  deletedRecords?: {
    courses: { id: string; name?: string; deletedAt?: string }[];
    students: { id: string; fullName?: string; deletedAt?: string }[];
    applications: { id: string; fullName?: string; applicationId?: string; deletedAt?: string }[];
    certificates: { id: string; certificateNo?: string; deletedAt?: string }[];
    marksheets: { id: string; marksheetNo?: string; deletedAt?: string }[];
  };
  districtAnalytics?: DistrictAnalyticsRow[];
}

export function PortalHub({
  courses,
  branding,
  onDataMutated,
  onOpenSuperAdminPortal,
}: {
  courses: Course[];
  branding?: BrandingConfig;
  onDataMutated: () => void;
  onOpenSuperAdminPortal?: () => void;
}) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Auth / Reset states
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [selectedRoleTab, setSelectedRoleTab] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);

  // OTP reset states
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNewPassword, setOtpNewPassword] = useState('');

  // Student self-registration
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    phone: '',
    district: 'Dhubri',
    courseId: courses[0]?.id || '',
    password: '',
  });

  // Inactivity & Session Security state
  const [timeoutMinutes, setTimeoutMinutes] = useState(10);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [expiryWarningOpen, setExpiryWarningOpen] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastKeepaliveSentRef = useRef<number>(0);

  const clearClientSession = useCallback((reason?: string) => {
    setDashboard(null);
    setPassword('');
    setTwoFactorCode('');
    setNeeds2FA(false);
    setExpiryWarningOpen(false);
    if (reason) setNotice(reason);
  }, []);

  const fetchAuthStatus = useCallback(async () => {
    try {
      const s = await apiRequest<AuthStatus>('/api/auth/status');
      setAuthStatus(s);
      if (s.sessionTimeoutMinutes) {
        setTimeoutMinutes(s.sessionTimeoutMinutes);
      }
    } catch {
      // ignore initial auth status check error
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<DashboardPayload>('/api/portal/dashboard');
      setDashboard(data);
      const mins = data.cmsSettings?.sessionTimeoutMinutes || 10;
      setTimeoutMinutes(mins);
      lastActivityRef.current = Date.now();
      setRemainingSeconds(mins * 60);
      setExpiryWarningOpen(false);
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Verify existing HttpOnly cookie session on mount & on browser back/pageshow
  const verifySessionPassively = useCallback(async () => {
    try {
      const me = await apiRequest<{
        user: UserAccount;
        sessionTimeoutMinutes: number;
        remainingSeconds: number;
      }>('/api/auth/me?passive=1');
      setTimeoutMinutes(me.sessionTimeoutMinutes || 10);
      setRemainingSeconds(me.remainingSeconds);
      if (!dashboard) {
        await loadDashboard();
      } else if (me.remainingSeconds <= 60) {
        setExpiryWarningOpen(true);
      }
    } catch {
      if (dashboard) {
        clearClientSession('Session ended or expired. Please sign in again.');
      }
      setLoading(false);
    }
  }, [clearClientSession, dashboard, loadDashboard]);

  useEffect(() => {
    fetchAuthStatus();
    verifySessionPassively();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Protect against back-button / bfcache stale views
  useEffect(() => {
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted || dashboard) {
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
  }, [dashboard, verifySessionPassively]);

  // Activity listener + server keepalive
  useEffect(() => {
    if (!dashboard) return;

    const handleActivity = () => {
      // While the pre-expiry warning modal is open, require explicit confirmation
      if (expiryWarningOpen) return;
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastKeepaliveSentRef.current > 45_000) {
        lastKeepaliveSentRef.current = now;
        apiRequest('/api/auth/keepalive', { method: 'POST' }).catch(() => {
          clearClientSession('Your session has expired due to inactivity.');
        });
      }
    };

    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
    };
  }, [clearClientSession, dashboard, expiryWarningOpen]);

  // Local countdown + periodic passive server session check
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
        clearClientSession(
          `Automatically logged out after ${timeoutMinutes} minutes of inactivity.`
        );
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

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{
        user?: UserAccount;
        suspiciousIp?: boolean;
        requiresTwoFactor?: boolean;
        message?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, twoFactorCode }),
      });
      if (res.requiresTwoFactor) {
        setNeeds2FA(true);
        setNotice(res.message || 'Enter your 6-digit 2FA verification code.');
        return;
      }
      if (res.user) {
        setNeeds2FA(false);
        if (res.suspiciousIp) {
          setNotice('Security notice: Sign-in detected from a new IP address and logged.');
        }
        await loadDashboard();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  }

  async function handleRequestEmail2fa() {
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ message?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, sendEmail2fa: true }),
      });
      setNeeds2FA(true);
      setNotice(res.message || '6-digit 2FA verification code dispatched to your registered email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to dispatch 2FA code.');
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(regForm),
      });
      await loadDashboard();
      onDataMutated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    }
  }

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setOtpRequested(true);
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to request OTP.');
    }
  }

  async function handleResetWithOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-with-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp: otpCode, newPassword: otpNewPassword }),
      });
      setOtpRequested(false);
      setOtpCode('');
      setOtpNewPassword('');
      setAuthMode('login');
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP reset failed.');
    }
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // continue client cleanup
    }
    clearClientSession('You have signed out securely.');
  }

  async function handleLogoutAllDevices() {
    try {
      const res = await apiRequest<{ revokedCount: number }>('/api/auth/logout-all', {
        method: 'POST',
      });
      clearClientSession(`Signed out from ${res.revokedCount} active session(s) across devices.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to revoke all sessions.');
    }
  }

  function formatCountdown(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (loading && !dashboard) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-slate-600">
        Verifying encrypted session...
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-8">
        <div className="text-center space-y-3">
          {branding?.loginLogoUrl && (
            <img
              src={branding.loginLogoUrl}
              alt="Success Point Portal Emblem"
              className="h-14 w-auto mx-auto object-contain"
            />
          )}
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            Success Point Encrypted Portal Gateway
          </p>
          <h1 className="text-3xl font-bold text-[#0B1E3D]">
            Institutional Portals &amp; Role-Based Login
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            Protected by HttpOnly cookie sessions, CSRF headers, bcrypt password hashing, 2FA
            for senior administrators, and automatic {authStatus?.sessionTimeoutMinutes || 10}-minute
            inactivity lockout.
          </p>
        </div>

        {/* All 10 Role Tabs */}
        <div className="flex flex-wrap justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
          {ALL_USER_ROLES.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedRoleTab(tab.id);
                setAuthMode('login');
                setError('');
                setNotice('');
              }}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap ${
                selectedRoleTab === tab.id
                  ? 'bg-[#0B1E3D] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Login / Register / OTP Reset / First-Run Claim */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
            {selectedRoleTab === 'student' && (
              <div className="flex gap-2 border-b border-slate-200 pb-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`px-3 py-1.5 rounded-md ${
                    authMode === 'login' ? 'bg-blue-50 text-blue-800' : 'text-slate-600'
                  }`}
                >
                  Student Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`px-3 py-1.5 rounded-md ${
                    authMode === 'register' ? 'bg-blue-50 text-blue-800' : 'text-slate-600'
                  }`}
                >
                  New Student Registration
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                {notice}
              </div>
            )}

            {selectedRoleTab === 'super_admin' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
                <p className="text-xs font-bold text-[#0B1E3D] uppercase">
                  Dedicated Super Admin Security Gateway
                </p>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Primary Super Admin activation, email ownership verification, and 2FA login operate
                  through the dedicated gateway at <span className="font-mono">/super-admin/login</span>.
                </p>
                {onOpenSuperAdminPortal && (
                  <button
                    type="button"
                    onClick={onOpenSuperAdminPortal}
                    className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900"
                  >
                    Open Dedicated Super Admin Login
                  </button>
                )}
              </div>
            )}

            {authMode === 'register' && selectedRoleTab === 'student' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <h2 className="text-lg font-bold text-[#0B1E3D]">Create Student Account</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    placeholder="Full Name *"
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Mobile Number *"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email Address *"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={regForm.district}
                    onChange={(e) => setRegForm({ ...regForm, district: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {ASSAM_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={regForm.courseId}
                  onChange={(e) => setRegForm({ ...regForm, courseId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="Strong Password (8+ chars, Upper, Lower, Number, Symbol) *"
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Automatically allocates Student ID, Registration Number &amp; Admission Number.
                  </p>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Register &amp; Open Student Dashboard
                </button>
              </form>
            ) : authMode === 'forgot' ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[#0B1E3D]">OTP Password Recovery</h2>
                {!otpRequested ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <input
                      type="email"
                      required
                      placeholder="Registered Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Back to Sign In
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-[#0B1E3D] px-5 py-2 text-sm font-semibold text-white"
                      >
                        Send 6-Digit OTP
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetWithOtp} className="space-y-3">
                    <input
                      type="email"
                      required
                      placeholder="Registered Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      maxLength={6}
                      placeholder="6-Digit OTP Code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="New Strong Password (8+ chars, Upper, Lower, Digit, Symbol)"
                      value={otpNewPassword}
                      onChange={(e) => setOtpNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setOtpRequested(false);
                          setAuthMode('login');
                        }}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white"
                      >
                        Verify OTP &amp; Reset Password
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-lg font-bold text-[#0B1E3D]">
                  {ALL_USER_ROLES.find((r) => r.id === selectedRoleTab)?.label || 'Institutional'}{' '}
                  Sign In
                </h2>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Institutional Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@successpointdhubri.edu.in"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {needs2FA && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Two-Factor Authentication Code (6 digits)
                      </label>
                      <button
                        type="button"
                        onClick={handleRequestEmail2fa}
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Send Email 2FA Code
                      </button>
                    </div>
                    <input
                      required
                      maxLength={6}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="Enter 6-digit authenticator or email OTP code"
                      className="w-full rounded-lg border border-blue-400 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpRequested(false);
                      setAuthMode('forgot');
                    }}
                    className="text-blue-700 hover:underline"
                  >
                    Forgot password? Reset via Email OTP
                  </button>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Authenticate &amp; Open Workspace
                </button>
              </form>
            )}
          </div>

          {/* Security & Role Governance Overview (Zero hardcoded passwords) */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#0B1E3D]">
              <Shield className="h-5 w-5 text-blue-700" />
              <h3 className="text-base font-bold">Institutional Access &amp; Security Policy</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every portal session is protected with HttpOnly cookie authentication, per-request
              CSRF verification, and server-side RBAC permissions across Dhubri HQ and Assam
              district centres.
            </p>
            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-[#0B1E3D]">1. Zero Default Passwords</p>
                <p className="text-slate-600 mt-0.5">
                  Passwords are hashed using bcrypt. Primary Super Admin activates via email
                  ownership link and 2FA; staff and district accounts are provisioned by Super
                  Admin or recovered via 6-digit Email OTP.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-[#0B1E3D]">2. Automatic Inactivity Lockout</p>
                <p className="text-slate-600 mt-0.5">
                  Idle dashboards warn at 60 seconds remaining and lock cleanly after{' '}
                  <span className="font-mono font-semibold">
                    {authStatus?.sessionTimeoutMinutes || 10} minutes
                  </span>{' '}
                  with server-side session revocation.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-[#0B1E3D]">3. Account Lockout &amp; Audit Trail</p>
                <p className="text-slate-600 mt-0.5">
                  5 consecutive failed login attempts trigger a 15-minute temporary lock, suspicious
                  IP monitoring, and append-only audit logging.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCentralOpsRole = [
    'super_admin',
    'admin',
    'exam_controller',
    'office_manager',
    'admission_officer',
    'accountant',
    'staff',
  ].includes(dashboard.role);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Workspace Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 no-print">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase">
            {ALL_USER_ROLES.find((r) => r.id === dashboard.role)?.label || dashboard.role} Workspace
            · {dashboard.user.district}
          </p>
          <h1 className="text-xl font-bold text-[#0B1E3D]">{dashboard.user.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
            title="Automatic inactivity logout countdown"
          >
            <Clock className="h-3.5 w-3.5 text-blue-700" />
            <span>Auto-Lock:</span>
            <span className="font-mono font-bold text-[#0B1E3D]">
              {formatCountdown(remainingSeconds)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogoutAllDevices}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Lock className="h-3.5 w-3.5" />
            Sign Out All Devices
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Role-Specific Views */}
      {dashboard.role === 'student' && (
        <StudentDashboardView
          data={dashboard}
          onRefresh={async () => {
            await loadDashboard();
            onDataMutated();
          }}
        />
      )}
      {dashboard.role === 'franchise' && (
        <FranchiseDashboardView
          data={dashboard}
          onRefresh={async () => {
            await loadDashboard();
            onDataMutated();
          }}
        />
      )}
      {dashboard.role === 'district_coordinator' && (
        <CoordinatorDashboardView
          data={dashboard}
          onRefresh={async () => {
            await loadDashboard();
            onDataMutated();
          }}
        />
      )}
      {isCentralOpsRole && (
        <AdminDashboardView
          data={dashboard}
          onRefresh={async () => {
            await loadDashboard();
            onDataMutated();
          }}
        />
      )}

      {/* Pre-Expiry Inactivity Warning Modal */}
      {expiryWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 no-print">
          <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-amber-800">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-bold text-[#0B1E3D]">Session Expiring Due to Inactivity</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              For institutional data security, your authenticated session will automatically sign out
              in{' '}
              <span className="font-mono font-bold text-red-700">{remainingSeconds} seconds</span>.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
    </div>
  );
}

/* ==================== STUDENT DASHBOARD ==================== */
function StudentDashboardView({
  data,
  onRefresh,
}: {
  data: DashboardPayload;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<
    | 'overview'
    | 'materials'
    | 'classes'
    | 'assignments'
    | 'exams'
    | 'fees'
    | 'documents'
    | 'support'
  >('overview');
  const [msg, setMsg] = useState('');
  const [payAmount, setPayAmount] = useState('1600');
  const [payMethod, setPayMethod] = useState<'UPI' | 'Card' | 'NetBanking'>('UPI');
  const [ticketSub, setTicketSub] = useState('');
  const [ticketMsg, setTicketMsg] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [asgInput, setAsgInput] = useState<Record<string, string>>({});
  const [examAnswers, setExamAnswers] = useState<Record<string, number[]>>({});
  const [migForm, setMigForm] = useState({
    targetInstitution: '',
    lastExamDetails: '',
    reason: '',
    authorizationType: 'Institutional Transfer Certificate' as MigrationRecord['authorizationType'],
  });

  const profile = data.profile;
  const attendance = data.attendance || [];
  const presentCount = attendance.filter(
    (a) => a.status === 'Present' || a.status === 'Late'
  ).length;
  const attPct = attendance.length ? Math.round((presentCount / attendance.length) * 100) : 100;

  async function submitAssignment(id: string) {
    setMsg('');
    try {
      await apiRequest(`/api/student/assignments/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ submissionText: asgInput[id] || '' }),
      });
      setMsg('Assignment submitted for faculty evaluation.');
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Unable to submit assignment.');
    }
  }

  async function submitExam(exam: ExamDefinition) {
    setMsg('');
    try {
      const answers = examAnswers[exam.id] || [];
      const res = await apiRequest<ExamResult>(`/api/student/exams/${exam.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      setMsg(`Exam graded! Score: ${res.score}/${res.totalMarks} (${res.grade} · ${res.status})`);
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Exam submission failed.');
    }
  }

  async function payFee(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const receipt = await apiRequest<PaymentRecord>('/api/student/payments', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount), method: payMethod }),
      });
      setMsg(`Fee payment verified! Receipt ${receipt.receiptNo} generated.`);
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Payment failed.');
    }
  }

  async function applyMigration(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const rec = await apiRequest<MigrationRecord>('/api/student/migration-apply', {
        method: 'POST',
        body: JSON.stringify(migForm),
      });
      setMigForm({
        targetInstitution: '',
        lastExamDetails: '',
        reason: '',
        authorizationType: 'Institutional Transfer Certificate',
      });
      setMsg(`Migration application ${rec.migrationNo} submitted for verification.`);
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Unable to apply for Migration Certificate.');
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await apiRequest('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: ticketSub, category: 'Student Support', message: ticketMsg }),
      });
      setTicketSub('');
      setTicketMsg('');
      setMsg('Support ticket logged with Dhubri Helpdesk.');
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Unable to submit ticket.');
    }
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(pwForm),
      });
      setPwForm({ currentPassword: '', newPassword: '' });
      setMsg(res.message);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Password change failed.');
    }
  }

  function downloadMaterial(m: StudyMaterial) {
    const blob = new Blob([m.contentBody], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 no-print">
        {(
          [
            ['overview', 'Profile & Status'],
            ['materials', 'Study Materials'],
            ['classes', 'Online Classes'],
            ['assignments', 'Assignments'],
            ['exams', 'Exams & Marksheets'],
            ['fees', 'Fee Payment'],
            ['documents', 'ID / Admit / Migration / Certs'],
            ['support', 'Helpdesk & Password'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap ${
              tab === id ? 'bg-[#0B1E3D] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 no-print">
          {msg}
        </div>
      )}

      {tab === 'overview' && profile && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Student ID &amp; Roll No.</p>
              <p className="mt-1 font-mono text-sm font-bold text-[#0B1E3D]">{profile.studentId}</p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Roll: {profile.rollNumber}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Registration &amp; Admission</p>
              <p className="mt-1 font-mono text-xs font-bold text-[#0B1E3D]">
                {profile.registrationNumber}
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Adm: {profile.admissionNumber}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Attendance &amp; Status</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700">
                {attPct}% · {profile.admissionStatus}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Fee Balance</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#0B1E3D]">
                ₹{Math.max(0, profile.feeTotal - profile.feePaid).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-3 text-sm">
              <h3 className="text-base font-bold text-[#0B1E3D]">Student Profile &amp; Course</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <p>
                  <strong>Full Name:</strong> {profile.fullName}
                </p>
                <p>
                  <strong>Father&apos;s Name:</strong> {profile.fatherName}
                </p>
                <p>
                  <strong>Mother&apos;s Name:</strong> {profile.motherName}
                </p>
                <p>
                  <strong>Mobile:</strong> <span className="font-mono">{profile.mobile}</span>
                </p>
                <p>
                  <strong>Batch:</strong> {profile.academicSession}
                </p>
                <p>
                  <strong>Registered:</strong>{' '}
                  <span className="font-mono">{profile.registrationDate}</span>
                </p>
                <p className="sm:col-span-2">
                  <strong>Course:</strong> {profile.courseName} ({profile.courseCode})
                </p>
                <p className="sm:col-span-2">
                  <strong>Study Centre:</strong> {profile.centreName} ({profile.centreCode})
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h3 className="text-base font-bold text-[#0B1E3D]">Recent Attendance Log</h3>
              <div className="divide-y divide-slate-200 text-xs">
                {attendance.map((a) => (
                  <div key={a.id} className="py-2 flex items-center justify-between">
                    <span className="font-mono text-slate-700">{a.date}</span>
                    <span className="font-semibold text-slate-900">{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid gap-4 md:grid-cols-2">
          {(data.studyMaterials || []).map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
              <p className="text-xs font-medium text-blue-700">
                {m.type} · {m.uploadedBy}
              </p>
              <h3 className="text-base font-bold text-[#0B1E3D]">{m.title}</h3>
              <p className="text-xs text-slate-600">{m.summary}</p>
              <button
                type="button"
                onClick={() => downloadMaterial(m)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
              >
                <Download className="h-3.5 w-3.5" />
                Download Study Material
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'classes' && (
        <div className="grid gap-4 md:grid-cols-2">
          {(data.onlineClasses || []).map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
              <p className="text-xs font-mono text-blue-700">
                {c.scheduleDate} · {c.scheduleTime}
              </p>
              <h3 className="text-base font-bold text-[#0B1E3D]">{c.title}</h3>
              <p className="text-xs text-slate-600">
                Instructor: {c.instructor} · {c.platform}
              </p>
              <a
                href={c.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Join Live Classroom
              </a>
            </div>
          ))}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="space-y-4">
          {(data.assignments || []).map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-base font-bold text-[#0B1E3D]">{a.title}</h3>
                <span className="font-mono text-xs text-slate-600">
                  Due: {a.dueDate} · Status: {a.status}
                </span>
              </div>
              {a.status === 'Pending' ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Enter your assignment summary / code / solution link..."
                    value={asgInput[a.id] || ''}
                    onChange={(e) => setAsgInput({ ...asgInput, [a.id]: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => submitAssignment(a.id)}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Submit Assignment
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-700 space-y-1">
                  <p>
                    <strong>Submission:</strong> {a.submissionText}
                  </p>
                  {a.grade && (
                    <p>
                      <strong>Grade:</strong> {a.grade} ({a.feedback})
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'exams' && (
        <div className="space-y-6">
          {(data.exams || []).map((ex) => (
            <div key={ex.id} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-[#0B1E3D]">{ex.title}</h3>
                  <p className="text-xs text-slate-600">
                    Duration: {ex.durationMinutes} mins · Total Marks: {ex.totalMarks}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {ex.questions.map((q, qIdx) => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt, optIdx) => {
                        const selected = (examAnswers[ex.id] || [])[qIdx] === optIdx;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              const prev = [...(examAnswers[ex.id] || [])];
                              prev[qIdx] = optIdx;
                              setExamAnswers({ ...examAnswers, [ex.id]: prev });
                            }}
                            className={`rounded-lg border px-3 py-2 text-left text-xs ${
                              selected
                                ? 'border-blue-700 bg-blue-50 font-semibold text-blue-900'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => submitExam(ex)}
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Submit Online Assessment
              </button>
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h3 className="text-base font-bold text-[#0B1E3D]">Online Quiz Results</h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">Exam</th>
                  <th className="py-2 text-right">Score</th>
                  <th className="py-2">Grade</th>
                  <th className="py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {(data.results || []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2.5 font-medium">{r.examTitle}</td>
                    <td className="py-2.5 text-right font-mono">
                      {r.score}/{r.totalMarks}
                    </td>
                    <td className="py-2.5 font-mono">{r.grade}</td>
                    <td className="py-2.5 font-semibold text-emerald-700">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(data.marksheets || []).length > 0 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-[#0B1E3D]">Published Official Marksheets</h3>
              {(data.marksheets || []).map((m) => (
                <MarksheetView
                  key={m.id}
                  marksheet={m}
                  branding={data.branding}
                  templates={data.documentTemplates}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'fees' && profile && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={payFee}
            className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-4 self-start"
          >
            <h3 className="text-base font-bold text-[#0B1E3D]">Online Fee Checkout</h3>
            <p className="text-xs text-slate-600">
              Paid: <span className="font-mono font-semibold">₹{profile.feePaid}</span> / Total:{' '}
              <span className="font-mono font-semibold">₹{profile.feeTotal}</span>
            </p>
            <input
              type="number"
              min={100}
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as 'UPI' | 'Card' | 'NetBanking')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="UPI">UPI (Razorpay / GPay / PhonePe)</option>
              <option value="Card">Debit / Credit Card</option>
              <option value="NetBanking">NetBanking</option>
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Pay ₹{payAmount} Securely
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-[#0B1E3D] mb-3">Payment History</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 px-3">Receipt</th>
                  <th className="py-2 px-3">Course</th>
                  <th className="py-2 px-3">Reference</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.payments || []).map((p) => (
                  <FeeReceiptRow key={p.id} payment={p} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'documents' && profile && (
        <div className="space-y-10">
          <StudentIdCardView
            student={profile}
            branding={data.branding}
            templates={data.documentTemplates}
            onDownloadLog={async () => {
              await apiRequest(`/api/students/${profile.id}/id-history`, {
                method: 'POST',
                body: JSON.stringify({ action: 'PDF Downloaded' }),
              });
            }}
          />

          {(data.admitCards || []).length > 0 ? (
            (data.admitCards || []).map((ac) => (
              <AdmitCardView
                key={ac.id}
                admitCard={ac}
                student={profile}
                branding={data.branding}
                templates={data.documentTemplates}
              />
            ))
          ) : (
            <AdmitCardView
              student={profile}
              branding={data.branding}
              templates={data.documentTemplates}
            />
          )}

          {(data.marksheets || []).map((m) => (
            <MarksheetView
              key={m.id}
              marksheet={m}
              branding={data.branding}
              templates={data.documentTemplates}
            />
          ))}

          {(data.certificates || []).map((cert) => (
            <CertificateView
              key={cert.id}
              cert={cert}
              branding={data.branding}
              templates={data.documentTemplates}
              onDownloadLog={async () => {
                await apiRequest(`/api/certificates/${cert.id}/reprint`, {
                  method: 'POST',
                  body: JSON.stringify({ reason: 'Student PDF Download' }),
                });
              }}
            />
          ))}

          {/* Migration / Transfer Certificate Self-Application & Output */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 no-print">
            <div>
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Apply for Migration / Institutional Transfer Certificate
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Requires full fee clearance and Head Office Registrar verification prior to issuance.
              </p>
            </div>
            <form onSubmit={applyMigration} className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Destination Institution / University *"
                value={migForm.targetInstitution}
                onChange={(e) => setMigForm({ ...migForm, targetInstitution: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Last Examination Passed / Session *"
                value={migForm.lastExamDetails}
                onChange={(e) => setMigForm({ ...migForm, lastExamDetails: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={migForm.authorizationType}
                onChange={(e) =>
                  setMigForm({
                    ...migForm,
                    authorizationType: e.target.value as MigrationRecord['authorizationType'],
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="Institutional Transfer Certificate">
                  Institutional Transfer Certificate
                </option>
                <option value="Awarding Body Referral Letter">Awarding Body Referral Letter</option>
              </select>
              <input
                required
                placeholder="Reason for Migration / Transfer *"
                value={migForm.reason}
                onChange={(e) => setMigForm({ ...migForm, reason: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="sm:col-span-2 rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900"
              >
                Submit Migration Certificate Application
              </button>
            </form>
          </div>

          {(data.migrations || []).map((mig) =>
            mig.status === 'Approved' ? (
              <MigrationCertificateView
                key={mig.id}
                migration={mig}
                branding={data.branding}
                templates={data.documentTemplates}
              />
            ) : (
              <div
                key={mig.id}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <span>
                  <strong className="font-mono text-[#0B1E3D]">{mig.migrationNo}</strong> · To:{' '}
                  {mig.targetInstitution} · {mig.remarks}
                </span>
                <span className="font-bold text-blue-700">Status: {mig.status}</span>
              </div>
            )
          )}
        </div>
      )}

      {tab === 'support' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={createTicket}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-[#0B1E3D]">Student Helpdesk Ticket</h3>
            <input
              required
              placeholder="Ticket Subject"
              value={ticketSub}
              onChange={(e) => setTicketSub(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              required
              rows={3}
              placeholder="Describe your academic or document support query..."
              value={ticketMsg}
              onChange={(e) => setTicketMsg(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
            >
              Submit Support Ticket
            </button>

            <div className="pt-4 space-y-2">
              {(data.tickets || []).map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-900">
                    {t.subject} · <span className="text-blue-700">{t.status}</span>
                  </p>
                  <p className="text-slate-600 mt-1">{t.message}</p>
                  {t.reply && <p className="text-emerald-800 mt-1">Reply: {t.reply}</p>}
                </div>
              ))}
            </div>
          </form>

          <form
            onSubmit={updatePassword}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 self-start"
          >
            <h3 className="text-base font-bold text-[#0B1E3D]">Change Account Password</h3>
            <p className="text-xs text-slate-500">
              Minimum 8 characters including uppercase, lowercase, number, and symbol.
            </p>
            <input
              type="password"
              required
              placeholder="Current Password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="New Strong Password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
            >
              Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==================== FRANCHISE DASHBOARD ==================== */
function FranchiseDashboardView({
  data,
  onRefresh,
}: {
  data: DashboardPayload;
  onRefresh: () => Promise<void>;
}) {
  const centre = data.centre!;
  const comm = data.commissionSummary!;
  const [stuForm, setStuForm] = useState({
    fullName: '',
    fatherName: '',
    mobile: '',
    email: '',
    courseId: (data.courses || [])[0]?.id || '',
  });
  const [feeStuId, setFeeStuId] = useState((data.students || [])[0]?.id || '');
  const [feeAmt, setFeeAmt] = useState('2400');
  const [msg, setMsg] = useState('');

  async function admitStudent(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const created = await apiRequest<StudentProfile>('/api/franchise/students', {
        method: 'POST',
        body: JSON.stringify(stuForm),
      });
      setStuForm({ ...stuForm, fullName: '', fatherName: '', mobile: '', email: '' });
      setMsg(
        `Student admitted (${created.studentId} / ${created.registrationNumber}) under ${centre.code}!`
      );
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Unable to admit student.');
    }
  }

  async function recordFee(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await apiRequest('/api/payments/record', {
        method: 'POST',
        body: JSON.stringify({ studentId: feeStuId, amount: Number(feeAmt), method: 'Cash' }),
      });
      setMsg('Fee payment recorded & commission updated.');
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Unable to record fee.');
    }
  }

  async function requestCertificate(studentId: string) {
    setMsg('');
    try {
      await apiRequest('/api/franchise/certificate-requests', {
        method: 'POST',
        body: JSON.stringify({ studentId }),
      });
      setMsg('Certificate authorization request submitted to Dhubri HQ.');
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Request failed.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Centre Code &amp; Status</p>
          <p className="mt-1 font-mono text-base font-bold text-[#0B1E3D]">
            {centre.code} · {centre.status}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Centre Students</p>
          <p className="mt-1 font-mono text-xl font-bold text-[#0B1E3D]">
            {(data.students || []).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Total Fee Collection</p>
          <p className="mt-1 font-mono text-xl font-bold text-[#0B1E3D]">
            ₹{comm.totalCollected.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Partner Share ({comm.commissionRate}%)</p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
            ₹{comm.commissionEarned.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={admitStudent}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
        >
          <h3 className="text-base font-bold text-[#0B1E3D]">Register &amp; Admit Student</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Student Full Name"
              value={stuForm.fullName}
              onChange={(e) => setStuForm({ ...stuForm, fullName: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Father's Name"
              value={stuForm.fatherName}
              onChange={(e) => setStuForm({ ...stuForm, fatherName: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Mobile Number"
              value={stuForm.mobile}
              onChange={(e) => setStuForm({ ...stuForm, mobile: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="Email"
              value={stuForm.email}
              onChange={(e) => setStuForm({ ...stuForm, email: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <select
            value={stuForm.courseId}
            onChange={(e) => setStuForm({ ...stuForm, courseId: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {(data.courses || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
          >
            Admit Student
          </button>
        </form>

        <form
          onSubmit={recordFee}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
        >
          <h3 className="text-base font-bold text-[#0B1E3D]">Record Centre Fee Collection</h3>
          <select
            value={feeStuId}
            onChange={(e) => setFeeStuId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {(data.students || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentId} — {s.fullName}
              </option>
            ))}
          </select>
          <input
            type="number"
            required
            value={feeAmt}
            onChange={(e) => setFeeAmt(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
          >
            Record Payment
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
        <h3 className="text-base font-bold text-[#0B1E3D] mb-3">
          Centre Student Records &amp; Certificate Requests
        </h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2">Student ID / Reg No.</th>
              <th className="py-2">Student Name</th>
              <th className="py-2">Course</th>
              <th className="py-2 text-right">Fee Paid</th>
              <th className="py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data.students || []).map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-2.5 font-mono text-xs">
                  {s.studentId}
                  <div className="text-[11px] text-slate-500">{s.registrationNumber}</div>
                </td>
                <td className="py-2.5 font-medium">{s.fullName}</td>
                <td className="py-2.5 text-xs text-slate-600">{s.courseName}</td>
                <td className="py-2.5 text-right font-mono">
                  ₹{s.feePaid.toLocaleString('en-IN')} / ₹{s.feeTotal.toLocaleString('en-IN')}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => requestCertificate(s.id)}
                    className="rounded-md border border-blue-700 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Request Certificate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== DISTRICT COORDINATOR DASHBOARD ==================== */
function CoordinatorDashboardView({
  data,
  onRefresh,
}: {
  data: DashboardPayload;
  onRefresh: () => Promise<void>;
}) {
  const totalDistrictRevenue = (data.payments || []).reduce(
    (sum, p) => (p.status === 'Paid' ? sum + p.amount : sum),
    0
  );

  async function approveApp(id: string) {
    await apiRequest(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'Approved',
        remarks: `Approved by District Coordinator (${data.district})`,
      }),
    });
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Assigned District</p>
          <p className="mt-1 text-lg font-bold text-[#0B1E3D]">{data.district}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">District Centres</p>
          <p className="mt-1 font-mono text-xl font-bold text-[#0B1E3D]">
            {(data.centres || []).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">District Students</p>
          <p className="mt-1 font-mono text-xl font-bold text-[#0B1E3D]">
            {(data.students || []).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">District Fee Revenue</p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
            ₹{totalDistrictRevenue.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 overflow-x-auto">
        <h3 className="text-base font-bold text-[#0B1E3D]">
          {data.district} District Applications
        </h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2">App ID</th>
              <th className="py-2">Applicant</th>
              <th className="py-2">Course</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data.applications || []).map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-2.5 font-mono text-xs">{a.applicationId}</td>
                <td className="py-2.5 font-medium">{a.fullName}</td>
                <td className="py-2.5 text-xs text-slate-600">{a.courseName}</td>
                <td className="py-2.5 text-xs font-semibold">{a.status}</td>
                <td className="py-2.5 text-right">
                  {a.status !== 'Approved' && (
                    <button
                      type="button"
                      onClick={() => approveApp(a.id)}
                      className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== UNIFIED OPERATIONS & SUPER ADMIN CONSOLE ==================== */
type AdminTab =
  | 'overview'
  | 'students'
  | 'courses'
  | 'applications'
  | 'admit_cards'
  | 'marksheets'
  | 'migrations'
  | 'certificates'
  | 'fees'
  | 'staff'
  | 'franchises'
  | 'notifications'
  | 'gallery'
  | 'cms'
  | 'branding'
  | 'security'
  | 'attendance'
  | 'reports'
  | 'enquiries'
  | 'tickets'
  | 'tasks'
  | 'audit';

export function AdminDashboardView({
  data,
  onRefresh,
}: {
  data: DashboardPayload;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const hasPerm = (perm: PermissionKey) =>
    data.role === 'super_admin' || Boolean(data.permissions?.includes(perm));

  // Student ID Card Preview State
  const [previewIdStudent, setPreviewIdStudent] = useState<StudentProfile | null>(null);

  // Course management states
  const [newCourse, setNewCourse] = useState({
    name: '',
    category: COURSE_CATEGORIES[0],
    description: '',
    eligibility: 'Class 10 Passed',
    duration: '6 Months',
    fees: '5000',
    mode: 'Offline',
  });
  const [editFeeMap, setEditFeeMap] = useState<Record<string, string>>({});

  // Admit Card Automation states
  const [admitForm, setAdmitForm] = useState({
    studentDbId: (data.students || [])[0]?.id || '',
    examName: 'Annual Theory & Practical Examination 2026',
    examSession: 'December 2026',
    examDate: '2026-12-18',
    examTiming: '10:00 AM – 01:00 PM IST',
    subjectsText: 'Paper I: Core Theory Evaluation\nPaper II: Practical & Lab Assessment',
    approveNow: true,
  });
  const [bulkAdmitForm, setBulkAdmitForm] = useState({
    courseId: (data.courses || [])[0]?.id || '',
    examName: 'Semester End Examination 2026',
    examDate: '2026-12-20',
    examTiming: '10:00 AM – 01:00 PM IST',
    approveNow: false,
  });
  const [previewAdmit, setPreviewAdmit] = useState<AdmitCardRecord | null>(null);

  // Marksheet Automation & Excel Import states
  const [mksForm, setMksForm] = useState({
    studentDbId: (data.students || [])[0]?.id || '',
    examName: 'Final Term Assessment 2026',
  });
  const [subjectRows, setSubjectRows] = useState<SubjectMark[]>([
    {
      subjectCode: 'TH-101',
      subjectName: 'Core Theory Paper',
      maxMarks: 100,
      passingMarks: 35,
      obtainedMarks: 82,
    },
    {
      subjectCode: 'PR-102',
      subjectName: 'Practical & Lab Evaluation',
      maxMarks: 100,
      passingMarks: 40,
      obtainedMarks: 88,
    },
  ]);
  const [importExamName, setImportExamName] = useState('Term End Practical Assessment 2026');
  const [previewMarksheet, setPreviewMarksheet] = useState<MarksheetRecord | null>(null);
  const [editingMarksheet, setEditingMarksheet] = useState<MarksheetRecord | null>(null);
  const [editSubjects, setEditSubjects] = useState<SubjectMark[]>([]);
  const [editReason, setEditReason] = useState('');

  // Certificate Automation (All 12 types + Bulk + Cancel/Correct)
  const [certForm, setCertForm] = useState({
    studentId: (data.students || [])[0]?.id || '',
    documentType: CERTIFICATE_TYPES[0] as CertificateDocumentType,
    grade: 'A+ (90%)',
    replacesCertificateNo: '',
    correctionNote: '',
  });
  const [bulkCertForm, setBulkCertForm] = useState({
    courseId: (data.courses || [])[0]?.id || '',
    documentType: CERTIFICATE_TYPES[0] as CertificateDocumentType,
    grade: 'A (85%)',
  });
  const [previewCert, setPreviewCert] = useState<CertificateRecord | null>(null);

  // Migration preview
  const [previewMig, setPreviewMig] = useState<MigrationRecord | null>(null);

  // Fee recording state
  const [feeForm, setFeeForm] = useState({
    studentId: (data.students || [])[0]?.id || '',
    amount: '2500',
    method: 'Cash' as 'UPI' | 'Card' | 'NetBanking' | 'Cash',
  });

  // Notice, User, Gallery, Task states
  const [newNotice, setNewNotice] = useState({
    title: '',
    category: 'Announcement',
    district: 'All Assam',
    summary: '',
  });
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff' as UserRole,
    district: 'Dhubri',
    password: '',
  });
  const [newGal, setNewGal] = useState({ title: '', category: 'Photo', caption: '' });
  const [newTask, setNewTask] = useState({
    title: '',
    assignedTo: (data.users || []).find((u) => u.role === 'staff')?.id || '',
    priority: 'High',
    dueDate: '2026-12-05',
  });

  const ov = data.overview!;

  async function runAction(fn: () => Promise<void>, successMessage: string) {
    setErrorMsg('');
    setFeedback('');
    try {
      await fn();
      setFeedback(successMessage);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed.');
    }
  }

  async function handleExcelUpload(file: File) {
    setErrorMsg('');
    setFeedback('');
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const parsed = rawRows.map((r) => ({
        studentId: String(r.studentId || r.StudentID || r.rollNumber || r.RollNumber || ''),
        studentName: String(r.studentName || r.StudentName || r.Name || ''),
        subjectCode: String(r.subjectCode || r.SubjectCode || 'PAPER-1'),
        subjectName: String(r.subjectName || r.SubjectName || 'Consolidated Marks'),
        maxMarks: Number(r.maxMarks || r.MaxMarks || 100),
        passingMarks: Number(r.passingMarks || r.PassingMarks || 35),
        obtainedMarks: Number(r.obtainedMarks || r.ObtainedMarks || 0),
      }));
      const res = await apiRequest<{ imported: number }>('/api/admin/marksheets/import', {
        method: 'POST',
        body: JSON.stringify({ examName: importExamName, rows: parsed }),
      });
      setFeedback(`Imported ${res.imported} marksheet(s) from ${file.name}.`);
      await onRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse or import Excel/CSV file.');
    }
  }

  const allNavItems: {
    id: AdminTab;
    label: string;
    icon: typeof LayoutDashboard;
    allowed: boolean;
  }[] = [
    { id: 'overview', label: 'Overview & KPIs', icon: LayoutDashboard, allowed: true },
    {
      id: 'students',
      label: 'Students & ID Cards',
      icon: Users,
      allowed: hasPerm('manage_students'),
    },
    { id: 'courses', label: 'Courses & Fees', icon: BookOpen, allowed: hasPerm('manage_courses') },
    {
      id: 'applications',
      label: 'Admissions Queue',
      icon: FileSpreadsheet,
      allowed: hasPerm('manage_admissions'),
    },
    {
      id: 'admit_cards',
      label: 'Admit Cards',
      icon: FileCheck2,
      allowed: hasPerm('manage_exams_marksheets'),
    },
    {
      id: 'marksheets',
      label: 'Marksheets & Excel Import',
      icon: FileText,
      allowed: hasPerm('manage_exams_marksheets'),
    },
    {
      id: 'migrations',
      label: 'Migration Certificates',
      icon: History,
      allowed: hasPerm('manage_migrations') || hasPerm('manage_certificates'),
    },
    {
      id: 'certificates',
      label: 'Digital Certificates (12)',
      icon: Award,
      allowed: hasPerm('manage_certificates'),
    },
    { id: 'fees', label: 'Fee Ledger & Receipts', icon: CreditCard, allowed: hasPerm('manage_fees') },
    {
      id: 'staff',
      label: 'Users & Role Access',
      icon: KeyRound,
      allowed: hasPerm('manage_users_roles'),
    },
    {
      id: 'franchises',
      label: 'Franchises & Centres',
      icon: Building2,
      allowed: hasPerm('manage_franchises'),
    },
    {
      id: 'notifications',
      label: 'Notices & Circulars',
      icon: Megaphone,
      allowed: hasPerm('manage_notices_gallery'),
    },
    {
      id: 'gallery',
      label: 'Media Gallery',
      icon: Plus,
      allowed: hasPerm('manage_notices_gallery'),
    },
    { id: 'cms', label: 'Website Visual CMS', icon: Settings, allowed: hasPerm('manage_cms_branding') },
    {
      id: 'branding',
      label: 'Logos, Templates & WhatsApp',
      icon: ImageIcon,
      allowed: hasPerm('manage_cms_branding') || hasPerm('manage_whatsapp'),
    },
    {
      id: 'security',
      label: 'Security, Sessions & Backups',
      icon: Lock,
      allowed: hasPerm('manage_security_sessions') || hasPerm('manage_backups'),
    },
    {
      id: 'attendance',
      label: 'Attendance Register',
      icon: CalendarCheck,
      allowed: hasPerm('manage_students'),
    },
    { id: 'reports', label: 'District Reports', icon: FileSpreadsheet, allowed: true },
    { id: 'enquiries', label: 'Web Enquiries', icon: Ticket, allowed: hasPerm('manage_students') },
    { id: 'tickets', label: 'Support Tickets', icon: Ticket, allowed: hasPerm('manage_students') },
    {
      id: 'tasks',
      label: 'Staff Tasks',
      icon: CheckCircle2,
      allowed: hasPerm('manage_users_roles') || data.role === 'staff',
    },
    { id: 'audit', label: 'Immutable Audit Logs', icon: Shield, allowed: hasPerm('view_audit_logs') },
  ];

  const visibleNavItems = allNavItems.filter((item) => item.allowed);

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      <aside className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3 space-y-1 no-print">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setFeedback('');
                setErrorMsg('');
              }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                active ? 'bg-[#0B1E3D] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {feedback && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 no-print">
            {feedback}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 no-print">
            {errorMsg}
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Total Students', ov.totalStudents],
                ['Total Applications', ov.totalApplications],
                ['Approved Admissions', ov.approvedAdmissions],
                ['Pending Applications', ov.pendingApplications],
                ['Total Courses', ov.totalCourses],
                ['Staff & Coordinators', ov.totalStaff],
                ['Active / Total Centres', `${ov.activeFranchises}/${ov.totalFranchises}`],
                ['Total Revenue Collected', `₹${ov.totalRevenue.toLocaleString('en-IN')}`],
                ['Pending Student Fees', `₹${ov.pendingPayments.toLocaleString('en-IN')}`],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B1E3D] tabular-nums">
                    {val}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h3 className="text-base font-bold text-[#0B1E3D]">Recent Security &amp; Audit Activity</h3>
              <div className="divide-y divide-slate-200 text-xs">
                {(data.auditLogs || []).slice(0, 10).map((log) => (
                  <div key={log.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <span>
                      <strong>{log.actorName}</strong> ({log.actorRole}) ·{' '}
                      <span className="font-mono text-blue-800">{log.action}</span> ·{' '}
                      <span className="text-slate-600">{log.target}</span>
                    </span>
                    <span className="font-mono text-slate-500">{log.timestamp.slice(0, 19)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'students' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto space-y-4">
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Student Registry &amp; Automated Institutional IDs ({(data.students || []).length})
              </h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Student ID / Reg No.</th>
                    <th className="py-2">Student Name</th>
                    <th className="py-2">Course &amp; District</th>
                    <th className="py-2 text-right">Fee Balance</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.students || []).map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2.5 font-mono">
                        <p className="font-bold text-[#0B1E3D]">{s.studentId}</p>
                        <p className="text-[11px] text-slate-500">
                          {s.registrationNumber} · {s.admissionNumber}
                        </p>
                      </td>
                      <td className="py-2.5">
                        <p className="font-semibold text-sm">{s.fullName}</p>
                        <p className="text-[11px] text-slate-500">Roll: {s.rollNumber}</p>
                      </td>
                      <td className="py-2.5">
                        <p>{s.courseName}</p>
                        <p className="text-[11px] text-slate-500">{s.district}</p>
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        ₹{Math.max(0, s.feeTotal - s.feePaid).toLocaleString('en-IN')} due
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewIdStudent(s)}
                          className="rounded border border-blue-700 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                        >
                          ID Card PDF
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(async () => {
                              await apiRequest(`/api/admin/records/students/${s.id}/soft-delete`, {
                                method: 'POST',
                              });
                              await onRefresh();
                            }, `Moved ${s.fullName} to soft-delete recovery archive.`)
                          }
                          className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
                          title="Soft-delete (recoverable)"
                        >
                          Archive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewIdStudent && (
              <div className="space-y-3">
                <div className="flex justify-between items-center no-print">
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    ID Card Preview: {previewIdStudent.fullName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewIdStudent(null)}
                    className="text-xs font-semibold text-slate-600 hover:underline"
                  >
                    Close Preview
                  </button>
                </div>
                <StudentIdCardView
                  student={previewIdStudent}
                  branding={data.branding}
                  templates={data.documentTemplates}
                  onDownloadLog={async () => {
                    await apiRequest(`/api/students/${previewIdStudent.id}/id-history`, {
                      method: 'POST',
                      body: JSON.stringify({ action: 'PDF Downloaded' }),
                    });
                    await onRefresh();
                  }}
                />
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h3 className="text-sm font-bold text-[#0B1E3D]">
                Student ID Generation &amp; Reprint Audit Log
              </h3>
              <div className="divide-y divide-slate-200 text-xs max-h-56 overflow-y-auto">
                {(data.studentIdHistory || []).map((item) => (
                  <div key={item.id} className="py-2 flex justify-between gap-2">
                    <span>
                      <strong className="font-mono text-[#0B1E3D]">{item.studentId}</strong> ·{' '}
                      {item.studentName} · <strong>{item.action}</strong> by {item.actorName}
                    </span>
                    <span className="font-mono text-slate-500">
                      {item.timestamp.slice(0, 19)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'courses' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await apiRequest('/api/admin/courses', {
                    method: 'POST',
                    body: JSON.stringify(newCourse),
                  });
                  setNewCourse({ ...newCourse, name: '', description: '' });
                  await onRefresh();
                }, 'Course added to institutional catalog.');
              }}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
            >
              <h3 className="text-base font-bold text-[#0B1E3D]">Add New Course</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  placeholder="Course Name"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={newCourse.category}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, category: e.target.value as Course['category'] })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {COURSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Duration (e.g. 6 Months)"
                  value={newCourse.duration}
                  onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Fees (INR)"
                  value={newCourse.fees}
                  onChange={(e) => setNewCourse({ ...newCourse, fees: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <textarea
                required
                rows={2}
                placeholder="Course Description"
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Create Course
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200">
              {(data.courses || []).map((c) => (
                <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono text-blue-700">
                      {c.code} · {c.category} · {c.duration}
                    </p>
                    <p className="text-sm font-bold text-slate-900">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editFeeMap[c.id] ?? String(c.fees)}
                      onChange={(e) => setEditFeeMap({ ...editFeeMap, [c.id]: e.target.value })}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        runAction(async () => {
                          await apiRequest(`/api/admin/courses/${c.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              fees: Number(editFeeMap[c.id] ?? c.fees),
                            }),
                          });
                          await onRefresh();
                        }, `Updated tuition fee for ${c.name}.`)
                      }
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                    >
                      Save Fee
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(async () => {
                          await apiRequest(`/api/admin/courses/${c.id}`, { method: 'DELETE' });
                          await onRefresh();
                        }, `Soft-deleted course ${c.name}.`)
                      }
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      title="Archive course"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-[#0B1E3D] mb-4">
              Admission Applications &amp; Auto-Enrollment Queue
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">App ID</th>
                  <th className="py-2">Student</th>
                  <th className="py-2">Course &amp; District</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Control</th>
                </tr>
              </thead>
              <tbody>
                {(data.applications || []).map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2.5 font-mono text-xs">{a.applicationId}</td>
                    <td className="py-2.5 font-medium">{a.fullName}</td>
                    <td className="py-2.5 text-xs">
                      {a.courseName} · {a.district}
                    </td>
                    <td className="py-2.5 text-xs font-semibold">{a.status}</td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            await apiRequest(`/api/applications/${a.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'Approved' }),
                            });
                            await onRefresh();
                          }, `Approved ${a.applicationId} & generated Student ID / Reg No.`)
                        }
                        className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white"
                      >
                        Approve &amp; Enroll
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            await apiRequest(`/api/applications/${a.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'Rejected' }),
                            });
                            await onRefresh();
                          }, `Application ${a.applicationId} rejected.`)
                        }
                        className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'admit_cards' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    await apiRequest('/api/admin/admit-cards', {
                      method: 'POST',
                      body: JSON.stringify(admitForm),
                    });
                    await onRefresh();
                  }, 'Individual Admit Card generated.');
                }}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">Generate Individual Admit Card</h3>
                <select
                  value={admitForm.studentDbId}
                  onChange={(e) => setAdmitForm({ ...admitForm, studentDbId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {(data.students || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentId} — {s.fullName}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Examination Name"
                  value={admitForm.examName}
                  onChange={(e) => setAdmitForm({ ...admitForm, examName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={admitForm.examDate}
                    onChange={(e) => setAdmitForm({ ...admitForm, examDate: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Timing"
                    value={admitForm.examTiming}
                    onChange={(e) => setAdmitForm({ ...admitForm, examTiming: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  rows={2}
                  value={admitForm.subjectsText}
                  onChange={(e) => setAdmitForm({ ...admitForm, subjectsText: e.target.value })}
                  placeholder="One subject/paper per line"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={admitForm.approveNow}
                    onChange={(e) => setAdmitForm({ ...admitForm, approveNow: e.target.checked })}
                  />
                  Approve immediately for student download
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Generate Admit Card
                </button>
              </form>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    const res = await apiRequest<{ count: number }>('/api/admin/admit-cards/bulk', {
                      method: 'POST',
                      body: JSON.stringify(bulkAdmitForm),
                    });
                    setFeedback(`Generated ${res.count} batch admit card(s).`);
                    await onRefresh();
                  }, 'Bulk Admit Card batch complete.');
                }}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">
                  Bulk Batch Admit Card Generation
                </h3>
                <select
                  value={bulkAdmitForm.courseId}
                  onChange={(e) => setBulkAdmitForm({ ...bulkAdmitForm, courseId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">All Active Courses</option>
                  {(data.courses || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Examination Name"
                  value={bulkAdmitForm.examName}
                  onChange={(e) => setBulkAdmitForm({ ...bulkAdmitForm, examName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={bulkAdmitForm.examDate}
                    onChange={(e) => setBulkAdmitForm({ ...bulkAdmitForm, examDate: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Timing"
                    value={bulkAdmitForm.examTiming}
                    onChange={(e) =>
                      setBulkAdmitForm({ ...bulkAdmitForm, examTiming: e.target.value })
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={bulkAdmitForm.approveNow}
                    onChange={(e) =>
                      setBulkAdmitForm({ ...bulkAdmitForm, approveNow: e.target.checked })
                    }
                  />
                  Publish to Student Portals immediately
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
                >
                  Generate Batch Admit Cards
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto space-y-3">
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Admit Card Queue &amp; Approval Gate ({(data.admitCards || []).length})
              </h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Admit Card No.</th>
                    <th className="py-2">Student &amp; Course</th>
                    <th className="py-2">Examination</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.admitCards || []).map((ac) => (
                    <tr key={ac.id} className="border-b border-slate-100">
                      <td className="py-2.5 font-mono font-bold text-[#0B1E3D]">{ac.admitCardNo}</td>
                      <td className="py-2.5">
                        <p className="font-semibold">{ac.studentName}</p>
                        <p className="text-[11px] text-slate-500">
                          {ac.studentId} · {ac.courseName}
                        </p>
                      </td>
                      <td className="py-2.5">
                        {ac.examName} ({ac.examDate})
                      </td>
                      <td className="py-2.5 font-semibold">
                        <span
                          className={
                            ac.status === 'Approved' ? 'text-emerald-700' : 'text-amber-700'
                          }
                        >
                          {ac.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewAdmit(ac)}
                          className="rounded border border-slate-300 px-2.5 py-1 font-semibold hover:bg-slate-50"
                        >
                          Preview / PDF
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(async () => {
                              await apiRequest(`/api/admin/admit-cards/${ac.id}/approve`, {
                                method: 'PATCH',
                              });
                              await onRefresh();
                            }, `Toggled approval for ${ac.admitCardNo}.`)
                          }
                          className="rounded bg-blue-700 px-2.5 py-1 font-semibold text-white"
                        >
                          {ac.status === 'Approved' ? 'Revert to Draft' : 'Approve & Publish'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewAdmit && (
              <div className="space-y-3">
                <div className="flex justify-between items-center no-print">
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    Admit Card Preview: {previewAdmit.admitCardNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewAdmit(null)}
                    className="text-xs font-semibold text-slate-600 hover:underline"
                  >
                    Close Preview
                  </button>
                </div>
                <AdmitCardView
                  admitCard={previewAdmit}
                  branding={data.branding}
                  templates={data.documentTemplates}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'marksheets' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-12">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    await apiRequest('/api/admin/marksheets', {
                      method: 'POST',
                      body: JSON.stringify({
                        studentDbId: mksForm.studentDbId,
                        examName: mksForm.examName,
                        subjects: subjectRows,
                      }),
                    });
                    await onRefresh();
                  }, 'Marksheet created with automated GPA/percentage & Grade.');
                }}
                className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">
                  Create Institutional Marksheet (Auto-Calculated Total, % &amp; Grade)
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={mksForm.studentDbId}
                    onChange={(e) => setMksForm({ ...mksForm, studentDbId: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {(data.students || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studentId} — {s.fullName}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Examination Name"
                    value={mksForm.examName}
                    onChange={(e) => setMksForm({ ...mksForm, examName: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  {subjectRows.map((sub, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <input
                        placeholder="Code"
                        value={sub.subjectCode}
                        onChange={(e) => {
                          const next = [...subjectRows];
                          next[idx] = { ...sub, subjectCode: e.target.value };
                          setSubjectRows(next);
                        }}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 font-mono"
                      />
                      <input
                        placeholder="Subject Name"
                        value={sub.subjectName}
                        onChange={(e) => {
                          const next = [...subjectRows];
                          next[idx] = { ...sub, subjectName: e.target.value };
                          setSubjectRows(next);
                        }}
                        className="col-span-4 rounded border border-slate-300 px-2 py-1.5"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={sub.maxMarks}
                        onChange={(e) => {
                          const next = [...subjectRows];
                          next[idx] = { ...sub, maxMarks: Number(e.target.value) };
                          setSubjectRows(next);
                        }}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 font-mono"
                      />
                      <input
                        type="number"
                        placeholder="Pass"
                        value={sub.passingMarks}
                        onChange={(e) => {
                          const next = [...subjectRows];
                          next[idx] = { ...sub, passingMarks: Number(e.target.value) };
                          setSubjectRows(next);
                        }}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 font-mono"
                      />
                      <input
                        type="number"
                        placeholder="Obt"
                        value={sub.obtainedMarks}
                        onChange={(e) => {
                          const next = [...subjectRows];
                          next[idx] = { ...sub, obtainedMarks: Number(e.target.value) };
                          setSubjectRows(next);
                        }}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 font-mono font-bold"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setSubjectRows([
                        ...subjectRows,
                        {
                          subjectCode: `SUB-${subjectRows.length + 1}`,
                          subjectName: 'Additional Paper',
                          maxMarks: 100,
                          passingMarks: 35,
                          obtainedMarks: 75,
                        },
                      ])
                    }
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    + Add Subject Row
                  </button>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Save Draft Marksheet
                </button>
              </form>

              <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                <h3 className="text-base font-bold text-[#0B1E3D]">Excel / CSV Marks Upload</h3>
                <p className="text-xs text-slate-600">
                  Columns supported: <span className="font-mono">studentId</span> (or{' '}
                  <span className="font-mono">rollNumber</span>),{' '}
                  <span className="font-mono">subjectCode</span>,{' '}
                  <span className="font-mono">subjectName</span>,{' '}
                  <span className="font-mono">maxMarks</span>,{' '}
                  <span className="font-mono">obtainedMarks</span>.
                </p>
                <input
                  value={importExamName}
                  onChange={(e) => setImportExamName(e.target.value)}
                  placeholder="Examination Name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 cursor-pointer hover:bg-slate-100 text-xs font-semibold text-blue-800">
                  <Upload className="h-5 w-5 mb-1" />
                  <span>Select .xlsx / .xls / .csv File</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await handleExcelUpload(f);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto space-y-3">
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Marksheets &amp; Publication Pipeline ({(data.marksheets || []).length})
              </h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Marksheet No.</th>
                    <th className="py-2">Student &amp; Course</th>
                    <th className="py-2">Score &amp; Grade</th>
                    <th className="py-2">Status &amp; Versions</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.marksheets || []).map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2.5 font-mono font-bold text-[#0B1E3D]">{m.marksheetNo}</td>
                      <td className="py-2.5">
                        <p className="font-semibold">{m.studentName}</p>
                        <p className="text-[11px] text-slate-500">
                          {m.studentId} · {m.examName}
                        </p>
                      </td>
                      <td className="py-2.5 font-mono">
                        {m.totalObtainedMarks}/{m.totalMaxMarks} ({m.percentage}% · {m.grade} ·{' '}
                        {m.resultStatus})
                      </td>
                      <td className="py-2.5">
                        <span className="font-semibold">{m.status}</span> · v
                        {m.versionHistory.length}
                      </td>
                      <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewMarksheet(m)}
                          className="rounded border border-slate-300 px-2 py-1 font-semibold"
                        >
                          Preview PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMarksheet(m);
                            setEditSubjects(m.subjects);
                            setEditReason('');
                          }}
                          className="rounded border border-amber-400 px-2 py-1 font-semibold text-amber-800"
                        >
                          Correct Marks
                        </button>
                        {m.status !== 'Approved' && m.status !== 'Published' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/marksheets/${m.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'Approved' }),
                                });
                                await onRefresh();
                              }, `Approved marksheet ${m.marksheetNo}.`)
                            }
                            className="rounded bg-blue-700 px-2 py-1 font-semibold text-white"
                          >
                            Approve
                          </button>
                        )}
                        {m.status !== 'Published' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/marksheets/${m.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'Published' }),
                                });
                                await onRefresh();
                              }, `Published marksheet ${m.marksheetNo} to Student Portal & QR Verify.`)
                            }
                            className="rounded bg-emerald-700 px-2 py-1 font-semibold text-white"
                          >
                            Publish
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingMarksheet && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-6 space-y-4 no-print">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm text-[#0B1E3D]">
                    Mark Correction &amp; Version History — {editingMarksheet.marksheetNo} (
                    {editingMarksheet.studentName})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditingMarksheet(null)}
                    className="text-xs font-semibold text-slate-600"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-2">
                  {editSubjects.map((sub, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-2 font-mono">{sub.subjectCode}</span>
                      <span className="col-span-5">{sub.subjectName}</span>
                      <span className="col-span-2 font-mono text-slate-500">
                        Max {sub.maxMarks}
                      </span>
                      <input
                        type="number"
                        value={sub.obtainedMarks}
                        onChange={(e) => {
                          const next = [...editSubjects];
                          next[idx] = { ...sub, obtainedMarks: Number(e.target.value) };
                          setEditSubjects(next);
                        }}
                        className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1 font-mono font-bold"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    required
                    placeholder="Reason for mark revision *"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      runAction(async () => {
                        await apiRequest(`/api/admin/marksheets/${editingMarksheet.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            subjects: editSubjects,
                            reason: editReason || 'Academic board review revision',
                          }),
                        });
                        setEditingMarksheet(null);
                        await onRefresh();
                      }, `Recorded corrected version for ${editingMarksheet.marksheetNo}.`)
                    }
                    className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Save Revision Version
                  </button>
                </div>
                <div className="pt-2 border-t border-amber-200 text-xs space-y-1">
                  <p className="font-bold text-slate-700">Revision History:</p>
                  {editingMarksheet.versionHistory.map((v) => (
                    <p key={v.version} className="text-slate-600">
                      <strong className="font-mono">v{v.version}</strong> · {v.percentage}% (
                      {v.grade}) · {v.editedBy}: &ldquo;{v.reason}&rdquo; ({v.timestamp.slice(0, 16)}
                      )
                    </p>
                  ))}
                </div>
              </div>
            )}

            {previewMarksheet && (
              <div className="space-y-3">
                <div className="flex justify-between items-center no-print">
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    Marksheet Preview: {previewMarksheet.marksheetNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewMarksheet(null)}
                    className="text-xs font-semibold text-slate-600 hover:underline"
                  >
                    Close Preview
                  </button>
                </div>
                <MarksheetView
                  marksheet={previewMarksheet}
                  branding={data.branding}
                  templates={data.documentTemplates}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'migrations' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto space-y-3">
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Migration &amp; Institutional Transfer Verification Queue
              </h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Migration No.</th>
                    <th className="py-2">Student &amp; Target Institution</th>
                    <th className="py-2">Verification Gates</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.migrations || []).map((mig) => (
                    <tr key={mig.id} className="border-b border-slate-100">
                      <td className="py-2.5 font-mono font-bold text-[#0B1E3D]">{mig.migrationNo}</td>
                      <td className="py-2.5">
                        <p className="font-semibold">{mig.studentName}</p>
                        <p className="text-[11px] text-slate-500">
                          {mig.studentId} · To: {mig.targetInstitution}
                        </p>
                      </td>
                      <td className="py-2.5 space-x-2">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={mig.documentVerified}
                            onChange={(e) =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/migrations/${mig.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ documentVerified: e.target.checked }),
                                });
                                await onRefresh();
                              }, 'Updated document verification check.')
                            }
                          />
                          Docs
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={mig.feeVerified}
                            onChange={(e) =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/migrations/${mig.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ feeVerified: e.target.checked }),
                                });
                                await onRefresh();
                              }, 'Updated fee clearance check.')
                            }
                          />
                          Fees Clear
                        </label>
                      </td>
                      <td className="py-2.5 font-semibold">{mig.status}</td>
                      <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewMig(mig)}
                          className="rounded border border-slate-300 px-2 py-1 font-semibold"
                        >
                          Preview PDF
                        </button>
                        {mig.status !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/migrations/${mig.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    status: 'Approved',
                                    remarks: 'Verified & issued by Registrar Office.',
                                  }),
                                });
                                await onRefresh();
                              }, `Approved Migration Certificate ${mig.migrationNo}.`)
                            }
                            className="rounded bg-emerald-700 px-2 py-1 font-semibold text-white"
                          >
                            Approve
                          </button>
                        )}
                        {mig.status !== 'Rejected' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(async () => {
                                await apiRequest(`/api/admin/migrations/${mig.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'Rejected' }),
                                });
                                await onRefresh();
                              }, `Rejected migration request ${mig.migrationNo}.`)
                            }
                            className="rounded border border-red-300 px-2 py-1 font-semibold text-red-700"
                          >
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewMig && (
              <div className="space-y-3">
                <div className="flex justify-between items-center no-print">
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    Migration Preview: {previewMig.migrationNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewMig(null)}
                    className="text-xs font-semibold text-slate-600 hover:underline"
                  >
                    Close Preview
                  </button>
                </div>
                <MigrationCertificateView
                  migration={previewMig}
                  branding={data.branding}
                  templates={data.documentTemplates}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'certificates' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    await apiRequest('/api/admin/certificates', {
                      method: 'POST',
                      body: JSON.stringify(certForm),
                    });
                    setCertForm({ ...certForm, replacesCertificateNo: '', correctionNote: '' });
                    await onRefresh();
                  }, `Issued ${certForm.documentType}.`);
                }}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">
                  Issue Digital Certificate (12 Document Types)
                </h3>
                <select
                  value={certForm.studentId}
                  onChange={(e) => setCertForm({ ...certForm, studentId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {(data.students || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentId} — {s.fullName}
                    </option>
                  ))}
                </select>
                <select
                  value={certForm.documentType}
                  onChange={(e) =>
                    setCertForm({
                      ...certForm,
                      documentType: e.target.value as CertificateDocumentType,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {CERTIFICATE_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
                <input
                  value={certForm.grade}
                  onChange={(e) => setCertForm({ ...certForm, grade: e.target.value })}
                  placeholder="Grade / Achievement Remarks"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  value={certForm.replacesCertificateNo}
                  onChange={(e) =>
                    setCertForm({ ...certForm, replacesCertificateNo: e.target.value })
                  }
                  placeholder="Optional: Replaces Certificate No. (for Corrections)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Issue QR Certificate
                </button>
              </form>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    const res = await apiRequest<{ count: number }>('/api/admin/certificates/bulk', {
                      method: 'POST',
                      body: JSON.stringify(bulkCertForm),
                    });
                    setFeedback(`Bulk issued ${res.count} digital certificate(s).`);
                    await onRefresh();
                  }, 'Bulk certificate issuance completed.');
                }}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">Bulk Batch Issuance</h3>
                <select
                  value={bulkCertForm.courseId}
                  onChange={(e) => setBulkCertForm({ ...bulkCertForm, courseId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">All Active Courses</option>
                  {(data.courses || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={bulkCertForm.documentType}
                  onChange={(e) =>
                    setBulkCertForm({
                      ...bulkCertForm,
                      documentType: e.target.value as CertificateDocumentType,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {CERTIFICATE_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
                <input
                  value={bulkCertForm.grade}
                  onChange={(e) => setBulkCertForm({ ...bulkCertForm, grade: e.target.value })}
                  placeholder="Default Completion Grade"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
                >
                  Bulk Issue Certificates
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200 text-xs">
              {(data.certificates || []).map((c) => (
                <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-blue-800 font-bold">
                      {c.certificateNo} · {c.documentType} · {c.status}
                    </p>
                    <p className="font-semibold text-sm text-slate-900">
                      {c.studentName} · {c.courseName} ({c.grade})
                    </p>
                    <p className="text-slate-500">
                      Issued: {c.issueDate} · Reprints: {c.reprintHistory?.length || 0}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewCert(c)}
                      className="rounded border border-slate-300 px-2.5 py-1 font-semibold"
                    >
                      Preview / PDF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(async () => {
                          await apiRequest(`/api/admin/certificates/${c.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              status: c.status === 'Cancelled' ? 'Issued' : 'Cancelled',
                            }),
                          });
                          await onRefresh();
                        }, `Updated status of ${c.certificateNo}.`)
                      }
                      className="rounded border border-red-300 px-2.5 py-1 font-semibold text-red-700"
                    >
                      {c.status === 'Cancelled' ? 'Reinstate' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {previewCert && (
              <div className="space-y-3">
                <div className="flex justify-between items-center no-print">
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    Certificate Preview: {previewCert.certificateNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewCert(null)}
                    className="text-xs font-semibold text-slate-600 hover:underline"
                  >
                    Close Preview
                  </button>
                </div>
                <CertificateView
                  cert={previewCert}
                  branding={data.branding}
                  templates={data.documentTemplates}
                  onDownloadLog={async () => {
                    await apiRequest(`/api/certificates/${previewCert.id}/reprint`, {
                      method: 'POST',
                      body: JSON.stringify({ reason: 'Admin Reprint / PDF Download' }),
                    });
                    await onRefresh();
                  }}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'fees' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await apiRequest('/api/payments/record', {
                    method: 'POST',
                    body: JSON.stringify({
                      studentId: feeForm.studentId,
                      amount: Number(feeForm.amount),
                      method: feeForm.method,
                    }),
                  });
                  await onRefresh();
                }, 'Fee payment recorded and receipt issued.');
              }}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
            >
              <h3 className="text-base font-bold text-[#0B1E3D]">Record Office Fee Collection</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                <select
                  value={feeForm.studentId}
                  onChange={(e) => setFeeForm({ ...feeForm, studentId: e.target.value })}
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {(data.students || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentId} — {s.fullName}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={50}
                  required
                  value={feeForm.amount}
                  onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
                <select
                  value={feeForm.method}
                  onChange={(e) =>
                    setFeeForm({
                      ...feeForm,
                      method: e.target.value as 'UPI' | 'Card' | 'NetBanking' | 'Cash',
                    })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="NetBanking">NetBanking</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Record Payment &amp; Issue Receipt
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
              <h3 className="text-base font-bold text-[#0B1E3D] mb-4">Fee &amp; Payment Ledger</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 px-3">Receipt</th>
                    <th className="py-2 px-3">Course</th>
                    <th className="py-2 px-3">Method &amp; Ref</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.payments || []).map((p) => (
                    <FeeReceiptRow key={p.id} payment={p} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'staff' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await apiRequest('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify(newUser),
                  });
                  setNewUser({ ...newUser, name: '', email: '', phone: '', password: '' });
                  await onRefresh();
                }, 'User account created with encrypted password hash.');
              }}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
            >
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Provision Staff / Officer / Coordinator Account
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  placeholder="Full Name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Strong Password (8+ chars, symbol)"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {ALL_USER_ROLES.filter(
                    (r) => r.id !== 'super_admin' || data.role === 'super_admin'
                  ).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newUser.district}
                  onChange={(e) => setNewUser({ ...newUser, district: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {ASSAM_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Create Account
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Role · District</th>
                    <th className="py-2">Security State</th>
                    <th className="py-2 text-right">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.users || []).map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-2.5 font-medium">
                        {u.name}
                        {u.isPrimarySuperAdmin && (
                          <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200">
                            Primary Super Admin
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-xs">{u.email}</td>
                      <td className="py-2.5 text-xs">
                        {u.isPrimarySuperAdmin || data.role !== 'super_admin' ? (
                          <span>
                            {u.role} · {u.district}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={u.role}
                              onChange={(e) =>
                                runAction(async () => {
                                  await apiRequest(`/api/admin/users/${u.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ role: e.target.value }),
                                  });
                                  await onRefresh();
                                }, `Updated role for ${u.email}.`)
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                            >
                              {ALL_USER_ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <span className="text-slate-500">· {u.district}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-xs font-semibold">
                        {u.status}
                        {u.twoFactorEnabled ? ' · 2FA' : ''}
                        {u.lockedUntil ? ' (Locked)' : ''}
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        {u.isPrimarySuperAdmin ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                            <Shield className="h-3.5 w-3.5" />
                            Immutable Authority
                          </span>
                        ) : (
                          <>
                            {u.lockedUntil && (
                              <button
                                type="button"
                                onClick={() =>
                                  runAction(async () => {
                                    await apiRequest(`/api/admin/users/${u.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ unlock: true }),
                                    });
                                    await onRefresh();
                                  }, `Unlocked ${u.email}.`)
                                }
                                className="rounded bg-amber-600 px-2.5 py-1 text-xs text-white"
                              >
                                Unlock
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                runAction(async () => {
                                  const next = u.status === 'Active' ? 'Suspended' : 'Active';
                                  await apiRequest(`/api/admin/users/${u.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: next }),
                                  });
                                  await onRefresh();
                                }, `Updated account status for ${u.email}.`)
                              }
                              className="rounded border border-slate-300 px-2.5 py-1 text-xs"
                            >
                              {u.status === 'Active' ? 'Suspend' : 'Activate'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'franchises' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-[#0B1E3D] mb-4">
              Franchise &amp; District Centres Approval
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">Code</th>
                  <th className="py-2">Centre Name &amp; District</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data.centres || []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2.5 font-mono text-xs">{c.code}</td>
                    <td className="py-2.5">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.district} · {c.applicantName} · {c.commissionRate}% share
                      </p>
                    </td>
                    <td className="py-2.5 text-xs font-semibold">{c.status}</td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            await apiRequest(`/api/admin/centres/${c.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'Active' }),
                            });
                            await onRefresh();
                          }, `${c.code} activated.`)
                        }
                        className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            await apiRequest(`/api/admin/centres/${c.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'Suspended' }),
                            });
                            await onRefresh();
                          }, `${c.code} suspended.`)
                        }
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs"
                      >
                        Suspend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await apiRequest('/api/notifications', {
                    method: 'POST',
                    body: JSON.stringify(newNotice),
                  });
                  setNewNotice({ ...newNotice, title: '', summary: '' });
                  await onRefresh();
                }, 'Notice published to public notice board.');
              }}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
            >
              <h3 className="text-base font-bold text-[#0B1E3D]">Publish Notice</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  placeholder="Title"
                  value={newNotice.title}
                  onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={newNotice.category}
                  onChange={(e) => setNewNotice({ ...newNotice, category: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {[
                    'Admission',
                    'Examination',
                    'Result',
                    'Announcement',
                    'Holiday',
                    'Scholarship',
                    'Job',
                    'Event',
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                required
                rows={2}
                placeholder="Summary & Details"
                value={newNotice.summary}
                onChange={(e) => setNewNotice({ ...newNotice, summary: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Publish Notice
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200">
              {(data.notifications || []).map((n) => (
                <div key={n.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {n.category} · {n.publishedAt}
                    </p>
                    <p className="text-sm font-semibold">{n.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(async () => {
                        await apiRequest(`/api/notifications/${n.id}`, { method: 'DELETE' });
                        await onRefresh();
                      }, 'Notification removed.')
                    }
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'gallery' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await apiRequest('/api/admin/gallery', {
                    method: 'POST',
                    body: JSON.stringify(newGal),
                  });
                  setNewGal({ title: '', category: 'Photo', caption: '' });
                  await onRefresh();
                }, 'Gallery item added.');
              }}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
            >
              <h3 className="text-base font-bold text-[#0B1E3D]">Add Gallery Item</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  placeholder="Title"
                  value={newGal.title}
                  onChange={(e) => setNewGal({ ...newGal, title: e.target.value })}
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={newGal.category}
                  onChange={(e) => setNewGal({ ...newGal, category: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {['Photo', 'Video', 'Events', 'Seminar', 'Campus', 'Activities', 'Certificate'].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    )
                  )}
                </select>
              </div>
              <input
                placeholder="Caption"
                value={newGal.caption}
                onChange={(e) => setNewGal({ ...newGal, caption: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Add to Gallery
              </button>
            </form>
            <div className="grid gap-4 sm:grid-cols-2">
              {(data.gallery || []).map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 flex justify-between gap-3"
                >
                  <div>
                    <p className="text-xs text-slate-500">{g.category}</p>
                    <p className="text-sm font-bold">{g.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(async () => {
                        await apiRequest(`/api/admin/gallery/${g.id}`, { method: 'DELETE' });
                        await onRefresh();
                      }, 'Gallery item removed.')
                    }
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'cms' && data.cmsSettings && (
          <CmsManagerPanel
            cmsSettings={data.cmsSettings}
            cmsVersions={data.cmsVersions || []}
            onSaved={async (msgText) => {
              setFeedback(msgText);
              await onRefresh();
            }}
          />
        )}

        {tab === 'branding' && data.branding && data.whatsappSettings && (
          <BrandingAndTemplatesPanel
            branding={data.branding}
            templates={data.documentTemplates || []}
            whatsapp={data.whatsappSettings}
            onSaved={async (msgText) => {
              setFeedback(msgText);
              await onRefresh();
            }}
          />
        )}

        {tab === 'security' && (
          <SecurityAndBackupPanel
            role={data.role}
            sessions={data.sessions || []}
            loginAttempts={data.loginAttempts || []}
            backups={data.backups || []}
            rolePermissions={data.rolePermissions}
            deletedRecords={data.deletedRecords}
            onRefresh={onRefresh}
            onFeedback={setFeedback}
          />
        )}

        {tab === 'attendance' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h3 className="text-base font-bold text-[#0B1E3D]">Attendance Register</h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Roll No.</th>
                  <th className="py-2">Student</th>
                  <th className="py-2">District</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.attendance || []).map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-xs">{a.date}</td>
                    <td className="py-2 font-mono text-xs">{a.rollNumber}</td>
                    <td className="py-2">{a.studentName}</td>
                    <td className="py-2 text-xs">{a.district}</td>
                    <td className="py-2 text-xs font-semibold">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'reports' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-[#0B1E3D] mb-4">
              Multi-District Financial &amp; Enrollment Analytics (Assam)
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">District</th>
                  <th className="py-2 text-right">Active Centres</th>
                  <th className="py-2 text-right">Students</th>
                  <th className="py-2 text-right">Applications</th>
                  <th className="py-2 text-right">Revenue (INR)</th>
                </tr>
              </thead>
              <tbody>
                {(data.districtAnalytics || []).map((row) => (
                  <tr key={row.district} className="border-b border-slate-100">
                    <td className="py-2.5 font-semibold">{row.district}</td>
                    <td className="py-2.5 text-right font-mono">
                      {row.activeCentres}/{row.centres}
                    </td>
                    <td className="py-2.5 text-right font-mono">{row.students}</td>
                    <td className="py-2.5 text-right font-mono">{row.applications}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-[#0B1E3D]">
                      ₹{row.revenue.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'enquiries' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200">
            <h3 className="text-base font-bold text-[#0B1E3D] pb-3">Contact Enquiries</h3>
            {(data.enquiries || []).map((e) => (
              <div key={e.id} className="py-3 flex flex-wrap justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold">
                    {e.name} · <span className="font-mono text-xs">{e.phone}</span> · {e.district}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{e.message}</p>
                </div>
                <select
                  value={e.status}
                  onChange={async (ev) => {
                    await apiRequest(`/api/admin/enquiries/${e.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status: ev.target.value }),
                    });
                    await onRefresh();
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-xs bg-white self-start"
                >
                  <option value="New">New</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {tab === 'tickets' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200">
            <h3 className="text-base font-bold text-[#0B1E3D] pb-3">Support Tickets</h3>
            {(data.supportTickets || []).map((t) => (
              <div key={t.id} className="py-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <p className="font-semibold">
                    {t.subject} ({t.userName} · {t.userRole})
                  </p>
                  <span className="text-xs font-semibold text-blue-700">{t.status}</span>
                </div>
                <p className="text-xs text-slate-600">{t.message}</p>
                {t.status !== 'Resolved' && (
                  <button
                    type="button"
                    onClick={() =>
                      runAction(async () => {
                        await apiRequest(`/api/tickets/${t.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'Resolved', reply: 'Resolved by HQ.' }),
                        });
                        await onRefresh();
                      }, 'Support ticket resolved.')
                    }
                    className="rounded bg-emerald-700 px-3 py-1 text-xs text-white"
                  >
                    Mark Resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="space-y-6">
            {hasPerm('manage_users_roles') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(async () => {
                    await apiRequest('/api/admin/tasks', {
                      method: 'POST',
                      body: JSON.stringify(newTask),
                    });
                    setNewTask({ ...newTask, title: '' });
                    await onRefresh();
                  }, 'Task assigned.');
                }}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <h3 className="text-base font-bold text-[#0B1E3D]">Assign Staff Task</h3>
                <input
                  required
                  placeholder="Task Description"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <select
                    value={newTask.assignedTo}
                    onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {(data.users || [])
                      .filter((u) => u.role !== 'student' && u.role !== 'franchise')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                  </select>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Assign Task
                  </button>
                </div>
              </form>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-6 divide-y divide-slate-200 text-sm">
              {(data.staffTasks || []).map((t) => (
                <div key={t.id} className="py-2.5 flex justify-between gap-2 items-center">
                  <span>
                    <strong>{t.title}</strong> · {t.assignedToName} (Due {t.dueDate})
                  </span>
                  <select
                    value={t.status}
                    onChange={async (e) => {
                      await apiRequest(`/api/tasks/${t.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: e.target.value }),
                      });
                      await onRefresh();
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0B1E3D]">
              Append-Only Institutional Security Audit Logs
            </h3>
            <div className="divide-y divide-slate-200 text-xs max-h-[480px] overflow-y-auto">
              {(data.auditLogs || []).map((l) => (
                <div key={l.id} className="py-2.5 flex flex-wrap justify-between gap-3">
                  <div>
                    <p>
                      <strong>{l.actorName}</strong> ({l.actorRole}) ·{' '}
                      <span className="font-mono text-blue-800">{l.action}</span> · {l.target}
                    </p>
                    {(l.previousValue || l.updatedValue) && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {l.previousValue ? `Before: ${l.previousValue} ` : ''}
                        {l.updatedValue ? `→ After: ${l.updatedValue}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-slate-500">{l.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
