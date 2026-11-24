import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import {
  UPLOADS_DIR,
  addAuditLog,
  addSecurityAlert,
  allocateStudentIdentifiers,
  createEncryptedBackup,
  getPrimarySuperAdminEmail,
  hashPassword,
  loadDb,
  persistDb,
  restoreEncryptedBackup,
  verifyPassword,
} from './server/store.ts';
import type { DatabaseState, StoredUser } from './server/store.ts';
import type {
  AdmitCardRecord,
  ApplicationRecord,
  BrandingConfig,
  CertificateDocumentType,
  CertificateRecord,
  Centre,
  Course,
  DocumentTemplateConfig,
  GalleryItem,
  MarksheetRecord,
  MigrationRecord,
  NotificationItem,
  PermissionKey,
  SessionRecord,
  StudentIdHistoryItem,
  StudentProfile,
  SubjectMark,
  UserRole,
} from './src/types/institute.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'spei_sid';
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');
const TOTP_ENC_KEY = crypto.scryptSync(
  process.env.BACKUP_SECRET || SESSION_SECRET,
  'spei-totp-enc-v1',
  32
);

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i += 1) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function computeTotpAtCounter(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTotp(secret: string | undefined, token: string): boolean {
  if (!secret || !/^\d{6}$/.test(token)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  const tokenBuf = Buffer.from(token);
  for (let delta = -1; delta <= 1; delta += 1) {
    const candidate = Buffer.from(computeTotpAtCounter(secret, step + delta));
    if (candidate.length === tokenBuf.length && crypto.timingSafeEqual(candidate, tokenBuf)) {
      return true;
    }
  }
  return false;
}

function encryptTotpSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOTP_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('base64')}`;
}

function decryptTotpSecret(stored: string | undefined): string | undefined {
  if (!stored) return undefined;
  const parts = stored.split(':');
  if (parts.length !== 3) return undefined;
  try {
    const [ivHex, tagHex, dataB64] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', TOTP_ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return undefined;
  }
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

async function sendSecurityEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  if (!isSmtpConfigured()) {
    return false;
  }
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim(),
      to,
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    });
    return true;
  } catch (err) {
    console.error('[SPEI Mail Dispatch Error]', err instanceof Error ? err.message : 'SMTP failure');
    return false;
  }
}

async function notifyPrimarySuperAdmin(
  db: DatabaseState,
  title: string,
  severity: 'Info' | 'Warning' | 'Critical',
  message: string,
  ip?: string
) {
  const email = getPrimarySuperAdminEmail();
  const dispatched = await sendSecurityEmail(
    email,
    `[Success Point Security · ${severity}] ${title}`,
    `${message}\nTime: ${new Date().toISOString()}\nSource IP: ${ip || 'Unknown'}`
  );
  addSecurityAlert(db, title, severity, message, dispatched, ip);
  if (!dispatched && !IS_PROD) {
    console.log(`[SPEI Super Admin Security Alert · ${severity}] ${title}: ${message}`);
  }
}

function getAppBaseUrl(req: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes('MY_APP_URL')) {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = cleanStr(req.headers['x-forwarded-proto'], 10) || req.protocol || 'http';
  const host = cleanStr(req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`, 160);
  return `${proto}://${host}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const head = local.slice(0, 2);
  const tail = local.length > 4 ? local.slice(-2) : '';
  return `${head}***${tail}@${domain}`;
}

interface SessionPayload {
  sid: string;
  uid: string;
  role: UserRole;
  exp: number;
}

interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authSession?: SessionRecord;
}

function signToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.sid || !parsed.uid || !parsed.role || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || IS_PROD;
  const attrs = isHttps
    ? 'HttpOnly; Secure; SameSite=None; Partitioned; Path=/'
    : 'HttpOnly; SameSite=Lax; Path=/';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs}`);
}

function clearSessionCookie(req: Request, res: Response) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || IS_PROD;
  const attrs = isHttps
    ? 'HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0'
    : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; ${attrs}`);
}

const rateBuckets = new Map<string, number[]>();
function rateLimit(maxHits: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= maxHits) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    next();
  };
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    district: u.district,
    centreId: u.centreId,
    status: u.status,
    isPrimarySuperAdmin: Boolean(u.isPrimarySuperAdmin),
    emailVerified: Boolean(u.emailVerified),
    activatedAt: u.activatedAt,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    failedAttempts: u.failedAttempts || 0,
    lockedUntil: u.lockedUntil,
    lastLoginAt: u.lastLoginAt,
    lastKnownIp: u.lastKnownIp,
    createdAt: u.createdAt,
  };
}

function validatePasswordStrength(password: string, minLength = 8): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters long.`;
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. !@#$%).';
  }
  return null;
}

async function saveSafeUpload(dataUrl: unknown, prefix: string): Promise<string | undefined> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return undefined;
  const match =
    /^data:(image\/jpeg|image\/png|image\/webp|image\/svg\+xml|image\/x-icon|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl
    );
  if (!match) {
    throw new Error('Unsupported file format. Allowed: JPG, PNG, WebP, SVG, ICO, or PDF.');
  }
  const mime = match[1];
  const rawBase64 = match[2];
  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('Uploaded file exceeds 2 MB limit.');
  }
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'application/pdf': 'pdf',
  };
  const filename = `${prefix}-${crypto.randomUUID()}.${extMap[mime]}`;
  const resolved = path.resolve(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid upload destination.');
  }
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(resolved, buffer);
  return `/api/uploads/${filename}`;
}

function cleanStr(val: unknown, maxLen = 400): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function cleanNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  Dhubri: { lat: 26.0207, lng: 89.9743 },
  Kokrajhar: { lat: 26.4014, lng: 90.2725 },
  Bongaigaon: { lat: 26.4824, lng: 90.5582 },
  Goalpara: { lat: 26.1641, lng: 90.6254 },
  Barpeta: { lat: 26.3229, lng: 91.0063 },
  Kamrup: { lat: 26.3161, lng: 91.5984 },
  Guwahati: { lat: 26.1445, lng: 91.7362 },
  Nalbari: { lat: 26.4447, lng: 91.4411 },
  'South Salmara-Mankachar': { lat: 25.8623, lng: 89.9146 },
  Jorhat: { lat: 26.7509, lng: 94.2037 },
  Dibrugarh: { lat: 27.4728, lng: 94.912 },
  Nagaon: { lat: 26.3464, lng: 92.684 },
  Silchar: { lat: 24.8333, lng: 92.7789 },
  Tezpur: { lat: 26.6528, lng: 92.7926 },
};

function createUserSession(db: DatabaseState, user: StoredUser, req: Request) {
  const now = Date.now();
  const sid = `sid-${crypto.randomUUID()}`;
  const expiresAt = new Date(now + 12 * 60 * 60 * 1000).toISOString();
  const session: SessionRecord = {
    id: sid,
    userId: user.id,
    userName: user.name,
    role: user.role,
    ip: cleanStr(req.ip || '127.0.0.1', 64),
    userAgent: cleanStr(req.headers['user-agent'] || 'Browser', 180),
    createdAt: new Date(now).toISOString(),
    lastActivityAt: new Date(now).toISOString(),
    expiresAt,
    revoked: false,
  };
  db.sessions.unshift(session);
  if (db.sessions.length > 200) {
    db.sessions = db.sessions.slice(0, 200);
  }
  const token = signToken({
    sid,
    uid: user.id,
    role: user.role,
    exp: now + 12 * 60 * 60 * 1000,
  });
  return { session, token };
}

function getRequestSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) return cookies[SESSION_COOKIE_NAME];
  return null;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const xrw = req.headers['x-requested-with'];
    if (xrw !== 'SPEI-Portal' && req.path !== '/api/auth/logout-beacon') {
      res.status(403).json({ error: 'CSRF protection: missing required X-Requested-With header.' });
      return;
    }
  }

  const token = getRequestSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  const db = await loadDb();
  const session = db.sessions.find((s) => s.id === payload.sid);
  if (!session || session.revoked || Date.now() > new Date(session.expiresAt).getTime()) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session has been terminated or expired.' });
    return;
  }

  const timeoutMin = Math.max(2, Math.min(120, db.cmsSettings.sessionTimeoutMinutes || 10));
  const inactivityLimitMs = timeoutMin * 60 * 1000;
  const idleMs = Date.now() - new Date(session.lastActivityAt).getTime();
  if (idleMs > inactivityLimitMs) {
    session.revoked = true;
    session.revokedReason = 'Automatic inactivity logout';
    addAuditLog(db, session.userName, session.role, 'AUTO_INACTIVITY_LOGOUT', session.id, {
      userId: session.userId,
      recordId: session.id,
      ip: req.ip,
      userAgent: cleanStr(req.headers['user-agent'], 140),
    });
    await persistDb(db);
    clearSessionCookie(req, res);
    res.status(401).json({ error: `Automatically signed out after ${timeoutMin} minutes of inactivity.` });
    return;
  }

  const user = db.users.find((u) => u.id === payload.uid && !u.deletedAt);
  if (!user || user.status !== 'Active' || (user.isPrimarySuperAdmin && !user.emailVerified)) {
    clearSessionCookie(req, res);
    res.status(403).json({ error: 'Account is inactive, unverified, or not found.' });
    return;
  }

  // Update server-side activity timestamp unless passive polling
  if (req.query.passive !== '1') {
    session.lastActivityAt = new Date().toISOString();
    await persistDb(db);
  }

  req.authUser = user;
  req.authSession = session;
  next();
}

function hasPermission(db: DatabaseState, user: StoredUser, perm: PermissionKey): boolean {
  if (user.role === 'super_admin' && (!user.isPrimarySuperAdmin || user.emailVerified)) return true;
  const list = db.rolePermissions?.[user.role] || [];
  return list.includes(perm);
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'You do not have role authorization for this action.' });
      return;
    }
    if (req.authUser.role === 'super_admin' && req.authUser.isPrimarySuperAdmin && !req.authUser.emailVerified) {
      res.status(403).json({ error: 'Primary Super Admin email ownership must be verified.' });
      return;
    }
    next();
  };
}

function requirePermission(perm: PermissionKey) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const db = await loadDb();
    if (!hasPermission(db, req.authUser, perm)) {
      res.status(403).json({ error: `Permission "${perm}" required for this operation.` });
      return;
    }
    next();
  };
}

function computeMarksSummary(subjects: SubjectMark[]) {
  const totalMaxMarks = subjects.reduce((a, s) => a + Math.max(1, Number(s.maxMarks) || 100), 0);
  const totalObtainedMarks = subjects.reduce((a, s) => a + Math.max(0, Number(s.obtainedMarks) || 0), 0);
  const percentage = totalMaxMarks > 0 ? Number(((totalObtainedMarks / totalMaxMarks) * 100).toFixed(2)) : 0;
  const allPassed = subjects.every((s) => (Number(s.obtainedMarks) || 0) >= (Number(s.passingMarks) || 35));
  const resultStatus: 'Pass' | 'Fail' = allPassed && percentage >= 35 ? 'Pass' : 'Fail';
  const grade =
    resultStatus === 'Fail'
      ? 'F'
      : percentage >= 90
      ? 'O'
      : percentage >= 80
      ? 'A+'
      : percentage >= 70
      ? 'A'
      : percentage >= 60
      ? 'B+'
      : percentage >= 50
      ? 'B'
      : percentage >= 40
      ? 'C'
      : 'D';
  return { totalMaxMarks, totalObtainedMarks, percentage, grade, resultStatus };
}

function computeDistrictAnalytics(db: DatabaseState) {
  const map: Record<
    string,
    {
      district: string;
      centres: number;
      activeCentres: number;
      students: number;
      applications: number;
      revenue: number;
    }
  > = {};

  for (const c of db.centres.filter((x) => !x.deletedAt)) {
    if (!map[c.district]) {
      map[c.district] = { district: c.district, centres: 0, activeCentres: 0, students: 0, applications: 0, revenue: 0 };
    }
    map[c.district].centres += 1;
    if (c.status === 'Active') map[c.district].activeCentres += 1;
  }
  for (const s of db.students.filter((x) => !x.deletedAt)) {
    if (!map[s.district]) {
      map[s.district] = { district: s.district, centres: 0, activeCentres: 0, students: 0, applications: 0, revenue: 0 };
    }
    map[s.district].students += 1;
  }
  for (const a of db.applications.filter((x) => !x.deletedAt)) {
    if (!map[a.district]) {
      map[a.district] = { district: a.district, centres: 0, activeCentres: 0, students: 0, applications: 0, revenue: 0 };
    }
    map[a.district].applications += 1;
  }
  for (const p of db.payments) {
    if (p.status !== 'Paid') continue;
    if (!map[p.district]) {
      map[p.district] = { district: p.district, centres: 0, activeCentres: 0, students: 0, applications: 0, revenue: 0 };
    }
    map[p.district].revenue += p.amount;
  }
  return Object.values(map).sort((a, b) => b.students - a.students || b.revenue - a.revenue);
}

function enrollStudentFromApplication(
  db: DatabaseState,
  app: ApplicationRecord,
  actorName: string
): StudentProfile {
  const existing = db.students.find((s) => s.applicationId === app.applicationId && !s.deletedAt);
  if (existing) return existing;

  const course = db.courses.find((c) => c.id === app.courseId);
  const centre = db.centres.find((c) => c.id === app.centreId);
  const ids = allocateStudentIdentifiers(db, app.district, course?.code || 'GEN');

  let user = db.users.find((u) => u.email.toLowerCase() === app.email.toLowerCase());
  if (!user) {
    user = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: app.fullName,
      email: app.email,
      phone: app.mobile,
      role: 'student',
      district: app.district,
      centreId: app.centreId,
      status: 'Active',
      // Require user to claim/reset via OTP or admin password set
      passwordHash: hashPassword(crypto.randomBytes(18).toString('hex')),
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
  }

  const profile: StudentProfile = {
    id: `stu-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.id,
    studentId: ids.studentId,
    registrationNumber: ids.registrationNumber,
    admissionNumber: ids.admissionNumber,
    rollNumber: ids.rollNumber,
    applicationId: app.applicationId,
    fullName: app.fullName,
    fatherName: app.fatherName,
    motherName: app.motherName,
    dob: app.dob,
    mobile: app.mobile,
    email: app.email,
    address: `${app.address}, ${app.district}, ${app.state} ${app.pinCode}`,
    district: app.district,
    centreId: app.centreId,
    centreCode: centre?.code || 'SPEI-DHB-001',
    centreName: app.centreName,
    courseId: app.courseId,
    courseCode: course?.code || 'SPEI-GEN',
    courseName: app.courseName,
    academicSession: db.cmsSettings.admissionsOpenBatch,
    batch: db.cmsSettings.admissionsOpenBatch,
    registrationDate: new Date().toISOString().slice(0, 10),
    photoUrl: app.photoUrl,
    feeTotal: course ? course.fees : 5000,
    feePaid: 0,
    admitCardNo: ids.admitCardNo,
    admissionStatus: 'Active',
    enrolledAt: new Date().toISOString(),
  };

  db.students.unshift(profile);
  db.studentIdHistory.unshift({
    id: `sidh-${crypto.randomUUID().slice(0, 8)}`,
    studentId: profile.studentId,
    studentName: profile.fullName,
    action: 'Generated',
    actorName,
    timestamp: new Date().toISOString(),
  });
  addAuditLog(db, actorName, 'staff/admin', 'ENROLL_STUDENT_AUTO_ID', `${profile.studentId} (${profile.fullName})`, {
    recordId: profile.id,
  });
  return profile;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  // Prevent browser back-button caching on all private endpoints
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/portal') ||
      req.path.startsWith('/api/admin') ||
      req.path.startsWith('/api/student') ||
      req.path.startsWith('/api/franchise')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Schedule automated daily encrypted backup check (every 12h, creates 1 backup/day)
  setInterval(async () => {
    try {
      const db = await loadDb();
      const today = new Date().toISOString().slice(0, 10);
      const alreadyBackedUp = db.backups.some((b) => b.createdAt.startsWith(today));
      if (!alreadyBackedUp) {
        await createEncryptedBackup(db, 'Automated Daily Backup');
        await persistDb(db);
      }
    } catch {
      // Ignore background backup warning
    }
  }, 12 * 60 * 60 * 1000);

  // Safe file upload serving
  app.get('/api/uploads/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const target = path.resolve(UPLOADS_DIR, filename);
    if (!target.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    try {
      await fs.access(target);
      res.sendFile(target);
    } catch {
      res.status(404).json({ error: 'File not found.' });
    }
  });

  // Public bootstrap data
  app.get('/api/public/bootstrap', async (_req, res) => {
    const db = await loadDb();
    const activeCentres = db.centres
      .filter((c) => c.status === 'Active' && !c.deletedAt)
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isHeadOffice: Boolean(c.isHeadOffice),
        mobile: c.mobile,
        email: c.email,
        address: c.address,
        district: c.district,
        state: c.state,
        infrastructureDetails: c.infrastructureDetails,
        lat: c.lat,
        lng: c.lng,
        status: c.status,
      }));
    const activeCourses = db.courses.filter((c) => !c.deletedAt);
    res.json({
      cmsSettings: db.cmsSettings,
      branding: db.branding,
      documentTemplates: db.documentTemplates,
      whatsappSettings: db.whatsappSettings,
      courses: activeCourses,
      centres: activeCentres,
      notifications: db.notifications,
      gallery: db.gallery,
      blogs: db.blogs,
      metrics: {
        totalCourses: activeCourses.length,
        activeCentres: activeCentres.length,
        activeDistricts: new Set(activeCentres.map((c) => c.district)).size,
        enrolledLearners: db.students.filter((s) => !s.deletedAt).length + 1240,
      },
    });
  });

  // Auth Status & Session Inspection
  app.get('/api/auth/status', async (_req, res) => {
    const db = await loadDb();
    res.json({
      adminClaimed: db.adminClaimed,
      envAdminConfigured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()),
      sessionTimeoutMinutes: db.cmsSettings.sessionTimeoutMinutes || 10,
    });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const timeoutMin = db.cmsSettings.sessionTimeoutMinutes || 10;
    const elapsedMs = Date.now() - new Date(req.authSession!.lastActivityAt).getTime();
    const remainingSeconds = Math.max(0, Math.floor((timeoutMin * 60_000 - elapsedMs) / 1000));
    res.json({
      user: sanitizeUser(req.authUser!),
      sessionId: req.authSession!.id,
      sessionTimeoutMinutes: timeoutMin,
      remainingSeconds,
    });
  });

  app.post('/api/auth/keepalive', requireAuth, async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const s = db.sessions.find((x) => x.id === req.authSession!.id);
    if (s) {
      s.lastActivityAt = new Date().toISOString();
      await persistDb(db);
    }
    res.json({ ok: true, sessionTimeoutMinutes: db.cmsSettings.sessionTimeoutMinutes || 10 });
  });

  // Super Admin Dedicated Status & Email-Verified Activation Flow
  app.get('/api/super-admin/status', async (_req, res) => {
    const db = await loadDb();
    const primary = db.users.find((u) => u.id === 'usr-primary-super-admin');
    res.json({
      activated: Boolean(primary && primary.emailVerified && primary.passwordHash && primary.status === 'Active'),
      emailVerified: Boolean(primary?.emailVerified),
      twoFactorEnabled: Boolean(primary?.twoFactorEnabled),
      sessionTimeoutMinutes: db.cmsSettings.sessionTimeoutMinutes || 10,
      smtpConfigured: isSmtpConfigured(),
    });
  });

  app.post('/api/super-admin/request-activation', rateLimit(5, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Super Admin email address is required.' });
      return;
    }
    const db = await loadDb();
    const primaryEmail = getPrimarySuperAdminEmail();
    const primary = db.users.find((u) => u.id === 'usr-primary-super-admin');

    if (
      primary &&
      email === primaryEmail &&
      !(primary.emailVerified && primary.passwordHash && primary.status === 'Active')
    ) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      // Invalidate any prior unused activation links
      for (const ch of db.activationChallenges) {
        if (ch.userId === primary.id && !ch.used) ch.used = true;
      }
      db.activationChallenges.unshift({
        id: `act-${crypto.randomUUID().slice(0, 8)}`,
        userId: primary.id,
        email: primaryEmail,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        used: false,
        createdAt: new Date().toISOString(),
      });
      if (db.activationChallenges.length > 20) {
        db.activationChallenges = db.activationChallenges.slice(0, 20);
      }
      const activationUrl = `${getAppBaseUrl(req)}/super-admin/login?activationToken=${rawToken}`;
      const sent = await sendSecurityEmail(
        primaryEmail,
        'Success Point Educational Institute — Super Admin Activation Link',
        `Verify ownership of your Primary Super Admin account and configure your strong password + 2FA:\n\n${activationUrl}\n\nThis single-use link expires in 30 minutes.`,
        `<p>Verify ownership of your Primary Super Admin account for <strong>Success Point Educational Institute</strong>:</p><p><a href="${activationUrl}">Activate Primary Super Admin Account</a></p><p>This single-use link expires in 30 minutes.</p>`
      );
      addAuditLog(db, 'System Security', 'system', 'REQUEST_SUPER_ADMIN_ACTIVATION', maskEmail(primaryEmail), {
        userId: primary.id,
        recordId: primary.id,
        ip: req.ip,
      });
      await persistDb(db);
      if (!sent && !IS_PROD) {
        console.log(`[SPEI Super Admin Activation Link] ${activationUrl}`);
      }
    }

    res.json({
      message:
        'If the entered email matches the configured Primary Super Administrator and is pending activation, a single-use activation link has been dispatched.',
    });
  });

  app.post('/api/super-admin/begin-activation', rateLimit(10, 60_000), async (req, res) => {
    const rawToken = cleanStr(req.body?.token, 128);
    if (!rawToken) {
      res.status(400).json({ error: 'Activation token is required.' });
      return;
    }
    const db = await loadDb();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const challenge = db.activationChallenges.find(
      (c) =>
        !c.used &&
        Date.now() <= new Date(c.expiresAt).getTime() &&
        c.tokenHash === tokenHash
    );
    const primary = challenge ? db.users.find((u) => u.id === challenge.userId) : undefined;
    if (!challenge || !primary) {
      res.status(400).json({ error: 'Activation link is invalid or expired. Request a fresh link.' });
      return;
    }
    if (primary.emailVerified && primary.passwordHash && primary.status === 'Active') {
      res.status(409).json({ error: 'Primary Super Admin account is already activated.' });
      return;
    }

    const secret = generateTotpSecret();
    primary.pendingTotpSecret = encryptTotpSecret(secret);
    await persistDb(db);

    const issuer = encodeURIComponent('Success Point Institute');
    const label = encodeURIComponent(`Success Point Institute:${primary.email}`);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    res.json({
      valid: true,
      maskedEmail: maskEmail(primary.email),
      otpauthUri,
      manualKey: secret,
    });
  });

  app.post('/api/super-admin/complete-activation', rateLimit(10, 60_000), async (req, res) => {
    const rawToken = cleanStr(req.body?.token, 128);
    const password = cleanStr(req.body?.password, 128);
    const totpCode = cleanStr(req.body?.totpCode, 12);
    const fullName = cleanStr(req.body?.name, 120);

    if (!rawToken || !password || !totpCode) {
      res.status(400).json({ error: 'Activation token, strong password, and 6-digit 2FA code are required.' });
      return;
    }
    const pwErr = validatePasswordStrength(password, 10);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const db = await loadDb();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const challenge = db.activationChallenges.find(
      (c) =>
        !c.used &&
        Date.now() <= new Date(c.expiresAt).getTime() &&
        c.tokenHash === tokenHash
    );
    const primary = challenge ? db.users.find((u) => u.id === challenge.userId) : undefined;
    if (!challenge || !primary) {
      res.status(400).json({ error: 'Invalid or expired activation link.' });
      return;
    }

    const pendingSecret = decryptTotpSecret(primary.pendingTotpSecret);
    if (!pendingSecret || !verifyTotp(pendingSecret, totpCode)) {
      res.status(400).json({ error: 'Invalid 6-digit Authenticator 2FA code. Scan the QR code and enter the live code.' });
      return;
    }

    challenge.used = true;
    if (fullName) primary.name = fullName;
    primary.passwordHash = hashPassword(password);
    primary.totpSecret = encryptTotpSecret(pendingSecret);
    primary.pendingTotpSecret = undefined;
    primary.twoFactorEnabled = true;
    primary.emailVerified = true;
    primary.status = 'Active';
    primary.activatedAt = new Date().toISOString();
    primary.failedAttempts = 0;
    primary.lockedUntil = undefined;
    primary.lastLoginAt = new Date().toISOString();
    primary.lastKnownIp = cleanStr(req.ip || '127.0.0.1', 64);
    db.adminClaimed = true;

    const { token } = createUserSession(db, primary, req);
    addAuditLog(db, primary.name, 'super_admin', 'ACTIVATE_PRIMARY_SUPER_ADMIN', maskEmail(primary.email), {
      userId: primary.id,
      recordId: primary.id,
      ip: req.ip,
      userAgent: cleanStr(req.headers['user-agent'], 140),
    });
    await notifyPrimarySuperAdmin(
      db,
      'Primary Super Admin Account Activated',
      'Info',
      'Email ownership verified, strong password set, and 2FA Authenticator enabled.',
      req.ip
    );
    await persistDb(db);
    setSessionCookie(req, res, token);
    res.json({ user: sanitizeUser(primary) });
  });

  app.post('/api/super-admin/login', rateLimit(15, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = cleanStr(req.body?.password, 128);
    const twoFactorCode = cleanStr(req.body?.twoFactorCode, 12);
    const sendEmail2fa = Boolean(req.body?.sendEmail2fa);
    const ip = cleanStr(req.ip || '127.0.0.1', 64);
    const ua = cleanStr(req.headers['user-agent'] || 'Browser', 180);

    if (!email || !password) {
      res.status(400).json({ error: 'Super Admin email and password are required.' });
      return;
    }

    const db = await loadDb();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === email && u.role === 'super_admin' && !u.deletedAt
    );

    if (!user) {
      db.loginAttempts.unshift({
        id: `attl-${crypto.randomUUID().slice(0, 8)}`,
        email: maskEmail(email),
        ip,
        userAgent: ua,
        success: false,
        suspicious: true,
        reason: 'Unauthorized /super-admin/login attempt',
        timestamp: new Date().toISOString(),
      });
      await notifyPrimarySuperAdmin(
        db,
        'Unauthorized Super Admin Portal Sign-In Attempt',
        'Warning',
        `Unknown email attempted sign-in on /super-admin/login from IP ${ip}.`,
        ip
      );
      await persistDb(db);
      res.status(401).json({ error: 'Invalid Super Admin credentials.' });
      return;
    }

    if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
      const minsLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000);
      res.status(423).json({ error: `Account temporarily locked. Retry in ${minsLeft} minute(s).` });
      return;
    }

    if (user.status !== 'Active' || (user.isPrimarySuperAdmin && !user.emailVerified)) {
      res.status(403).json({
        error: 'Super Admin account requires email ownership verification and activation before sign-in.',
        activationRequired: true,
      });
      return;
    }

    let valid = false;
    const envAdminPass = process.env.ADMIN_PASSCODE?.trim();
    if (envAdminPass) {
      const a = Buffer.from(password);
      const b = Buffer.from(envAdminPass);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else {
      valid = verifyPassword(password, user.passwordHash);
    }

    if (!valid) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      const locked = user.failedAttempts >= 5;
      if (locked) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      db.loginAttempts.unshift({
        id: `attl-${crypto.randomUUID().slice(0, 8)}`,
        email: maskEmail(email),
        ip,
        userAgent: ua,
        success: false,
        suspicious: user.failedAttempts >= 3,
        reason: locked ? 'Super Admin locked after 5 failed attempts' : `Wrong password (attempt ${user.failedAttempts})`,
        timestamp: new Date().toISOString(),
      });
      addAuditLog(db, user.name, 'super_admin', locked ? 'SUPER_ADMIN_LOCKED' : 'FAILED_SUPER_ADMIN_LOGIN', maskEmail(email), {
        userId: user.id,
        recordId: user.id,
        ip,
        userAgent: ua,
      });
      if (user.failedAttempts >= 3) {
        await notifyPrimarySuperAdmin(
          db,
          locked ? 'Super Admin Account Locked' : 'Repeated Failed Super Admin Login Attempts',
          'Critical',
          `${user.failedAttempts} consecutive failed sign-in attempts on Super Admin portal from IP ${ip}.`,
          ip
        );
      }
      await persistDb(db);
      res.status(401).json({
        error: locked
          ? 'Super Admin account locked for 15 minutes after 5 failed attempts.'
          : 'Invalid Super Admin credentials.',
      });
      return;
    }

    // Handle Email 2FA fallback dispatch after password verification
    if (sendEmail2fa) {
      const otpCode = String(crypto.randomInt(100000, 999999));
      const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');
      db.twoFactorChallenges.unshift({
        id: `2fa-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        email: user.email,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        used: false,
        createdAt: new Date().toISOString(),
      });
      if (db.twoFactorChallenges.length > 30) {
        db.twoFactorChallenges = db.twoFactorChallenges.slice(0, 30);
      }
      const sent = await sendSecurityEmail(
        user.email,
        'Success Point Super Admin — 6-Digit 2FA Code',
        `Your single-use 2FA verification code is: ${otpCode}\nValid for 5 minutes.`
      );
      await persistDb(db);
      if (!sent && !IS_PROD) {
        console.log(`[SPEI Super Admin 2FA OTP] Code for ${maskEmail(user.email)}: ${otpCode}`);
      }
      res.json({
        requiresTwoFactor: true,
        emailOtpSent: true,
        hasAuthenticator: Boolean(user.totpSecret),
        message: 'A 6-digit 2FA verification code has been dispatched to your verified Super Admin email.',
      });
      return;
    }

    if (!twoFactorCode) {
      res.json({
        requiresTwoFactor: true,
        hasAuthenticator: Boolean(user.totpSecret),
        message: 'Two-factor authentication required. Enter your 6-digit Authenticator code.',
      });
      return;
    }

    // Cryptographic verification of 2FA: either TOTP secret OR verified email 2FA challenge
    const totpValid = verifyTotp(decryptTotpSecret(user.totpSecret), twoFactorCode);
    let emailOtpValid = false;
    if (!totpValid && /^\d{6}$/.test(twoFactorCode)) {
      const codeHash = crypto.createHash('sha256').update(twoFactorCode).digest('hex');
      const ch = db.twoFactorChallenges.find(
        (c) =>
          c.userId === user.id &&
          !c.used &&
          Date.now() <= new Date(c.expiresAt).getTime() &&
          c.codeHash === codeHash
      );
      if (ch) {
        ch.used = true;
        emailOtpValid = true;
      }
    }

    if (!totpValid && !emailOtpValid) {
      res.status(401).json({ error: 'Invalid or expired 6-digit 2FA verification code.' });
      return;
    }

    const suspiciousIp = Boolean(user.lastKnownIp && user.lastKnownIp !== ip);
    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    user.lastKnownIp = ip;

    db.loginAttempts.unshift({
      id: `attl-${crypto.randomUUID().slice(0, 8)}`,
      email: maskEmail(email),
      ip,
      userAgent: ua,
      success: true,
      suspicious: suspiciousIp,
      reason: suspiciousIp ? 'Super Admin login from new IP' : 'Verified Super Admin 2FA sign-in',
      timestamp: new Date().toISOString(),
    });
    if (suspiciousIp) {
      await notifyPrimarySuperAdmin(
        db,
        'Super Admin Sign-In From New IP',
        'Warning',
        `Verified Super Admin session started from new IP address ${ip}.`,
        ip
      );
    }

    const { token } = createUserSession(db, user, req);
    addAuditLog(db, user.name, 'super_admin', 'SUPER_ADMIN_LOGIN', maskEmail(email), {
      userId: user.id,
      recordId: user.id,
      ip,
      userAgent: ua,
    });
    await persistDb(db);
    setSessionCookie(req, res, token);
    res.json({ user: sanitizeUser(user), suspiciousIp });
  });

  app.post('/api/super-admin/security-alerts/:id/acknowledge', requireAuth, requireRole('super_admin'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const alert = db.securityAlerts.find((a) => a.id === req.params.id);
    if (alert) {
      alert.acknowledged = true;
      await persistDb(db);
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/claim-admin', rateLimit(10, 60_000), async (_req, res) => {
    res.status(410).json({
      error: 'Direct Super Admin password claim is disabled. Complete email-verified activation at /super-admin/login.',
    });
  });

  app.post('/api/auth/login', rateLimit(20, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = cleanStr(req.body?.password, 128);
    const twoFactorCode = cleanStr(req.body?.twoFactorCode, 12);
    const sendEmail2fa = Boolean(req.body?.sendEmail2fa);
    const ip = cleanStr(req.ip || '127.0.0.1', 64);
    const ua = cleanStr(req.headers['user-agent'] || 'Browser', 180);

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = await loadDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email && !u.deletedAt);

    if (!user) {
      db.loginAttempts.unshift({
        id: `attl-${crypto.randomUUID().slice(0, 8)}`,
        email,
        ip,
        userAgent: ua,
        success: false,
        suspicious: true,
        reason: 'Unknown email login attempt',
        timestamp: new Date().toISOString(),
      });
      await persistDb(db);
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
      const minsLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000);
      res.status(423).json({ error: `Account temporarily locked due to repeated failed attempts. Try again in ${minsLeft} min.` });
      return;
    }

    if (user.status !== 'Active' || (user.isPrimarySuperAdmin && !user.emailVerified)) {
      res.status(403).json({ error: `Account status is ${user.status}. Complete activation or contact Head Office.` });
      return;
    }

    let valid = false;
    const envAdminPass = process.env.ADMIN_PASSCODE?.trim();
    if ((user.role === 'super_admin' || user.role === 'admin') && envAdminPass) {
      const a = Buffer.from(password);
      const b = Buffer.from(envAdminPass);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else {
      valid = verifyPassword(password, user.passwordHash);
    }

    if (!valid) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      const locked = user.failedAttempts >= 5;
      if (locked) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      db.loginAttempts.unshift({
        id: `attl-${crypto.randomUUID().slice(0, 8)}`,
        email: user.isPrimarySuperAdmin ? maskEmail(email) : email,
        ip,
        userAgent: ua,
        success: false,
        suspicious: user.failedAttempts >= 3,
        reason: locked ? 'Account locked after 5 failed attempts' : `Wrong password (attempt ${user.failedAttempts})`,
        timestamp: new Date().toISOString(),
      });
      addAuditLog(db, user.name, user.role, locked ? 'ACCOUNT_LOCKED' : 'FAILED_LOGIN', user.isPrimarySuperAdmin ? maskEmail(email) : user.email, {
        userId: user.id,
        recordId: user.id,
        ip,
        userAgent: ua,
      });
      if (locked || user.isPrimarySuperAdmin) {
        await notifyPrimarySuperAdmin(
          db,
          locked ? `Account Locked (${user.role})` : 'Failed Login on Privileged Account',
          locked ? 'Critical' : 'Warning',
          `Failed sign-in attempt #${user.failedAttempts} for role ${user.role} from IP ${ip}.`,
          ip
        );
      }
      await persistDb(db);
      res.status(401).json({
        error: locked
          ? 'Account locked for 15 minutes after 5 failed login attempts.'
          : 'Invalid credentials.',
      });
      return;
    }

    const isAdminTier = ['super_admin', 'admin', 'exam_controller'].includes(user.role);
    if (isAdminTier && user.twoFactorEnabled) {
      if (sendEmail2fa || (!user.totpSecret && !twoFactorCode)) {
        const otpCode = String(crypto.randomInt(100000, 999999));
        const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');
        db.twoFactorChallenges.unshift({
          id: `2fa-${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          email: user.email,
          codeHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        });
        const sent = await sendSecurityEmail(
          user.email,
          'Success Point Portal — 6-Digit 2FA Code',
          `Your 2FA verification code is: ${otpCode} (valid 5 minutes).`
        );
        await persistDb(db);
        if (!sent && !IS_PROD) {
          console.log(`[SPEI Admin 2FA OTP] Code for ${maskEmail(user.email)}: ${otpCode}`);
        }
        res.json({
          requiresTwoFactor: true,
          emailOtpSent: true,
          message: 'A 6-digit 2FA verification code has been dispatched to your registered email.',
        });
        return;
      }

      if (!twoFactorCode) {
        res.json({
          requiresTwoFactor: true,
          message: 'Two-factor authentication required. Enter your 6-digit verification code.',
        });
        return;
      }

      const totpOk = verifyTotp(decryptTotpSecret(user.totpSecret), twoFactorCode);
      let email2faOk = false;
      if (!totpOk && /^\d{6}$/.test(twoFactorCode)) {
        const codeHash = crypto.createHash('sha256').update(twoFactorCode).digest('hex');
        const ch = db.twoFactorChallenges.find(
          (c) =>
            c.userId === user.id &&
            !c.used &&
            Date.now() <= new Date(c.expiresAt).getTime() &&
            c.codeHash === codeHash
        );
        if (ch) {
          ch.used = true;
          email2faOk = true;
        }
      }
      if (!totpOk && !email2faOk) {
        res.status(401).json({ error: 'Invalid or expired 6-digit two-factor verification code.' });
        return;
      }
    }

    const suspiciousIp = Boolean(user.lastKnownIp && user.lastKnownIp !== ip);
    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    user.lastKnownIp = ip;

    db.loginAttempts.unshift({
      id: `attl-${crypto.randomUUID().slice(0, 8)}`,
      email: user.isPrimarySuperAdmin ? maskEmail(email) : email,
      ip,
      userAgent: ua,
      success: true,
      suspicious: suspiciousIp,
      reason: suspiciousIp ? 'Sign-in from new IP address' : 'Verified sign-in',
      timestamp: new Date().toISOString(),
    });
    if (db.loginAttempts.length > 300) {
      db.loginAttempts = db.loginAttempts.slice(0, 300);
    }

    const { token } = createUserSession(db, user, req);
    addAuditLog(db, user.name, user.role, 'LOGIN', user.isPrimarySuperAdmin ? maskEmail(email) : user.email, {
      userId: user.id,
      recordId: user.id,
      ip,
      userAgent: ua,
      updatedValue: suspiciousIp ? 'New IP detected' : undefined,
    });
    await persistDb(db);
    setSessionCookie(req, res, token);
    res.json({ user: sanitizeUser(user), suspiciousIp });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = getRequestSessionToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        const db = await loadDb();
        const session = db.sessions.find((s) => s.id === payload.sid);
        if (session) {
          session.revoked = true;
          session.revokedReason = 'User manual logout';
          addAuditLog(db, session.userName, session.role, 'LOGOUT', session.id, {
            userId: session.userId,
            recordId: session.id,
            ip: req.ip,
          });
          await persistDb(db);
        }
      }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-beacon', async (req, res) => {
    const token = getRequestSessionToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        const db = await loadDb();
        const session = db.sessions.find((s) => s.id === payload.sid);
        if (session && !session.revoked) {
          session.revoked = true;
          session.revokedReason = 'Browser session ended';
          await persistDb(db);
        }
      }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-all', requireAuth, async (req: AuthedRequest, res) => {
    const db = await loadDb();
    let count = 0;
    for (const s of db.sessions) {
      if (s.userId === req.authUser!.id && !s.revoked) {
        s.revoked = true;
        s.revokedReason = 'Manual logout from all devices';
        count += 1;
      }
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'LOGOUT_ALL_DEVICES', `${count} sessions revoked`, {
      userId: req.authUser!.id,
      recordId: req.authUser!.id,
      ip: req.ip,
    });
    await persistDb(db);
    clearSessionCookie(req, res);
    res.json({ ok: true, revokedCount: count });
  });

  app.post('/api/auth/register', rateLimit(15, 60_000), async (req, res) => {
    const name = cleanStr(req.body?.name, 120);
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const phone = cleanStr(req.body?.phone, 20);
    const district = cleanStr(req.body?.district, 60) || 'Dhubri';
    const password = cleanStr(req.body?.password, 128);
    const courseId = cleanStr(req.body?.courseId, 60);

    if (!name || !email || !phone) {
      res.status(400).json({ error: 'Full name, valid email, and mobile number are required.' });
      return;
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const db = await loadDb();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const centre =
      db.centres.find((c) => c.district === district && c.status === 'Active') || db.centres[0];

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name,
      email,
      phone,
      role: 'student',
      district,
      centreId: centre.id,
      status: 'Active',
      passwordHash: hashPassword(password),
      lastLoginAt: new Date().toISOString(),
      lastKnownIp: cleanStr(req.ip || '127.0.0.1', 64),
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);

    const course = db.courses.find((c) => c.id === courseId) || db.courses[0];
    const ids = allocateStudentIdentifiers(db, district, course.code);
    const studentProfile: StudentProfile = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      userId: newUser.id,
      studentId: ids.studentId,
      registrationNumber: ids.registrationNumber,
      admissionNumber: ids.admissionNumber,
      rollNumber: ids.rollNumber,
      applicationId: `SPEI-2026-${1100 + db.applications.length}`,
      fullName: name,
      fatherName: cleanStr(req.body?.fatherName, 120) || 'Guardian On Record',
      motherName: cleanStr(req.body?.motherName, 120) || 'Parent On Record',
      dob: cleanStr(req.body?.dob, 20) || '2006-01-01',
      mobile: phone,
      email,
      address: `${district}, Assam`,
      district,
      centreId: centre.id,
      centreCode: centre.code,
      centreName: centre.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      academicSession: db.cmsSettings.admissionsOpenBatch,
      batch: db.cmsSettings.admissionsOpenBatch,
      registrationDate: new Date().toISOString().slice(0, 10),
      feeTotal: course.fees,
      feePaid: 0,
      admitCardNo: ids.admitCardNo,
      admissionStatus: 'Active',
      enrolledAt: new Date().toISOString(),
    };
    db.students.unshift(studentProfile);
    db.studentIdHistory.unshift({
      id: `sidh-${crypto.randomUUID().slice(0, 8)}`,
      studentId: studentProfile.studentId,
      studentName: studentProfile.fullName,
      action: 'Generated',
      actorName: 'Self-Registration',
      timestamp: new Date().toISOString(),
    });

    const { token } = createUserSession(db, newUser, req);
    addAuditLog(db, name, 'student', 'STUDENT_REGISTER', `${studentProfile.studentId} (${email})`, {
      userId: newUser.id,
      recordId: studentProfile.id,
      ip: req.ip,
    });
    await persistDb(db);
    setSessionCookie(req, res, token);
    res.status(201).json({ user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/request-otp', rateLimit(8, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Registered email address is required.' });
      return;
    }
    const db = await loadDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email && !u.deletedAt);
    if (user) {
      const otpCode = String(crypto.randomInt(100000, 999999));
      const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
      db.otpChallenges.unshift({
        id: `otp-${crypto.randomUUID().slice(0, 8)}`,
        email,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used: false,
      });
      if (db.otpChallenges.length > 50) db.otpChallenges = db.otpChallenges.slice(0, 50);
      const sent = await sendSecurityEmail(
        user.email,
        'Success Point Institute — Password Reset OTP',
        `Your 6-digit password reset verification code is: ${otpCode}\nThis code expires in 10 minutes.`
      );
      addAuditLog(db, user.name, user.role, 'REQUEST_PASSWORD_OTP', user.isPrimarySuperAdmin ? maskEmail(email) : email, {
        userId: user.id,
        recordId: user.id,
        ip: req.ip,
      });
      await persistDb(db);
      if (!sent && !IS_PROD) {
        console.log(`[SPEI OTP Dispatch Preview] OTP generated for ${maskEmail(email)}: ${otpCode}`);
      }
    }
    res.json({
      message:
        'If an account matches this email, a 6-digit OTP verification code has been dispatched (check your verified institutional email or ask Head Office support).',
    });
  });

  app.post('/api/auth/reset-with-otp', rateLimit(10, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const otp = cleanStr(req.body?.otp, 12);
    const twoFactorCode = cleanStr(req.body?.twoFactorCode, 12);
    const newPassword = cleanStr(req.body?.newPassword, 128);
    const db = await loadDb();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const challenge = db.otpChallenges.find(
      (c) =>
        c.email === email &&
        !c.used &&
        Date.now() <= new Date(c.expiresAt).getTime() &&
        c.otpHash === otpHash
    );
    const user = db.users.find((u) => u.email.toLowerCase() === email && !u.deletedAt);
    if (!challenge || !user) {
      res.status(400).json({ error: 'Invalid or expired OTP verification code.' });
      return;
    }
    const minLen = user.role === 'super_admin' ? 10 : 8;
    const pwErr = validatePasswordStrength(newPassword, minLen);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    if (user.isPrimarySuperAdmin && user.totpSecret && !verifyTotp(decryptTotpSecret(user.totpSecret), twoFactorCode)) {
      res.status(401).json({ error: 'Super Admin password reset requires both Email OTP and current 6-digit Authenticator 2FA code.' });
      return;
    }
    challenge.used = true;
    user.passwordHash = hashPassword(newPassword);
    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    // Revoke active sessions after password reset
    for (const s of db.sessions) {
      if (s.userId === user.id) {
        s.revoked = true;
        s.revokedReason = 'Password reset completed';
      }
    }
    addAuditLog(db, user.name, user.role, 'OTP_PASSWORD_RESET', user.isPrimarySuperAdmin ? maskEmail(email) : email, {
      userId: user.id,
      recordId: user.id,
      ip: req.ip,
    });
    if (user.role === 'super_admin' || user.role === 'admin') {
      await notifyPrimarySuperAdmin(
        db,
        `Privileged Password Reset (${user.role})`,
        'Warning',
        `Password was reset via OTP for ${user.isPrimarySuperAdmin ? maskEmail(email) : email} from IP ${req.ip}.`,
        req.ip
      );
    }
    await persistDb(db);
    res.json({ message: 'Password reset successful. Please sign in with your new password.' });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthedRequest, res) => {
    const currentPassword = cleanStr(req.body?.currentPassword, 128);
    const newPassword = cleanStr(req.body?.newPassword, 128);
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    const db = await loadDb();
    const user = db.users.find((u) => u.id === req.authUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    addAuditLog(db, user.name, user.role, 'CHANGE_PASSWORD', user.email, {
      userId: user.id,
      recordId: user.id,
      ip: req.ip,
    });
    await persistDb(db);
    res.json({ message: 'Password updated successfully.' });
  });

  // Public Admission Application & Tracker
  app.post('/api/applications', rateLimit(20, 60_000), async (req, res) => {
    try {
      const fullName = cleanStr(req.body?.fullName, 120);
      const fatherName = cleanStr(req.body?.fatherName, 120);
      const motherName = cleanStr(req.body?.motherName, 120);
      const dob = cleanStr(req.body?.dob, 20);
      const gender = (cleanStr(req.body?.gender, 16) || 'Male') as ApplicationRecord['gender'];
      const mobile = cleanStr(req.body?.mobile, 20);
      const email = cleanStr(req.body?.email, 160);
      const address = cleanStr(req.body?.address, 250);
      const state = cleanStr(req.body?.state, 60) || 'Assam';
      const district = cleanStr(req.body?.district, 60) || 'Dhubri';
      const pinCode = cleanStr(req.body?.pinCode, 12);
      const qualification = cleanStr(req.body?.qualification, 100);
      const courseId = cleanStr(req.body?.courseId, 60);
      const centreId = cleanStr(req.body?.centreId, 60);

      if (!fullName || !fatherName || !motherName || !dob || !mobile || !email || !address || !pinCode || !qualification || !courseId) {
        res.status(400).json({ error: 'Please complete all required application fields.' });
        return;
      }

      const db = await loadDb();
      const course = db.courses.find((c) => c.id === courseId && !c.deletedAt);
      if (!course) {
        res.status(400).json({ error: 'Selected course does not exist.' });
        return;
      }
      const centre =
        db.centres.find((c) => c.id === centreId && c.status === 'Active' && !c.deletedAt) ||
        db.centres.find((c) => c.district === district && c.status === 'Active' && !c.deletedAt) ||
        db.centres[0];

      const photoUrl = await saveSafeUpload(req.body?.photoDataUrl, 'photo');
      const documentUrl = await saveSafeUpload(req.body?.documentDataUrl, 'doc');

      const applicationId = `SPEI-2026-${String(1100 + db.applications.length + Math.floor(Math.random() * 80))}`;
      const record: ApplicationRecord = {
        id: `app-${crypto.randomUUID().slice(0, 8)}`,
        applicationId,
        fullName,
        fatherName,
        motherName,
        dob,
        gender,
        mobile,
        email,
        address,
        state,
        district,
        pinCode,
        qualification,
        courseId: course.id,
        courseName: course.name,
        centreId: centre.id,
        centreName: centre.name,
        photoUrl,
        documentUrl,
        status: 'Pending',
        remarks: 'Application received. Scheduled for office verification.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.applications.unshift(record);
      addAuditLog(db, fullName, 'applicant', 'SUBMIT_APPLICATION', `${applicationId} (${course.code})`, {
        recordId: record.id,
        ip: req.ip,
      });
      await persistDb(db);

      res.status(201).json({
        applicationId: record.applicationId,
        status: record.status,
        courseName: record.courseName,
        centreName: record.centreName,
        createdAt: record.createdAt,
      });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to submit application.' });
    }
  });

  app.get('/api/applications/track', rateLimit(30, 60_000), async (req, res) => {
    const applicationId = cleanStr(req.query.applicationId, 40).toUpperCase();
    const mobile = cleanStr(req.query.mobile, 20).replace(/\D/g, '').slice(-10);
    if (!applicationId || mobile.length < 4) {
      res.status(400).json({ error: 'Enter both Application ID and registered mobile number.' });
      return;
    }
    const db = await loadDb();
    const found = db.applications.find(
      (a) =>
        !a.deletedAt &&
        a.applicationId.toUpperCase() === applicationId &&
        a.mobile.replace(/\D/g, '').endsWith(mobile)
    );
    if (!found) {
      res.status(404).json({ error: 'No matching application found. Verify your Application ID and mobile number.' });
      return;
    }
    res.json({
      applicationId: found.applicationId,
      fullName: found.fullName,
      courseName: found.courseName,
      centreName: found.centreName,
      district: found.district,
      status: found.status,
      remarks: found.remarks,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    });
  });

  app.post('/api/franchise/apply', rateLimit(10, 60_000), async (req, res) => {
    try {
      const applicantName = cleanStr(req.body?.applicantName, 120);
      const organizationName = cleanStr(req.body?.organizationName, 150);
      const mobile = cleanStr(req.body?.mobile, 20);
      const email = cleanStr(req.body?.email, 160);
      const address = cleanStr(req.body?.address, 250);
      const district = cleanStr(req.body?.district, 60) || 'Dhubri';
      const state = cleanStr(req.body?.state, 60) || 'Assam';
      const proposedLocation = cleanStr(req.body?.proposedLocation, 140);
      const infrastructureDetails = cleanStr(req.body?.infrastructureDetails, 350);
      const experience = cleanStr(req.body?.experience, 200);

      if (!applicantName || !organizationName || !mobile || !email || !address || !proposedLocation || !infrastructureDetails) {
        res.status(400).json({ error: 'All mandatory franchise application fields must be completed.' });
        return;
      }

      const db = await loadDb();
      const documentUrl = await saveSafeUpload(req.body?.documentDataUrl, 'franchise-doc');
      const coords = DISTRICT_COORDS[district] || { lat: 26.1445, lng: 91.7362 };
      const code = `SPEI-${district.slice(0, 3).toUpperCase()}-${String(db.centres.length + 10).padStart(3, '0')}`;

      const centre: Centre = {
        id: `ctr-${crypto.randomUUID().slice(0, 8)}`,
        code,
        name: `${organizationName} — ${district}`,
        applicantName,
        organizationName,
        mobile,
        email,
        address,
        district,
        state,
        proposedLocation,
        infrastructureDetails,
        experience,
        documentUrl,
        lat: coords.lat + (Math.random() - 0.5) * 0.02,
        lng: coords.lng + (Math.random() - 0.5) * 0.02,
        status: 'Pending',
        commissionRate: 20,
        createdAt: new Date().toISOString(),
      };
      db.centres.unshift(centre);
      addAuditLog(db, applicantName, 'franchise_applicant', 'FRANCHISE_APPLY', `${centre.code} (${district})`, {
        recordId: centre.id,
        ip: req.ip,
      });
      await persistDb(db);

      res.status(201).json({
        centreCode: centre.code,
        status: centre.status,
        message: 'Franchise application submitted for Head Office review.',
      });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to submit franchise application.' });
    }
  });

  app.post('/api/enquiries', rateLimit(15, 60_000), async (req, res) => {
    const name = cleanStr(req.body?.name, 120);
    const phone = cleanStr(req.body?.phone, 20);
    const email = cleanStr(req.body?.email, 160);
    const district = cleanStr(req.body?.district, 60) || 'Dhubri';
    const subject = cleanStr(req.body?.subject, 160);
    const message = cleanStr(req.body?.message, 1000);
    if (!name || !phone || !message) {
      res.status(400).json({ error: 'Name, phone number, and message are required.' });
      return;
    }
    const db = await loadDb();
    db.enquiries.unshift({
      id: `enq-${crypto.randomUUID().slice(0, 8)}`,
      name,
      phone,
      email,
      district,
      subject: subject || 'General Academic Enquiry',
      message,
      status: 'New',
      createdAt: new Date().toISOString(),
    });
    await persistDb(db);
    res.status(201).json({ message: 'Thank you. Our Dhubri academic counseling desk will contact you shortly.' });
  });

  app.post('/api/newsletter', rateLimit(20, 60_000), async (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    if (!email.includes('@')) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const db = await loadDb();
    if (!db.newsletterSubscribers.includes(email)) {
      db.newsletterSubscribers.push(email);
      await persistDb(db);
    }
    res.json({ message: 'Subscribed to institutional admission & scholarship alerts.' });
  });

  // Public Certificate / Document QR Verification
  app.get('/api/certificates/verify/:certNo', async (req, res) => {
    const certNo = cleanStr(req.params.certNo, 60).toUpperCase();
    const db = await loadDb();
    const cert = db.certificates.find((c) => !c.deletedAt && c.certificateNo.toUpperCase() === certNo);
    if (cert) {
      res.json(cert);
      return;
    }
    const mks = db.marksheets.find((m) => !m.deletedAt && m.status === 'Published' && m.marksheetNo.toUpperCase() === certNo);
    if (mks) {
      res.json({
        id: mks.id,
        certificateNo: mks.marksheetNo,
        documentType: 'Academic Marksheet',
        studentId: mks.studentDbId,
        studentCode: mks.studentId,
        studentName: mks.studentName,
        fatherName: mks.fatherName,
        courseName: mks.courseName,
        district: 'Dhubri',
        centreName: db.cmsSettings.instituteName,
        grade: `${mks.grade} (${mks.percentage}% - ${mks.resultStatus})`,
        issueDate: mks.issueDate,
        status: 'Issued',
        reprintHistory: [],
        isSample: mks.isSample,
      } satisfies CertificateRecord);
      return;
    }
    const mig = db.migrations.find((m) => m.status === 'Approved' && m.migrationNo.toUpperCase() === certNo);
    if (mig) {
      res.json({
        id: mig.id,
        certificateNo: mig.migrationNo,
        documentType: 'Migration Certificate',
        studentId: mig.studentDbId,
        studentCode: mig.studentId,
        studentName: mig.studentName,
        fatherName: mig.fatherName,
        courseName: mig.courseName,
        district: 'Dhubri',
        centreName: db.cmsSettings.instituteName,
        grade: mig.authorizationType,
        issueDate: mig.issueDate || mig.createdAt.slice(0, 10),
        status: 'Issued',
        reprintHistory: [],
        isSample: mig.isSample,
      } satisfies CertificateRecord);
      return;
    }
    res.status(404).json({ error: 'Document / Certificate number not found in verified registry.' });
  });

  // Protected Role-Based Portal Dashboard
  app.get('/api/portal/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const db = await loadDb();
    const activeCourses = db.courses.filter((c) => !c.deletedAt);
    const activeStudents = db.students.filter((s) => !s.deletedAt);
    const activeCentres = db.centres.filter((c) => !c.deletedAt);
    const activeApps = db.applications.filter((a) => !a.deletedAt);
    const activeMarksheets = db.marksheets.filter((m) => !m.deletedAt);
    const activeCertificates = db.certificates.filter((c) => !c.deletedAt);

    if (user.role === 'student') {
      const profile =
        activeStudents.find((s) => s.userId === user.id) ||
        activeStudents.find((s) => s.email.toLowerCase() === user.email.toLowerCase()) ||
        activeStudents[0];
      const studentId = profile?.id;
      const courseId = profile?.courseId;
      res.json({
        role: user.role,
        user: sanitizeUser(user),
        permissions: db.rolePermissions[user.role] || [],
        cmsSettings: db.cmsSettings,
        branding: db.branding,
        documentTemplates: db.documentTemplates,
        profile,
        courses: activeCourses,
        attendance: db.attendance.filter((a) => a.studentId === studentId),
        studyMaterials: db.studyMaterials.filter((m) => m.courseId === courseId || !courseId),
        onlineClasses: db.onlineClasses.filter((c) => c.courseId === courseId || !courseId),
        assignments: db.assignments.filter((a) => a.studentId === studentId),
        exams: db.exams.filter((e) => e.courseId === courseId || !courseId),
        results: db.examResults.filter((r) => r.studentId === studentId),
        admitCards: db.admitCards.filter((a) => a.studentDbId === studentId && a.status === 'Approved'),
        marksheets: activeMarksheets.filter((m) => m.studentDbId === studentId && m.status === 'Published'),
        migrations: db.migrations.filter((m) => m.studentDbId === studentId),
        payments: db.payments.filter((p) => p.studentId === studentId),
        certificates: activeCertificates.filter((c) => c.studentId === studentId),
        notifications: db.notifications,
        tickets: db.supportTickets.filter((t) => t.userId === user.id),
      });
      return;
    }

    if (user.role === 'franchise') {
      const centre = activeCentres.find((c) => c.id === user.centreId) || activeCentres[1] || activeCentres[0];
      const centreStudents = activeStudents.filter((s) => s.centreId === centre.id);
      const centreApps = activeApps.filter((a) => a.centreId === centre.id);
      const centrePayments = db.payments.filter((p) => p.centreId === centre.id);
      const totalCollected = centrePayments.reduce((acc, p) => (p.status === 'Paid' ? acc + p.amount : acc), 0);
      const commissionEarned = Math.round((totalCollected * (centre.commissionRate || 20)) / 100);
      res.json({
        role: user.role,
        user: sanitizeUser(user),
        permissions: db.rolePermissions[user.role] || [],
        cmsSettings: db.cmsSettings,
        branding: db.branding,
        documentTemplates: db.documentTemplates,
        centre,
        courses: activeCourses,
        students: centreStudents,
        applications: centreApps,
        payments: centrePayments,
        admitCards: db.admitCards.filter((ac) => centreStudents.some((s) => s.id === ac.studentDbId)),
        marksheets: activeMarksheets.filter((m) => centreStudents.some((s) => s.id === m.studentDbId)),
        commissionSummary: {
          commissionRate: centre.commissionRate || 20,
          totalCollected,
          commissionEarned,
          netRemittance: totalCollected - commissionEarned,
        },
        certificateRequests: db.certificateRequests.filter((r) => r.centreId === centre.id),
        notifications: db.notifications,
        tickets: db.supportTickets.filter((t) => t.userId === user.id),
      });
      return;
    }

    if (user.role === 'district_coordinator') {
      const d = user.district;
      res.json({
        role: user.role,
        user: sanitizeUser(user),
        permissions: db.rolePermissions[user.role] || [],
        cmsSettings: db.cmsSettings,
        branding: db.branding,
        documentTemplates: db.documentTemplates,
        district: d,
        centres: activeCentres.filter((c) => c.district === d),
        students: activeStudents.filter((s) => s.district === d),
        applications: activeApps.filter((a) => a.district === d),
        payments: db.payments.filter((p) => p.district === d),
        staff: db.users.filter((u) => !u.deletedAt && u.district === d && u.role === 'staff').map(sanitizeUser),
        notifications: db.notifications,
        districtAnalytics: computeDistrictAnalytics(db),
      });
      return;
    }

    // All Administrative, Exam Controller, Office Manager, Admission Officer, Accountant & Staff Workspaces
    const totalRevenue = db.payments.reduce((acc, p) => (p.status === 'Paid' ? acc + p.amount : acc), 0);
    const pendingPayments = activeStudents.reduce((acc, s) => acc + Math.max(0, s.feeTotal - s.feePaid), 0);
    const isSuperOrAdmin = user.role === 'super_admin' || user.role === 'admin';

    res.json({
      role: user.role,
      user: sanitizeUser(user),
      permissions: db.rolePermissions[user.role] || [],
      overview: {
        totalStudents: activeStudents.length,
        totalApplications: activeApps.length,
        approvedAdmissions: activeApps.filter((a) => a.status === 'Approved').length,
        pendingApplications: activeApps.filter((a) => a.status === 'Pending' || a.status === 'Verified').length,
        totalCourses: activeCourses.length,
        totalStaff: db.users.filter((u) => !u.deletedAt && u.role !== 'student' && u.role !== 'franchise').length,
        totalFranchises: activeCentres.length,
        activeFranchises: activeCentres.filter((c) => c.status === 'Active').length,
        totalRevenue,
        pendingPayments,
      },
      cmsSettings: db.cmsSettings,
      branding: db.branding,
      documentTemplates: db.documentTemplates,
      whatsappSettings: db.whatsappSettings,
      cmsVersions: isSuperOrAdmin ? db.cmsVersions : [],
      backups: isSuperOrAdmin ? db.backups : [],
      rolePermissions: isSuperOrAdmin ? db.rolePermissions : undefined,
      sessions: isSuperOrAdmin ? db.sessions.slice(0, 80) : [],
      loginAttempts: isSuperOrAdmin ? db.loginAttempts.slice(0, 100) : [],
      securityAlerts: user.role === 'super_admin' ? db.securityAlerts.slice(0, 60) : [],
      studentIdHistory: db.studentIdHistory.slice(0, 100),
      courses: activeCourses,
      centres: activeCentres,
      users: db.users
        .filter((u) => !u.deletedAt && (!u.isPrimarySuperAdmin || user.role === 'super_admin'))
        .map(sanitizeUser),
      applications: activeApps,
      students: activeStudents,
      admitCards: db.admitCards,
      marksheets: activeMarksheets,
      migrations: db.migrations,
      attendance: db.attendance,
      studyMaterials: db.studyMaterials,
      onlineClasses: db.onlineClasses,
      assignments: db.assignments,
      exams: db.exams,
      examResults: db.examResults,
      payments: db.payments,
      certificates: activeCertificates,
      certificateRequests: db.certificateRequests,
      notifications: db.notifications,
      gallery: db.gallery,
      enquiries: db.enquiries,
      supportTickets: db.supportTickets,
      staffTasks: db.staffTasks,
      tasks: db.staffTasks,
      blogs: db.blogs,
      auditLogs: db.auditLogs,
      deletedRecords: isSuperOrAdmin
        ? {
            courses: db.courses.filter((x) => Boolean(x.deletedAt)),
            students: db.students.filter((x) => Boolean(x.deletedAt)),
            applications: db.applications.filter((x) => Boolean(x.deletedAt)),
            certificates: db.certificates.filter((x) => Boolean(x.deletedAt)),
            marksheets: db.marksheets.filter((x) => Boolean(x.deletedAt)),
          }
        : undefined,
      districtAnalytics: computeDistrictAnalytics(db),
    });
  });

  // Student Portal Actions
  app.post('/api/student/assignments/:id/submit', requireAuth, requireRole('student'), async (req: AuthedRequest, res) => {
    const submissionText = cleanStr(req.body?.submissionText, 2000);
    if (!submissionText) {
      res.status(400).json({ error: 'Enter your assignment response before submitting.' });
      return;
    }
    const db = await loadDb();
    const asg = db.assignments.find((a) => a.id === req.params.id);
    if (!asg) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    asg.submissionText = submissionText;
    asg.status = 'Submitted';
    asg.submittedAt = new Date().toISOString();
    await persistDb(db);
    res.json(asg);
  });

  app.post('/api/student/exams/:id/submit', requireAuth, requireRole('student'), async (req: AuthedRequest, res) => {
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const db = await loadDb();
    const exam = db.exams.find((e) => e.id === req.params.id);
    if (!exam) {
      res.status(404).json({ error: 'Exam not found.' });
      return;
    }
    const student = db.students.find((s) => s.userId === req.authUser!.id && !s.deletedAt) || db.students[0];
    let correct = 0;
    exam.questions.forEach((q, idx) => {
      if (Number(answers[idx]) === q.correctIndex) correct += 1;
    });
    const perQuestion = exam.totalMarks / Math.max(1, exam.questions.length);
    const score = Math.round(correct * perQuestion);
    const pct = (score / exam.totalMarks) * 100;
    const grade = pct >= 85 ? 'A+' : pct >= 70 ? 'A' : pct >= 55 ? 'B' : pct >= 40 ? 'C' : 'F';
    const result = {
      id: `res-${crypto.randomUUID().slice(0, 8)}`,
      examId: exam.id,
      examTitle: exam.title,
      studentId: student.id,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      score,
      totalMarks: exam.totalMarks,
      grade,
      status: (pct >= 40 ? 'Pass' : 'Fail') as 'Pass' | 'Fail',
      publishedAt: new Date().toISOString(),
    };
    db.examResults.unshift(result);
    addAuditLog(db, student.fullName, 'student', 'COMPLETE_EXAM', `${exam.title} (${score}/${exam.totalMarks})`, {
      userId: req.authUser!.id,
      recordId: result.id,
    });
    await persistDb(db);
    res.json(result);
  });

  app.post('/api/student/payments', requireAuth, requireRole('student'), async (req: AuthedRequest, res) => {
    const amount = cleanNum(req.body?.amount, 0);
    const method = (cleanStr(req.body?.method, 20) || 'UPI') as 'UPI' | 'Card' | 'NetBanking' | 'Cash';
    if (amount <= 0 || amount > 100000) {
      res.status(400).json({ error: 'Enter a valid fee payment amount.' });
      return;
    }
    const db = await loadDb();
    const student = db.students.find((s) => s.userId === req.authUser!.id && !s.deletedAt) || db.students[0];
    const receiptNo = `RCPT-SPEI-2026-${String(800 + db.payments.length)}`;
    const payment = {
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      receiptNo,
      studentId: student.id,
      studentName: student.fullName,
      applicationId: student.applicationId,
      courseName: student.courseName,
      district: student.district,
      centreId: student.centreId,
      amount,
      method,
      transactionRef: `${method.toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      status: 'Paid' as const,
      paidAt: new Date().toISOString(),
    };
    db.payments.unshift(payment);
    student.feePaid = Math.min(student.feeTotal, student.feePaid + amount);
    addAuditLog(db, student.fullName, 'student', 'ONLINE_FEE_PAYMENT', `${receiptNo} ₹${amount}`, {
      userId: req.authUser!.id,
      recordId: payment.id,
    });
    await persistDb(db);
    res.status(201).json(payment);
  });

  app.post('/api/student/migration-apply', requireAuth, requireRole('student'), async (req: AuthedRequest, res) => {
    const targetInstitution = cleanStr(req.body?.targetInstitution, 160);
    const reason = cleanStr(req.body?.reason, 300);
    const lastExamDetails = cleanStr(req.body?.lastExamDetails, 160) || 'Latest institutional assessment';
    const authorizationType =
      req.body?.authorizationType === 'Awarding Body Referral Letter'
        ? 'Awarding Body Referral Letter'
        : 'Institutional Transfer Certificate';

    if (!targetInstitution || !reason) {
      res.status(400).json({ error: 'Target institution and migration reason are required.' });
      return;
    }
    const db = await loadDb();
    const student = db.students.find((s) => s.userId === req.authUser!.id && !s.deletedAt) || db.students[0];
    const feeCleared = student.feePaid >= student.feeTotal;
    const record: MigrationRecord = {
      id: `mig-${crypto.randomUUID().slice(0, 8)}`,
      migrationNo: `MIG-${new Date().getFullYear()}-${String(1001 + db.migrations.length)}`,
      studentDbId: student.id,
      studentId: student.studentId,
      registrationNumber: student.registrationNumber,
      studentName: student.fullName,
      fatherName: student.fatherName,
      courseName: student.courseName,
      academicSession: student.academicSession,
      lastExamDetails,
      targetInstitution,
      reason,
      documentVerified: true,
      feeVerified: feeCleared,
      authorizationType,
      status: 'Pending',
      remarks: feeCleared
        ? 'Submitted for Registrar & Admin review.'
        : 'Pending fee clearance check before approval.',
      createdAt: new Date().toISOString(),
    };
    db.migrations.unshift(record);
    addAuditLog(db, student.fullName, 'student', 'APPLY_MIGRATION_CERTIFICATE', record.migrationNo, {
      userId: req.authUser!.id,
      recordId: record.id,
    });
    await persistDb(db);
    res.status(201).json(record);
  });

  // Student ID Card Action History Log
  app.post('/api/students/:id/id-history', requireAuth, async (req: AuthedRequest, res) => {
    const action = (cleanStr(req.body?.action, 30) || 'PDF Downloaded') as StudentIdHistoryItem['action'];
    const db = await loadDb();
    const stu = db.students.find((s) => s.id === req.params.id && !s.deletedAt);
    if (!stu) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const entry: StudentIdHistoryItem = {
      id: `sidh-${crypto.randomUUID().slice(0, 8)}`,
      studentId: stu.studentId,
      studentName: stu.fullName,
      action,
      actorName: req.authUser!.name,
      timestamp: new Date().toISOString(),
    };
    db.studentIdHistory.unshift(entry);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, `ID_CARD_${action.toUpperCase()}`, stu.studentId, {
      userId: req.authUser!.id,
      recordId: stu.id,
    });
    await persistDb(db);
    res.status(201).json(entry);
  });

  // Support Tickets
  app.post('/api/tickets', requireAuth, async (req: AuthedRequest, res) => {
    const subject = cleanStr(req.body?.subject, 160);
    const category = cleanStr(req.body?.category, 60) || 'General';
    const message = cleanStr(req.body?.message, 1000);
    if (!subject || !message) {
      res.status(400).json({ error: 'Subject and message are required.' });
      return;
    }
    const db = await loadDb();
    const ticket = {
      id: `tkt-${crypto.randomUUID().slice(0, 8)}`,
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      district: req.authUser!.district,
      subject,
      category,
      message,
      status: 'Open' as const,
      createdAt: new Date().toISOString(),
    };
    db.supportTickets.unshift(ticket);
    await persistDb(db);
    res.status(201).json(ticket);
  });

  // Franchise Portal Actions
  app.post('/api/franchise/students', requireAuth, requireRole('franchise', 'admin', 'super_admin'), async (req: AuthedRequest, res) => {
    const fullName = cleanStr(req.body?.fullName, 120);
    const fatherName = cleanStr(req.body?.fatherName, 120);
    const mobile = cleanStr(req.body?.mobile, 20);
    const email = cleanStr(req.body?.email, 160);
    const courseId = cleanStr(req.body?.courseId, 60);
    if (!fullName || !mobile || !email || !courseId) {
      res.status(400).json({ error: 'Student name, mobile, email, and course are required.' });
      return;
    }
    const db = await loadDb();
    const centre = db.centres.find((c) => c.id === req.authUser!.centreId && !c.deletedAt) || db.centres[0];
    if (centre.status !== 'Active') {
      res.status(403).json({ error: 'Franchise centre must be Active before admitting students.' });
      return;
    }
    const course = db.courses.find((c) => c.id === courseId && !c.deletedAt) || db.courses[0];
    const appId = `SPEI-2026-${String(1200 + db.applications.length)}`;
    const appRecord: ApplicationRecord = {
      id: `app-${crypto.randomUUID().slice(0, 8)}`,
      applicationId: appId,
      fullName,
      fatherName: fatherName || 'Parent On Record',
      motherName: cleanStr(req.body?.motherName, 120) || 'Parent On Record',
      dob: cleanStr(req.body?.dob, 20) || '2006-01-01',
      gender: 'Male',
      mobile,
      email,
      address: centre.district,
      state: 'Assam',
      district: centre.district,
      pinCode: '783301',
      qualification: cleanStr(req.body?.qualification, 80) || '10+2 Passed',
      courseId: course.id,
      courseName: course.name,
      centreId: centre.id,
      centreName: centre.name,
      status: 'Approved',
      remarks: `Registered via Franchise Centre ${centre.code}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.applications.unshift(appRecord);
    const student = enrollStudentFromApplication(db, appRecord, req.authUser!.name);
    await persistDb(db);
    res.status(201).json(student);
  });

  app.post('/api/franchise/certificate-requests', requireAuth, requireRole('franchise'), async (req: AuthedRequest, res) => {
    const studentId = cleanStr(req.body?.studentId, 60);
    const db = await loadDb();
    const centre = db.centres.find((c) => c.id === req.authUser!.centreId) || db.centres[0];
    const student = db.students.find((s) => s.id === studentId && !s.deletedAt);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const reqItem = {
      id: `creq-${crypto.randomUUID().slice(0, 8)}`,
      centreId: centre.id,
      centreName: centre.name,
      studentId: student.id,
      studentName: student.fullName,
      courseName: student.courseName,
      status: 'Pending' as const,
      requestedAt: new Date().toISOString(),
    };
    db.certificateRequests.unshift(reqItem);
    addAuditLog(db, req.authUser!.name, 'franchise', 'REQUEST_CERTIFICATE', student.fullName, {
      userId: req.authUser!.id,
      recordId: reqItem.id,
    });
    await persistDb(db);
    res.status(201).json(reqItem);
  });

  // Admissions & Operational Routes (Permission-guarded)
  app.patch('/api/applications/:id', requireAuth, requirePermission('manage_admissions'), async (req: AuthedRequest, res) => {
    const status = cleanStr(req.body?.status, 30) as ApplicationRecord['status'];
    const remarks = cleanStr(req.body?.remarks, 300);
    const db = await loadDb();
    const appRecord = db.applications.find((a) => a.id === req.params.id && !a.deletedAt);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    const prev = appRecord.status;
    appRecord.status = status;
    if (remarks) appRecord.remarks = remarks;
    appRecord.updatedAt = new Date().toISOString();
    let createdStudent: StudentProfile | undefined;
    if (status === 'Approved') {
      createdStudent = enrollStudentFromApplication(db, appRecord, req.authUser!.name);
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_APPLICATION', appRecord.applicationId, {
      userId: req.authUser!.id,
      recordId: appRecord.id,
      previousValue: prev,
      updatedValue: status,
      ip: req.ip,
    });
    await persistDb(db);
    res.json({ application: appRecord, student: createdStudent });
  });

  app.post('/api/attendance', requireAuth, requirePermission('manage_students'), async (req: AuthedRequest, res) => {
    const studentId = cleanStr(req.body?.studentId, 60);
    const date = cleanStr(req.body?.date, 20) || new Date().toISOString().slice(0, 10);
    const status = (cleanStr(req.body?.status, 20) || 'Present') as 'Present' | 'Absent' | 'Late';
    const db = await loadDb();
    const student = db.students.find((s) => s.id === studentId && !s.deletedAt);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const rec = {
      id: `att-${crypto.randomUUID().slice(0, 8)}`,
      studentId: student.id,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      courseId: student.courseId,
      district: student.district,
      date,
      status,
      markedBy: req.authUser!.name,
    };
    db.attendance.unshift(rec);
    await persistDb(db);
    res.status(201).json(rec);
  });

  app.post('/api/payments/record', requireAuth, requirePermission('manage_fees'), async (req: AuthedRequest, res) => {
    const studentId = cleanStr(req.body?.studentId, 60);
    const amount = cleanNum(req.body?.amount, 0);
    const method = (cleanStr(req.body?.method, 20) || 'Cash') as 'UPI' | 'Card' | 'NetBanking' | 'Cash';
    if (!studentId || amount <= 0) {
      res.status(400).json({ error: 'Select student and enter a positive fee amount.' });
      return;
    }
    const db = await loadDb();
    const student = db.students.find((s) => s.id === studentId && !s.deletedAt);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const receiptNo = `RCPT-SPEI-2026-${String(800 + db.payments.length)}`;
    const payment = {
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      receiptNo,
      studentId: student.id,
      studentName: student.fullName,
      applicationId: student.applicationId,
      courseName: student.courseName,
      district: student.district,
      centreId: student.centreId,
      amount,
      method,
      transactionRef: `OFF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      status: 'Paid' as const,
      paidAt: new Date().toISOString(),
    };
    db.payments.unshift(payment);
    student.feePaid = Math.min(student.feeTotal, student.feePaid + amount);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'RECORD_FEE', `${student.studentId} ₹${amount}`, {
      userId: req.authUser!.id,
      recordId: payment.id,
      ip: req.ip,
    });
    await persistDb(db);
    res.status(201).json(payment);
  });

  app.patch('/api/tickets/:id', requireAuth, requirePermission('manage_students'), async (req: AuthedRequest, res) => {
    const status = cleanStr(req.body?.status, 30) as 'Open' | 'In Review' | 'Resolved';
    const reply = cleanStr(req.body?.reply, 1000);
    const db = await loadDb();
    const tkt = db.supportTickets.find((t) => t.id === req.params.id);
    if (!tkt) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    if (status) tkt.status = status;
    if (reply) tkt.reply = reply;
    await persistDb(db);
    res.json(tkt);
  });

  app.patch('/api/tasks/:id', requireAuth, async (req: AuthedRequest, res) => {
    const status = cleanStr(req.body?.status, 30) as 'Pending' | 'In Progress' | 'Completed';
    const db = await loadDb();
    const task = db.staffTasks.find((t) => t.id === req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }
    task.status = status;
    await persistDb(db);
    res.json(task);
  });

  app.post('/api/notifications', requireAuth, requirePermission('manage_notices_gallery'), async (req: AuthedRequest, res) => {
    const title = cleanStr(req.body?.title, 180);
    const category = (cleanStr(req.body?.category, 40) || 'Announcement') as NotificationItem['category'];
    const district = cleanStr(req.body?.district, 60) || 'All Assam';
    const summary = cleanStr(req.body?.summary, 400);
    const content = cleanStr(req.body?.content, 2000) || summary;
    if (!title || !summary) {
      res.status(400).json({ error: 'Title and summary are required.' });
      return;
    }
    const db = await loadDb();
    const item: NotificationItem = {
      id: `not-${crypto.randomUUID().slice(0, 8)}`,
      title,
      category,
      district,
      summary,
      content,
      publishedAt: new Date().toISOString().slice(0, 10),
      isPinned: Boolean(req.body?.isPinned),
    };
    db.notifications.unshift(item);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'PUBLISH_NOTIFICATION', title, {
      userId: req.authUser!.id,
      recordId: item.id,
    });
    await persistDb(db);
    res.status(201).json(item);
  });

  app.delete('/api/notifications/:id', requireAuth, requirePermission('manage_notices_gallery'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    db.notifications = db.notifications.filter((n) => n.id !== req.params.id);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'DELETE_NOTIFICATION', req.params.id, {
      userId: req.authUser!.id,
      recordId: req.params.id,
    });
    await persistDb(db);
    res.json({ ok: true });
  });

  // Courses CRUD
  app.post('/api/admin/courses', requireAuth, requirePermission('manage_courses'), async (req: AuthedRequest, res) => {
    const name = cleanStr(req.body?.name, 160);
    const category = cleanStr(req.body?.category, 80) as Course['category'];
    const description = cleanStr(req.body?.description, 600);
    if (!name || !category || !description) {
      res.status(400).json({ error: 'Course name, category, and description are required.' });
      return;
    }
    const db = await loadDb();
    const course: Course = {
      id: `crs-${crypto.randomUUID().slice(0, 8)}`,
      code: cleanStr(req.body?.code, 30) || `SPEI-${String(db.courses.length + 13)}`,
      name,
      category,
      description,
      eligibility: cleanStr(req.body?.eligibility, 160) || 'Class 10 Passed',
      duration: cleanStr(req.body?.duration, 60) || '6 Months',
      fees: cleanNum(req.body?.fees, 4500),
      mode: (cleanStr(req.body?.mode, 20) || 'Offline') as Course['mode'],
      admissionRequirements: ['Academic Marksheet', 'Valid Govt ID', '2 Passport Photos'],
      syllabus: cleanStr(req.body?.syllabusText, 600).split('\n').map((s) => s.trim()).filter(Boolean),
      careerOpportunities: ['Practical Skill Certification', 'Employment & Academic Progression'],
      authorizationNote: cleanStr(req.body?.authorizationNote, 200) || 'Authorized institutional training & academic support.',
      featured: Boolean(req.body?.featured),
    };
    if (!course.syllabus.length) course.syllabus = ['Core Conceptual Foundations', 'Practical Lab & Assessment'];
    db.courses.unshift(course);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'CREATE_COURSE', course.name, {
      userId: req.authUser!.id,
      recordId: course.id,
    });
    await persistDb(db);
    res.status(201).json(course);
  });

  app.patch('/api/admin/courses/:id', requireAuth, requirePermission('manage_courses'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const course = db.courses.find((c) => c.id === req.params.id && !c.deletedAt);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    const prevFees = course.fees;
    if (req.body?.name) course.name = cleanStr(req.body.name, 160);
    if (req.body?.fees !== undefined) course.fees = Math.max(0, cleanNum(req.body.fees, course.fees));
    if (req.body?.duration) course.duration = cleanStr(req.body.duration, 60);
    if (req.body?.description) course.description = cleanStr(req.body.description, 600);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_COURSE', course.name, {
      userId: req.authUser!.id,
      recordId: course.id,
      previousValue: `₹${prevFees}`,
      updatedValue: `₹${course.fees}`,
    });
    await persistDb(db);
    res.json(course);
  });

  // Admit Card Automation & Approval
  app.post('/api/admin/admit-cards', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const studentDbId = cleanStr(req.body?.studentDbId, 60);
    const examName = cleanStr(req.body?.examName, 160);
    const examSession = cleanStr(req.body?.examSession, 60) || 'December 2026';
    const examDate = cleanStr(req.body?.examDate, 30) || '2026-12-15';
    const examTiming = cleanStr(req.body?.examTiming, 60) || '10:00 AM – 01:00 PM IST';
    const subjectsRaw = cleanStr(req.body?.subjectsText, 600);

    const db = await loadDb();
    const stu = db.students.find((s) => s.id === studentDbId && !s.deletedAt);
    if (!stu || !examName) {
      res.status(400).json({ error: 'Valid student and examination name are required.' });
      return;
    }
    const card: AdmitCardRecord = {
      id: `adm-${crypto.randomUUID().slice(0, 8)}`,
      admitCardNo: `HAL-${new Date().getFullYear()}-${String(10001 + db.admitCards.length)}`,
      studentDbId: stu.id,
      studentId: stu.studentId,
      registrationNumber: stu.registrationNumber,
      studentName: stu.fullName,
      fatherName: stu.fatherName,
      photoUrl: stu.photoUrl,
      courseName: stu.courseName,
      courseCode: stu.courseCode,
      examName,
      examSession,
      examCentre: cleanStr(req.body?.examCentre, 160) || stu.centreName,
      examDate,
      examTiming,
      subjects: subjectsRaw
        ? subjectsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
        : ['Paper I: Core Theory Evaluation', 'Paper II: Practical & Lab Assessment'],
      status: req.body?.approveNow ? 'Approved' : 'Draft',
      approvedBy: req.body?.approveNow ? req.authUser!.name : undefined,
      publishedAt: req.body?.approveNow ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };
    db.admitCards.unshift(card);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'GENERATE_ADMIT_CARD', `${card.admitCardNo} (${stu.fullName})`, {
      userId: req.authUser!.id,
      recordId: card.id,
    });
    await persistDb(db);
    res.status(201).json(card);
  });

  app.post('/api/admin/admit-cards/bulk', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const courseId = cleanStr(req.body?.courseId, 60);
    const examName = cleanStr(req.body?.examName, 160);
    const examDate = cleanStr(req.body?.examDate, 30) || '2026-12-18';
    const examTiming = cleanStr(req.body?.examTiming, 60) || '10:00 AM – 01:00 PM IST';
    const db = await loadDb();
    const targets = db.students.filter((s) => !s.deletedAt && (!courseId || s.courseId === courseId));
    if (!examName || targets.length === 0) {
      res.status(400).json({ error: 'Exam name and matching active students are required.' });
      return;
    }
    const created: AdmitCardRecord[] = [];
    for (const stu of targets) {
      const card: AdmitCardRecord = {
        id: `adm-${crypto.randomUUID().slice(0, 8)}`,
        admitCardNo: `HAL-${new Date().getFullYear()}-${String(10001 + db.admitCards.length)}`,
        studentDbId: stu.id,
        studentId: stu.studentId,
        registrationNumber: stu.registrationNumber,
        studentName: stu.fullName,
        fatherName: stu.fatherName,
        photoUrl: stu.photoUrl,
        courseName: stu.courseName,
        courseCode: stu.courseCode,
        examName,
        examSession: stu.academicSession,
        examCentre: stu.centreName,
        examDate,
        examTiming,
        subjects: ['Paper I: Theory Evaluation', 'Paper II: Practical & Viva Voce'],
        status: req.body?.approveNow ? 'Approved' : 'Draft',
        approvedBy: req.body?.approveNow ? req.authUser!.name : undefined,
        publishedAt: req.body?.approveNow ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      };
      db.admitCards.unshift(card);
      created.push(card);
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'BULK_GENERATE_ADMIT_CARDS', `${created.length} cards (${examName})`, {
      userId: req.authUser!.id,
    });
    await persistDb(db);
    res.status(201).json({ count: created.length, cards: created });
  });

  app.patch('/api/admin/admit-cards/:id/approve', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const card = db.admitCards.find((a) => a.id === req.params.id);
    if (!card) {
      res.status(404).json({ error: 'Admit card not found.' });
      return;
    }
    card.status = card.status === 'Approved' ? 'Draft' : 'Approved';
    card.approvedBy = card.status === 'Approved' ? req.authUser!.name : undefined;
    card.publishedAt = card.status === 'Approved' ? new Date().toISOString() : undefined;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'APPROVE_ADMIT_CARD', `${card.admitCardNo} -> ${card.status}`, {
      userId: req.authUser!.id,
      recordId: card.id,
    });
    await persistDb(db);
    res.json(card);
  });

  // Marksheet Automation & Excel Import & Versioning
  app.post('/api/admin/marksheets', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const studentDbId = cleanStr(req.body?.studentDbId, 60);
    const examName = cleanStr(req.body?.examName, 160);
    const rawSubjects = Array.isArray(req.body?.subjects) ? (req.body.subjects as SubjectMark[]) : [];
    const db = await loadDb();
    const stu = db.students.find((s) => s.id === studentDbId && !s.deletedAt);
    if (!stu || !examName || rawSubjects.length === 0) {
      res.status(400).json({ error: 'Student, exam name, and at least one subject mark are required.' });
      return;
    }
    const subjects: SubjectMark[] = rawSubjects.map((sub, i) => ({
      subjectCode: cleanStr(sub.subjectCode, 20) || `SUB-${i + 1}`,
      subjectName: cleanStr(sub.subjectName, 120) || `Subject ${i + 1}`,
      maxMarks: Math.max(10, cleanNum(sub.maxMarks, 100)),
      passingMarks: Math.max(1, cleanNum(sub.passingMarks, 35)),
      obtainedMarks: Math.max(0, Math.min(cleanNum(sub.maxMarks, 100), cleanNum(sub.obtainedMarks, 0))),
    }));
    const summary = computeMarksSummary(subjects);
    const mks: MarksheetRecord = {
      id: `mks-${crypto.randomUUID().slice(0, 8)}`,
      marksheetNo: `MKS-${new Date().getFullYear()}-${String(10001 + db.marksheets.length)}`,
      studentDbId: stu.id,
      studentId: stu.studentId,
      registrationNumber: stu.registrationNumber,
      studentName: stu.fullName,
      fatherName: stu.fatherName,
      courseName: stu.courseName,
      courseCode: stu.courseCode,
      examName,
      academicSession: stu.academicSession,
      subjects,
      ...summary,
      status: 'Draft',
      issueDate: new Date().toISOString().slice(0, 10),
      versionHistory: [
        {
          version: 1,
          subjects,
          ...summary,
          editedBy: req.authUser!.name,
          reason: 'Initial mark entry',
          timestamp: new Date().toISOString(),
        },
      ],
    };
    db.marksheets.unshift(mks);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'CREATE_MARKSHEET', `${mks.marksheetNo} (${stu.fullName})`, {
      userId: req.authUser!.id,
      recordId: mks.id,
    });
    await persistDb(db);
    res.status(201).json(mks);
  });

  app.post('/api/admin/marksheets/import', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const examName = cleanStr(req.body?.examName, 160);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!examName || rows.length === 0) {
      res.status(400).json({ error: 'Examination name and parsed Excel/CSV mark rows are required.' });
      return;
    }
    const db = await loadDb();
    const created: MarksheetRecord[] = [];
    for (const row of rows.slice(0, 200)) {
      const studentLookup = cleanStr(row?.studentId || row?.rollNumber, 60).toUpperCase();
      const stu =
        db.students.find(
          (s) =>
            !s.deletedAt &&
            (s.studentId.toUpperCase() === studentLookup ||
              s.rollNumber.toUpperCase() === studentLookup)
        ) || db.students.find((s) => !s.deletedAt);
      if (!stu) continue;

      const subjects: SubjectMark[] = Array.isArray(row.subjects)
        ? row.subjects
        : [
            {
              subjectCode: cleanStr(row?.subjectCode, 20) || 'PAPER-1',
              subjectName: cleanStr(row?.subjectName, 120) || 'Consolidated Theory & Practical',
              maxMarks: Math.max(10, cleanNum(row?.maxMarks, 100)),
              passingMarks: Math.max(1, cleanNum(row?.passingMarks, 35)),
              obtainedMarks: Math.max(0, cleanNum(row?.obtainedMarks, 75)),
            },
          ];
      const summary = computeMarksSummary(subjects);
      const mks: MarksheetRecord = {
        id: `mks-${crypto.randomUUID().slice(0, 8)}`,
        marksheetNo: `MKS-${new Date().getFullYear()}-${String(10001 + db.marksheets.length)}`,
        studentDbId: stu.id,
        studentId: stu.studentId,
        registrationNumber: stu.registrationNumber,
        studentName: cleanStr(row?.studentName, 120) || stu.fullName,
        fatherName: stu.fatherName,
        courseName: stu.courseName,
        courseCode: stu.courseCode,
        examName,
        academicSession: stu.academicSession,
        subjects,
        ...summary,
        status: 'Draft',
        issueDate: new Date().toISOString().slice(0, 10),
        versionHistory: [
          {
            version: 1,
            subjects,
            ...summary,
            editedBy: req.authUser!.name,
            reason: 'Excel/CSV bulk import',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      db.marksheets.unshift(mks);
      created.push(mks);
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'BULK_IMPORT_MARKSHEETS', `${created.length} marksheets (${examName})`, {
      userId: req.authUser!.id,
    });
    await persistDb(db);
    res.status(201).json({ imported: created.length, marksheets: created });
  });

  app.patch('/api/admin/marksheets/:id', requireAuth, requirePermission('manage_exams_marksheets'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const mks = db.marksheets.find((m) => m.id === req.params.id && !m.deletedAt);
    if (!mks) {
      res.status(404).json({ error: 'Marksheet not found.' });
      return;
    }
    if (req.body?.status && ['Draft', 'Approved', 'Published'].includes(req.body.status)) {
      const prevStatus = mks.status;
      mks.status = req.body.status;
      if (mks.status !== 'Draft') {
        mks.approvedBy = req.authUser!.name;
      }
      addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_MARKSHEET_STATUS', mks.marksheetNo, {
        userId: req.authUser!.id,
        recordId: mks.id,
        previousValue: prevStatus,
        updatedValue: mks.status,
      });
    }
    if (Array.isArray(req.body?.subjects) && req.body.subjects.length > 0) {
      const prevPct = mks.percentage;
      const subjects = (req.body.subjects as SubjectMark[]).map((sub, i) => ({
        subjectCode: cleanStr(sub.subjectCode, 20) || `SUB-${i + 1}`,
        subjectName: cleanStr(sub.subjectName, 120) || `Subject ${i + 1}`,
        maxMarks: Math.max(10, cleanNum(sub.maxMarks, 100)),
        passingMarks: Math.max(1, cleanNum(sub.passingMarks, 35)),
        obtainedMarks: Math.max(0, Math.min(cleanNum(sub.maxMarks, 100), cleanNum(sub.obtainedMarks, 0))),
      }));
      const summary = computeMarksSummary(subjects);
      mks.subjects = subjects;
      mks.totalMaxMarks = summary.totalMaxMarks;
      mks.totalObtainedMarks = summary.totalObtainedMarks;
      mks.percentage = summary.percentage;
      mks.grade = summary.grade;
      mks.resultStatus = summary.resultStatus;
      mks.versionHistory.unshift({
        version: mks.versionHistory.length + 1,
        subjects,
        ...summary,
        editedBy: req.authUser!.name,
        reason: cleanStr(req.body?.reason, 200) || 'Exam Controller correction',
        timestamp: new Date().toISOString(),
      });
      addAuditLog(db, req.authUser!.name, req.authUser!.role, 'CORRECT_MARKSHEET_MARKS', mks.marksheetNo, {
        userId: req.authUser!.id,
        recordId: mks.id,
        previousValue: `${prevPct}%`,
        updatedValue: `${mks.percentage}%`,
      });
    }
    await persistDb(db);
    res.json(mks);
  });

  // Migration Certificate Review & Issue
  app.patch('/api/admin/migrations/:id', requireAuth, requirePermission('manage_certificates'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const mig = db.migrations.find((m) => m.id === req.params.id);
    if (!mig) {
      res.status(404).json({ error: 'Migration application not found.' });
      return;
    }
    const prev = mig.status;
    if (req.body?.documentVerified !== undefined) mig.documentVerified = Boolean(req.body.documentVerified);
    if (req.body?.feeVerified !== undefined) mig.feeVerified = Boolean(req.body.feeVerified);
    if (req.body?.remarks) mig.remarks = cleanStr(req.body.remarks, 300);
    if (req.body?.status && ['Pending', 'Verified', 'Approved', 'Rejected'].includes(req.body.status)) {
      if (req.body.status === 'Approved' && (!mig.documentVerified || !mig.feeVerified)) {
        res.status(400).json({ error: 'Verify documents and fee clearance before approving Migration Certificate.' });
        return;
      }
      mig.status = req.body.status;
      if (mig.status === 'Approved') {
        mig.approvedBy = req.authUser!.name;
        mig.issueDate = new Date().toISOString().slice(0, 10);
      }
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_MIGRATION_CERT', mig.migrationNo, {
      userId: req.authUser!.id,
      recordId: mig.id,
      previousValue: prev,
      updatedValue: mig.status,
    });
    await persistDb(db);
    res.json(mig);
  });

  // Centralized Digital Certificates (All 12 Document Types)
  app.post('/api/admin/certificates', requireAuth, requirePermission('manage_certificates'), async (req: AuthedRequest, res) => {
    const studentId = cleanStr(req.body?.studentId, 60);
    const grade = cleanStr(req.body?.grade, 40) || 'A (85%)';
    const documentType = (cleanStr(req.body?.documentType, 80) || 'Course Completion Certificate') as CertificateDocumentType;
    const replacesCertificateNo = cleanStr(req.body?.replacesCertificateNo, 60);
    const correctionNote = cleanStr(req.body?.correctionNote, 200);

    const db = await loadDb();
    const student = db.students.find((s) => s.id === studentId && !s.deletedAt);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const certificateNo = `SPEI-CERT-${new Date().getFullYear()}-${String(1001 + db.certificates.length)}`;
    const cert: CertificateRecord = {
      id: `cert-${crypto.randomUUID().slice(0, 8)}`,
      certificateNo,
      documentType,
      studentId: student.id,
      studentCode: student.studentId,
      studentName: student.fullName,
      fatherName: student.fatherName,
      courseName: cleanStr(req.body?.courseName, 160) || student.courseName,
      district: student.district,
      centreName: student.centreName,
      grade,
      issueDate: new Date().toISOString().slice(0, 10),
      status: replacesCertificateNo ? 'Corrected' : 'Issued',
      correctionNote: correctionNote || undefined,
      replacesCertificateNo: replacesCertificateNo || undefined,
      reprintHistory: [],
    };
    db.certificates.unshift(cert);
    student.certificateNo = certificateNo;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'ISSUE_CERTIFICATE', `${certificateNo} (${documentType}) -> ${student.fullName}`, {
      userId: req.authUser!.id,
      recordId: cert.id,
    });
    await persistDb(db);
    res.status(201).json(cert);
  });

  app.post('/api/admin/certificates/bulk', requireAuth, requirePermission('manage_certificates'), async (req: AuthedRequest, res) => {
    const courseId = cleanStr(req.body?.courseId, 60);
    const documentType = (cleanStr(req.body?.documentType, 80) || 'Course Completion Certificate') as CertificateDocumentType;
    const grade = cleanStr(req.body?.grade, 40) || 'Completed Successfully';
    const db = await loadDb();
    const targets = db.students.filter((s) => !s.deletedAt && (!courseId || s.courseId === courseId));
    const issued: CertificateRecord[] = [];
    for (const stu of targets) {
      const certificateNo = `SPEI-CERT-${new Date().getFullYear()}-${String(1001 + db.certificates.length)}`;
      const cert: CertificateRecord = {
        id: `cert-${crypto.randomUUID().slice(0, 8)}`,
        certificateNo,
        documentType,
        studentId: stu.id,
        studentCode: stu.studentId,
        studentName: stu.fullName,
        fatherName: stu.fatherName,
        courseName: stu.courseName,
        district: stu.district,
        centreName: stu.centreName,
        grade,
        issueDate: new Date().toISOString().slice(0, 10),
        status: 'Issued',
        reprintHistory: [],
      };
      db.certificates.unshift(cert);
      stu.certificateNo = certificateNo;
      issued.push(cert);
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'BULK_ISSUE_CERTIFICATES', `${issued.length} (${documentType})`, {
      userId: req.authUser!.id,
    });
    await persistDb(db);
    res.status(201).json({ count: issued.length, certificates: issued });
  });

  app.patch('/api/admin/certificates/:id', requireAuth, requirePermission('manage_certificates'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const cert = db.certificates.find((c) => c.id === req.params.id && !c.deletedAt);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found.' });
      return;
    }
    const prev = cert.status;
    cert.status = (cleanStr(req.body?.status, 20) || 'Issued') as CertificateRecord['status'];
    if (req.body?.correctionNote) cert.correctionNote = cleanStr(req.body.correctionNote, 200);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_CERTIFICATE', cert.certificateNo, {
      userId: req.authUser!.id,
      recordId: cert.id,
      previousValue: prev,
      updatedValue: cert.status,
    });
    await persistDb(db);
    res.json(cert);
  });

  app.post('/api/certificates/:id/reprint', requireAuth, async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const cert = db.certificates.find((c) => c.id === req.params.id && !c.deletedAt);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found.' });
      return;
    }
    const entry = {
      actorName: req.authUser!.name,
      reason: cleanStr(req.body?.reason, 160) || 'PDF Download / Reprint',
      timestamp: new Date().toISOString(),
    };
    cert.reprintHistory.unshift(entry);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'REPRINT_CERTIFICATE', cert.certificateNo, {
      userId: req.authUser!.id,
      recordId: cert.id,
    });
    await persistDb(db);
    res.json(cert);
  });

  // Centres & Franchises
  app.patch('/api/admin/centres/:id', requireAuth, requirePermission('manage_franchises'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const centre = db.centres.find((c) => c.id === req.params.id && !c.deletedAt);
    if (!centre) {
      res.status(404).json({ error: 'Centre not found.' });
      return;
    }
    const prev = centre.status;
    if (req.body?.status) centre.status = cleanStr(req.body.status, 30) as Centre['status'];
    if (req.body?.commissionRate !== undefined) {
      centre.commissionRate = Math.max(0, Math.min(50, cleanNum(req.body.commissionRate, 20)));
    }
    if (centre.status === 'Active') {
      const existingPartner = db.users.find((u) => u.centreId === centre.id && u.role === 'franchise');
      if (!existingPartner) {
        db.users.push({
          id: `usr-${crypto.randomUUID().slice(0, 8)}`,
          name: centre.applicantName,
          email: centre.email,
          phone: centre.mobile,
          role: 'franchise',
          district: centre.district,
          centreId: centre.id,
          status: 'Active',
          passwordHash: hashPassword(crypto.randomBytes(18).toString('hex')),
          createdAt: new Date().toISOString(),
        });
      }
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_FRANCHISE', centre.code, {
      userId: req.authUser!.id,
      recordId: centre.id,
      previousValue: prev,
      updatedValue: centre.status,
    });
    await persistDb(db);
    res.json(centre);
  });

  // Users & Role Governance
  app.post('/api/admin/users', requireAuth, requirePermission('manage_users_roles'), async (req: AuthedRequest, res) => {
    const name = cleanStr(req.body?.name, 120);
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const phone = cleanStr(req.body?.phone, 20);
    const role = cleanStr(req.body?.role, 40) as UserRole;
    const district = cleanStr(req.body?.district, 60) || 'Dhubri';
    const password = cleanStr(req.body?.password, 128);
    if (!name || !email || !role) {
      res.status(400).json({ error: 'Name, email, and role are required.' });
      return;
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    if (role === 'super_admin' && req.authUser!.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can create Super Admin accounts.' });
      return;
    }
    const db = await loadDb();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }
    const user: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name,
      email,
      phone: phone || '+91-94350-00000',
      role,
      district,
      centreId: db.centres.find((c) => c.district === district)?.id || 'ctr-dhubri-hq',
      status: 'Active',
      twoFactorEnabled: ['super_admin', 'admin', 'exam_controller'].includes(role),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.unshift(user);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'CREATE_USER', `${email} (${role})`, {
      userId: req.authUser!.id,
      recordId: user.id,
    });
    await persistDb(db);
    res.status(201).json(sanitizeUser(user));
  });

  app.patch('/api/admin/users/:id', requireAuth, requirePermission('manage_users_roles'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const user = db.users.find((u) => u.id === req.params.id && !u.deletedAt);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if ((user.isPrimarySuperAdmin || user.role === 'super_admin') && req.authUser!.role !== 'super_admin') {
      addAuditLog(db, req.authUser!.name, req.authUser!.role, 'BLOCKED_SUPER_ADMIN_EDIT', user.id, {
        userId: req.authUser!.id,
        recordId: user.id,
        ip: req.ip,
      });
      await notifyPrimarySuperAdmin(
        db,
        'Blocked Unauthorized Super Admin Modification',
        'Critical',
        `User ${req.authUser!.email} (${req.authUser!.role}) attempted to modify Super Admin account.`,
        req.ip
      );
      await persistDb(db);
      res.status(403).json({ error: 'Only verified Super Admin can manage Super Admin accounts.' });
      return;
    }
    if (user.isPrimarySuperAdmin) {
      if ((req.body?.status && req.body.status !== 'Active') || (req.body?.role && req.body.role !== 'super_admin')) {
        res.status(403).json({
          error: 'Primary Super Administrator account is immutable against suspension, deletion, or role demotion.',
        });
        return;
      }
    }
    const prev = `${user.role}/${user.status}`;
    if (req.body?.status && !user.isPrimarySuperAdmin) {
      user.status = cleanStr(req.body.status, 30) as StoredUser['status'];
    }
    if (req.body?.role && !user.isPrimarySuperAdmin) {
      const nextRole = cleanStr(req.body.role, 40) as UserRole;
      if (nextRole === 'super_admin' && req.authUser!.role !== 'super_admin') {
        res.status(403).json({ error: 'Only Super Admin can assign Super Admin role.' });
        return;
      }
      user.role = nextRole;
    }
    if (req.body?.unlock) {
      user.failedAttempts = 0;
      user.lockedUntil = undefined;
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_USER', user.isPrimarySuperAdmin ? maskEmail(user.email) : user.email, {
      userId: req.authUser!.id,
      recordId: user.id,
      previousValue: prev,
      updatedValue: `${user.role}/${user.status}`,
    });
    await persistDb(db);
    res.json(sanitizeUser(user));
  });

  // Gallery & Enquiries & Tasks
  app.post('/api/admin/gallery', requireAuth, requirePermission('manage_notices_gallery'), async (req: AuthedRequest, res) => {
    const title = cleanStr(req.body?.title, 160);
    const category = (cleanStr(req.body?.category, 40) || 'Photo') as GalleryItem['category'];
    const caption = cleanStr(req.body?.caption, 300);
    if (!title) {
      res.status(400).json({ error: 'Gallery title is required.' });
      return;
    }
    const uploaded = await saveSafeUpload(req.body?.mediaDataUrl, 'gallery');
    const mediaUrl = uploaded || '/src/assets/images/about_seminar_hall_1795532446180.jpg';
    const db = await loadDb();
    const item: GalleryItem = {
      id: `gal-${crypto.randomUUID().slice(0, 8)}`,
      title,
      category,
      mediaUrl,
      caption: caption || title,
      date: new Date().toISOString().slice(0, 10),
    };
    db.gallery.unshift(item);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'ADD_GALLERY_ITEM', title, {
      userId: req.authUser!.id,
      recordId: item.id,
    });
    await persistDb(db);
    res.status(201).json(item);
  });

  app.delete('/api/admin/gallery/:id', requireAuth, requirePermission('manage_notices_gallery'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    db.gallery = db.gallery.filter((g) => g.id !== req.params.id);
    await persistDb(db);
    res.json({ ok: true });
  });

  app.patch('/api/admin/enquiries/:id', requireAuth, requirePermission('manage_students'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const enq = db.enquiries.find((e) => e.id === req.params.id);
    if (!enq) {
      res.status(404).json({ error: 'Enquiry not found.' });
      return;
    }
    enq.status = cleanStr(req.body?.status, 30) as 'New' | 'In Progress' | 'Resolved';
    await persistDb(db);
    res.json(enq);
  });

  app.post('/api/admin/tasks', requireAuth, requirePermission('manage_users_roles'), async (req: AuthedRequest, res) => {
    const title = cleanStr(req.body?.title, 200);
    const assignedTo = cleanStr(req.body?.assignedTo, 60);
    const dueDate = cleanStr(req.body?.dueDate, 20) || '2026-12-05';
    const priority = (cleanStr(req.body?.priority, 20) || 'Medium') as 'Low' | 'Medium' | 'High';
    if (!title) {
      res.status(400).json({ error: 'Task title is required.' });
      return;
    }
    const db = await loadDb();
    const assignee = db.users.find((u) => u.id === assignedTo) || db.users.find((u) => u.role === 'staff');
    const task = {
      id: `tsk-${crypto.randomUUID().slice(0, 8)}`,
      title,
      assignedTo: assignee?.id || 'usr-staff-demo',
      assignedToName: assignee?.name || 'Office Staff',
      district: assignee?.district || 'Dhubri',
      priority,
      dueDate,
      status: 'Pending' as const,
    };
    db.staffTasks.unshift(task);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'ASSIGN_TASK', title, {
      userId: req.authUser!.id,
      recordId: task.id,
    });
    await persistDb(db);
    res.status(201).json(task);
  });

  // CMS, Branding, Templates, WhatsApp & Version Restore
  app.post('/api/admin/upload-asset', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    try {
      const prefix = cleanStr(req.body?.prefix, 30).replace(/[^a-zA-Z0-9_-]/g, '') || 'asset';
      const url = await saveSafeUpload(req.body?.dataUrl, prefix);
      if (!url) {
        res.status(400).json({ error: 'Valid base64 image file required.' });
        return;
      }
      res.status(201).json({ url });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Asset upload failed.' });
    }
  });

  app.patch('/api/admin/settings', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const incoming = req.body || {};
    const s = db.cmsSettings;

    // Save snapshot version prior to update
    db.cmsVersions.unshift({
      id: `cmsv-${crypto.randomUUID().slice(0, 8)}`,
      version: db.cmsVersions.length + 1,
      savedBy: req.authUser!.name,
      note: cleanStr(incoming.versionNote, 120) || 'CMS update',
      timestamp: new Date().toISOString(),
      cmsSettings: JSON.parse(JSON.stringify(db.cmsSettings)),
      branding: JSON.parse(JSON.stringify(db.branding)),
    });
    if (db.cmsVersions.length > 25) db.cmsVersions = db.cmsVersions.slice(0, 25);

    const strFields: (keyof typeof s)[] = [
      'instituteName', 'tagline', 'announcementText', 'heroTitle', 'heroSubtitle',
      'aboutSummary', 'visionText', 'missionText', 'admissionInfoText',
      'headOfficeAddress', 'contactPhone', 'secondaryPhone', 'whatsappNumber',
      'officialEmail', 'officeHours', 'directorName', 'directorMessage',
      'footerText', 'legalDisclaimer', 'privacyPolicyText', 'termsText',
      'admissionsOpenBatch', 'primaryColor', 'accentColor', 'seoTitle',
      'seoDescription', 'seoKeywords', 'studentIdPrefix', 'studentIdFormat',
    ];
    const legalFields = new Set(['legalDisclaimer', 'privacyPolicyText', 'termsText']);
    for (const k of strFields) {
      if (typeof incoming[k] === 'string' && incoming[k].trim()) {
        if (legalFields.has(k) && !hasPermission(db, req.authUser!, 'manage_legal_compliance')) {
          continue;
        }
        (s as unknown as Record<string, unknown>)[k] = cleanStr(incoming[k], 2500);
      }
    }
    if (incoming.fontPreset && ['Plus Jakarta Sans', 'Outfit', 'Manrope'].includes(incoming.fontPreset)) {
      s.fontPreset = incoming.fontPreset;
    }
    if (incoming.socialLinks && typeof incoming.socialLinks === 'object') {
      s.socialLinks = {
        facebook: cleanStr(incoming.socialLinks.facebook, 200),
        youtube: cleanStr(incoming.socialLinks.youtube, 200),
        instagram: cleanStr(incoming.socialLinks.instagram, 200),
        x: cleanStr(incoming.socialLinks.x, 200),
      };
    }
    if (incoming.navMenus && typeof incoming.navMenus === 'object') {
      s.navMenus = {
        courses: cleanStr(incoming.navMenus.courses, 40) || s.navMenus.courses,
        admissions: cleanStr(incoming.navMenus.admissions, 40) || s.navMenus.admissions,
        centres: cleanStr(incoming.navMenus.centres, 40) || s.navMenus.centres,
        notices: cleanStr(incoming.navMenus.notices, 40) || s.navMenus.notices,
        portals: cleanStr(incoming.navMenus.portals, 40) || s.navMenus.portals,
      };
    }
    if (Array.isArray(incoming.testimonials)) {
      s.testimonials = incoming.testimonials.slice(0, 12);
    }
    if (incoming.sessionTimeoutMinutes !== undefined) {
      const nextTimeout = Math.max(2, Math.min(120, cleanNum(incoming.sessionTimeoutMinutes, 10)));
      if (nextTimeout !== s.sessionTimeoutMinutes && req.authUser!.role !== 'super_admin') {
        res.status(403).json({ error: 'Only Super Admin can change security session timeout settings.' });
        return;
      }
      s.sessionTimeoutMinutes = nextTimeout;
    }

    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_CMS_SETTINGS', 'Website CMS & Settings', {
      userId: req.authUser!.id,
      recordId: 'cmsSettings',
    });
    await persistDb(db);
    res.json({ cmsSettings: s, cmsVersions: db.cmsVersions });
  });

  app.post('/api/admin/cms/restore/:versionId', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const ver = db.cmsVersions.find((v) => v.id === req.params.versionId);
    if (!ver) {
      res.status(404).json({ error: 'CMS version snapshot not found.' });
      return;
    }
    db.cmsSettings = JSON.parse(JSON.stringify(ver.cmsSettings));
    db.branding = JSON.parse(JSON.stringify(ver.branding));
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'RESTORE_CMS_VERSION', `Version #${ver.version}`, {
      userId: req.authUser!.id,
      recordId: ver.id,
    });
    await persistDb(db);
    res.json({ cmsSettings: db.cmsSettings, branding: db.branding });
  });

  app.patch('/api/admin/branding', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const b = db.branding;
    const keys: (keyof BrandingConfig)[] = [
      'websiteLogoUrl', 'transparentLogoUrl', 'faviconUrl', 'websiteBannerUrl',
      'loginLogoUrl', 'studentDashboardLogoUrl', 'certificateLogoUrl',
      'idCardLogoUrl', 'admitCardLogoUrl', 'marksheetLogoUrl',
      'officialSealUrl', 'authorizedSignatureUrl', 'signatoryTitle',
    ];
    for (const k of keys) {
      if (typeof req.body?.[k] === 'string' && req.body[k].trim()) {
        b[k] = cleanStr(req.body[k], 25000);
      }
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_BRANDING_LOGOS', 'Logos, Seal & Signature', {
      userId: req.authUser!.id,
      recordId: 'branding',
    });
    await persistDb(db);
    res.json(b);
  });

  app.put('/api/admin/templates/:id', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const tpl = db.documentTemplates.find((t) => t.id === req.params.id);
    if (!tpl) {
      res.status(404).json({ error: 'Template not found.' });
      return;
    }
    const b = req.body as Partial<DocumentTemplateConfig>;
    if (b.primaryColor) tpl.primaryColor = cleanStr(b.primaryColor, 20);
    if (b.accentColor) tpl.accentColor = cleanStr(b.accentColor, 20);
    if (b.borderStyle && ['double', 'solid', 'classic'].includes(b.borderStyle)) tpl.borderStyle = b.borderStyle;
    if (b.orientation && ['portrait', 'landscape'].includes(b.orientation)) tpl.orientation = b.orientation;
    if (typeof b.showLogo === 'boolean') tpl.showLogo = b.showLogo;
    if (typeof b.showSeal === 'boolean') tpl.showSeal = b.showSeal;
    if (typeof b.showSignature === 'boolean') tpl.showSignature = b.showSignature;
    if (typeof b.showQr === 'boolean') tpl.showQr = b.showQr;
    if (typeof b.headerNote === 'string') tpl.headerNote = cleanStr(b.headerNote, 200);
    if (typeof b.footerNote === 'string') tpl.footerNote = cleanStr(b.footerNote, 240);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_DOC_TEMPLATE', tpl.label, {
      userId: req.authUser!.id,
      recordId: tpl.id,
    });
    await persistDb(db);
    res.json(tpl);
  });

  app.patch('/api/admin/whatsapp', requireAuth, requirePermission('manage_cms_branding'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const w = db.whatsappSettings;
    if (typeof req.body?.enabled === 'boolean') w.enabled = req.body.enabled;
    if (typeof req.body?.popupEnabled === 'boolean') w.popupEnabled = req.body.popupEnabled;
    if (req.body?.popupDelaySeconds !== undefined) {
      w.popupDelaySeconds = Math.max(5, Math.min(120, cleanNum(req.body.popupDelaySeconds, 12)));
    }
    const sKeys = [
      'number', 'welcomeHeading', 'popupText', 'workingHoursNote',
      'admissionMessage', 'courseMessage', 'franchiseMessage', 'supportMessage',
    ] as const;
    for (const k of sKeys) {
      if (typeof req.body?.[k] === 'string') {
        w[k] = cleanStr(req.body[k], 300);
      }
    }
    db.cmsSettings.whatsappNumber = w.number;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_WHATSAPP_SETTINGS', w.number, {
      userId: req.authUser!.id,
      recordId: 'whatsappSettings',
    });
    await persistDb(db);
    res.json(w);
  });

  // Super Admin Security, Sessions, Permissions, Backups & Soft-Delete Protection
  app.delete('/api/admin/sessions/:id', requireAuth, requirePermission('manage_security_sessions'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const s = db.sessions.find((x) => x.id === req.params.id);
    if (!s) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (s.role === 'super_admin' && req.authUser!.role !== 'super_admin') {
      await notifyPrimarySuperAdmin(
        db,
        'Blocked Super Admin Session Termination',
        'Warning',
        `User ${req.authUser!.email} attempted to revoke Super Admin session ${s.id}.`,
        req.ip
      );
      await persistDb(db);
      res.status(403).json({ error: 'Only Super Admin can terminate a Super Admin session.' });
      return;
    }
    s.revoked = true;
    s.revokedReason = `Terminated by ${req.authUser!.name}`;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'TERMINATE_USER_SESSION', `${s.userName} (${s.id})`, {
      userId: req.authUser!.id,
      recordId: s.id,
    });
    await persistDb(db);
    res.json({ ok: true });
  });

  app.post('/api/admin/sessions/terminate-all', requireAuth, requirePermission('manage_security_sessions'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    let terminated = 0;
    for (const s of db.sessions) {
      if (!s.revoked && s.id !== req.authSession!.id) {
        if (s.role === 'super_admin' && req.authUser!.role !== 'super_admin') continue;
        s.revoked = true;
        s.revokedReason = `Global session reset by ${req.authUser!.name}`;
        terminated += 1;
      }
    }
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'TERMINATE_ALL_SESSIONS', `${terminated} active sessions closed`, {
      userId: req.authUser!.id,
    });
    await notifyPrimarySuperAdmin(
      db,
      'Global Session Reset Executed',
      'Info',
      `${req.authUser!.name} terminated ${terminated} active sessions across devices.`,
      req.ip
    );
    await persistDb(db);
    res.json({ ok: true, terminated });
  });

  app.put('/api/admin/permissions', requireAuth, requireRole('super_admin'), async (req: AuthedRequest, res) => {
    const role = cleanStr(req.body?.role, 40) as UserRole;
    const permissions = Array.isArray(req.body?.permissions) ? (req.body.permissions as PermissionKey[]) : [];
    if (!role || role === 'super_admin') {
      res.status(400).json({ error: 'Specify a modifiable non-super_admin role.' });
      return;
    }
    const db = await loadDb();
    db.rolePermissions[role] = permissions;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'UPDATE_ROLE_PERMISSIONS', `${role} -> ${permissions.length} permissions`, {
      userId: req.authUser!.id,
      recordId: role,
    });
    await notifyPrimarySuperAdmin(
      db,
      'RBAC Role Permissions Updated',
      'Info',
      `Permissions updated for role "${role}" (${permissions.length} permissions enabled).`,
      req.ip
    );
    await persistDb(db);
    res.json(db.rolePermissions);
  });

  app.post('/api/admin/backups', requireAuth, requirePermission('manage_backups'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const record = await createEncryptedBackup(db, req.authUser!.name);
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'CREATE_ENCRYPTED_BACKUP', record.filename, {
      userId: req.authUser!.id,
      recordId: record.id,
    });
    await persistDb(db);
    res.status(201).json(record);
  });

  app.post('/api/admin/backups/:id/restore', requireAuth, requireRole('super_admin'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const restored = await restoreEncryptedBackup(db, req.params.id);
    addAuditLog(restored, req.authUser!.name, req.authUser!.role, 'RESTORE_ENCRYPTED_BACKUP', req.params.id, {
      userId: req.authUser!.id,
      recordId: req.params.id,
    });
    await notifyPrimarySuperAdmin(
      restored,
      'Encrypted Database Snapshot Restored',
      'Warning',
      `Database backup ${req.params.id} was restored by Super Admin.`,
      req.ip
    );
    await persistDb(restored);
    res.json({ ok: true, message: 'Database snapshot restored securely from AES-256-GCM backup.' });
  });

  app.get('/api/admin/backup', requireAuth, requirePermission('manage_backups'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const safeBackup = {
      ...db,
      users: db.users.map(sanitizeUser),
      sessions: [],
      otpChallenges: [],
      activationChallenges: [],
      twoFactorChallenges: [],
      exportedAt: new Date().toISOString(),
    };
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'EXPORT_JSON_BACKUP', 'Sanitized JSON Export', {
      userId: req.authUser!.id,
    });
    await persistDb(db);
    res.json(safeBackup);
  });

  // Soft Deletion & Recovery (No accidental hard delete; permanent delete restricted to Super Admin)
  app.post('/api/admin/records/:type/:id/soft-delete', requireAuth, requirePermission('manage_students'), async (req: AuthedRequest, res) => {
    const { type, id } = req.params;
    const db = await loadDb();
    const now = new Date().toISOString();
    const map: Record<string, { id: string; deletedAt?: string }[] | undefined> = {
      courses: db.courses,
      students: db.students,
      applications: db.applications,
      certificates: db.certificates,
      marksheets: db.marksheets,
    };
    const arr = map[type];
    const item = arr?.find((x) => x.id === id);
    if (!item) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }
    item.deletedAt = now;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'SOFT_DELETE_RECORD', `${type}/${id}`, {
      userId: req.authUser!.id,
      recordId: id,
    });
    await persistDb(db);
    res.json({ ok: true });
  });

  app.delete('/api/admin/courses/:id', requireAuth, requirePermission('manage_courses'), async (req: AuthedRequest, res) => {
    const db = await loadDb();
    const c = db.courses.find((x) => x.id === req.params.id);
    if (c) {
      c.deletedAt = new Date().toISOString();
      addAuditLog(db, req.authUser!.name, req.authUser!.role, 'SOFT_DELETE_COURSE', c.name, {
        userId: req.authUser!.id,
        recordId: c.id,
      });
      await persistDb(db);
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/records/:type/:id/restore', requireAuth, requirePermission('manage_backups'), async (req: AuthedRequest, res) => {
    const { type, id } = req.params;
    const db = await loadDb();
    const map: Record<string, { id: string; deletedAt?: string }[] | undefined> = {
      courses: db.courses,
      students: db.students,
      applications: db.applications,
      certificates: db.certificates,
      marksheets: db.marksheets,
    };
    const item = map[type]?.find((x) => x.id === id);
    if (!item) {
      res.status(404).json({ error: 'Deleted record not found.' });
      return;
    }
    delete item.deletedAt;
    addAuditLog(db, req.authUser!.name, req.authUser!.role, 'RESTORE_DELETED_RECORD', `${type}/${id}`, {
      userId: req.authUser!.id,
      recordId: id,
    });
    await persistDb(db);
    res.json({ ok: true });
  });

  app.delete('/api/admin/records/:type/:id/permanent', requireAuth, requireRole('super_admin'), async (req: AuthedRequest, res) => {
    const { type, id } = req.params;
    const db = await loadDb();
    if (type === 'courses') db.courses = db.courses.filter((x) => x.id !== id);
    else if (type === 'students') db.students = db.students.filter((x) => x.id !== id);
    else if (type === 'applications') db.applications = db.applications.filter((x) => x.id !== id);
    else if (type === 'certificates') db.certificates = db.certificates.filter((x) => x.id !== id);
    else if (type === 'marksheets') db.marksheets = db.marksheets.filter((x) => x.id !== id);
    else {
      res.status(400).json({ error: 'Unsupported record type.' });
      return;
    }
    addAuditLog(db, req.authUser!.name, 'super_admin', 'PERMANENT_DELETE_RECORD', `${type}/${id}`, {
      userId: req.authUser!.id,
      recordId: id,
    });
    await persistDb(db);
    res.json({ ok: true });
  });

  // Frontend Vite middleware (dev) or static dist serving (prod)
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Success Point Educational Institute server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
