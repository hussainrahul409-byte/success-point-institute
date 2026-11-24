import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AdmitCardRecord,
  ApplicationRecord,
  AssignmentRecord,
  AttendanceRecord,
  AuditLog,
  BackupRecord,
  BlogArticle,
  BrandingConfig,
  Centre,
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
  SupportTicket,
  UserAccount,
  UserRole,
  WhatsAppSettings,
} from '../src/types/institute.ts';

export interface StoredUser extends UserAccount {
  passwordHash: string;
  totpSecret?: string;
  pendingTotpSecret?: string;
}

export interface OtpChallenge {
  id: string;
  email: string;
  otpHash: string;
  expiresAt: string;
  used: boolean;
}

export interface ActivationChallenge {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface TwoFactorChallenge {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export function getPrimarySuperAdminEmail(): string {
  return (process.env.SUPER_ADMIN_EMAIL || 'hussainrahul409@gmail.com').trim().toLowerCase();
}

export interface DatabaseState {
  adminClaimed: boolean;
  lastStudentSeq: number;
  cmsSettings: CmsSettings;
  branding: BrandingConfig;
  documentTemplates: DocumentTemplateConfig[];
  whatsappSettings: WhatsAppSettings;
  cmsVersions: CmsVersion[];
  backups: BackupRecord[];
  rolePermissions: Record<UserRole, PermissionKey[]>;
  sessions: SessionRecord[];
  loginAttempts: LoginAttemptRecord[];
  otpChallenges: OtpChallenge[];
  activationChallenges: ActivationChallenge[];
  twoFactorChallenges: TwoFactorChallenge[];
  securityAlerts: SecurityAlert[];
  studentIdHistory: StudentIdHistoryItem[];
  courses: Course[];
  centres: Centre[];
  users: StoredUser[];
  applications: ApplicationRecord[];
  students: StudentProfile[];
  admitCards: AdmitCardRecord[];
  marksheets: MarksheetRecord[];
  migrations: MigrationRecord[];
  attendance: AttendanceRecord[];
  studyMaterials: StudyMaterial[];
  onlineClasses: OnlineClassSession[];
  assignments: AssignmentRecord[];
  exams: ExamDefinition[];
  examResults: ExamResult[];
  payments: PaymentRecord[];
  certificates: CertificateRecord[];
  certificateRequests: CertificateRequest[];
  notifications: NotificationItem[];
  gallery: GalleryItem[];
  enquiries: EnquiryRecord[];
  supportTickets: SupportTicket[];
  staffTasks: StaffTask[];
  blogs: BlogArticle[];
  newsletterSubscribers: string[];
  auditLogs: AuditLog[];
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return bcrypt.compareSync(password, stored);
  }
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'institute-db.json');

const BACKUP_MASTER_SECRET =
  process.env.BACKUP_SECRET ||
  process.env.SESSION_SECRET ||
  'success-point-dhubri-local-backup-key-v2';

function makeDefaultSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function createDefaultBranding(): BrandingConfig {
  const sealSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="#0B1E3D" stroke-width="3"/><circle cx="60" cy="60" r="46" fill="none" stroke="#1D4ED8" stroke-width="1.2" stroke-dasharray="3 2"/><text x="60" y="34" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="#0B1E3D">SUCCESS POINT</text><text x="60" y="63" text-anchor="middle" font-family="serif" font-size="11" font-weight="700" fill="#1D4ED8">OFFICIAL SEAL</text><text x="60" y="88" text-anchor="middle" font-family="sans-serif" font-size="7.5" font-weight="600" fill="#0B1E3D">DHUBRI • ASSAM</text></svg>`;
  const signSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 60"><path d="M15,42 C32,12 46,48 64,28 C78,12 88,44 106,24 C122,12 138,38 164,26" fill="none" stroke="#0B1E3D" stroke-width="2.4" stroke-linecap="round"/><line x1="12" y1="50" x2="168" y2="50" stroke="#94A3B8" stroke-width="1"/></svg>`;
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0B1E3D"/><path d="M32 12 L52 22 L32 32 L12 22 Z" fill="#60A5FA"/><path d="M18 27 V41 C18 46 25 50 32 50 C39 50 46 46 46 41 V27 L32 34 Z" fill="#FFFFFF"/></svg>`;

  const logoUrl = makeDefaultSvgDataUrl(logoSvg);
  return {
    websiteLogoUrl: logoUrl,
    transparentLogoUrl: logoUrl,
    faviconUrl: logoUrl,
    websiteBannerUrl: '/src/assets/images/hero_campus_dhubri_1795532445456.jpg',
    loginLogoUrl: logoUrl,
    studentDashboardLogoUrl: logoUrl,
    certificateLogoUrl: logoUrl,
    idCardLogoUrl: logoUrl,
    admitCardLogoUrl: logoUrl,
    marksheetLogoUrl: logoUrl,
    officialSealUrl: makeDefaultSvgDataUrl(sealSvg),
    authorizedSignatureUrl: makeDefaultSvgDataUrl(signSvg),
    signatoryTitle: 'Director & Controller of Examinations',
  };
}

export function createDefaultDocumentTemplates(): DocumentTemplateConfig[] {
  return [
    {
      id: 'id_card',
      label: 'Student Identity Card',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'solid',
      orientation: 'landscape',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'GTB Road, Ward No. 12, Dhubri, Assam 783301',
      footerNote: 'Non-transferable institutional identity card. Report loss to Dhubri HQ.',
    },
    {
      id: 'admit_card',
      label: 'Examination Admit Card',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'double',
      orientation: 'portrait',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'EXAMINATION CELL · DHUBRI HEAD OFFICE',
      footerNote: 'Carry printed Admit Card and Student ID Card 20 minutes before exam time.',
    },
    {
      id: 'marksheet',
      label: 'Academic Marksheet',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'double',
      orientation: 'portrait',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'STATEMENT OF MARKS · INSTITUTIONAL EVALUATION',
      footerNote: 'Verify authenticity via QR code or /verify portal.',
    },
    {
      id: 'migration_certificate',
      label: 'Migration Certificate',
      primaryColor: '#0B1E3D',
      accentColor: '#0F766E',
      borderStyle: 'classic',
      orientation: 'portrait',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'OFFICE OF THE REGISTRAR & DIRECTOR · DHUBRI',
      footerNote: 'Issued strictly within institutional transfer / facilitation scope.',
    },
    {
      id: 'course_certificate',
      label: 'Course / Skill Certificate',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'double',
      orientation: 'landscape',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'SUCCESS POINT EDUCATIONAL INSTITUTE · DHUBRI, ASSAM',
      footerNote: 'Institutional skill/training certificate. Verify authenticity at /verify.',
    },
    {
      id: 'registration_certificate',
      label: 'Registration Certificate',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'classic',
      orientation: 'portrait',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: true,
      headerNote: 'OFFICIAL ENROLLMENT & REGISTRATION RECORD',
      footerNote: 'Valid for active academic session enrollment verification.',
    },
    {
      id: 'official_letter',
      label: 'Official Notice / Transfer Letter',
      primaryColor: '#0B1E3D',
      accentColor: '#1D4ED8',
      borderStyle: 'solid',
      orientation: 'portrait',
      showLogo: true,
      showSeal: true,
      showSignature: true,
      showQr: false,
      headerNote: 'SUCCESS POINT EDUCATIONAL INSTITUTE · HEAD OFFICE',
      footerNote: 'GTB Road, Ward No. 12, Dhubri, Assam 783301 · Official Correspondence',
    },
  ];
}

export function createDefaultWhatsAppSettings(): WhatsAppSettings {
  return {
    enabled: true,
    number: '919435078301',
    popupEnabled: true,
    popupDelaySeconds: 12,
    welcomeHeading: 'Success Point Admission Desk',
    popupText: 'Need help with Admissions, DCA/PGDCA Courses, Fees, or Assam Franchise? Chat directly with our Dhubri desk.',
    workingHoursNote: 'Mon–Sat · 9:30 AM – 6:00 PM IST',
    admissionMessage: 'Hello Success Point Dhubri, I would like admission guidance for the 2026-27 session.',
    courseMessage: 'Hello Success Point, please share course syllabus and fee details.',
    franchiseMessage: 'Hello Success Point Head Office, I am interested in opening an Assam district franchise centre.',
    supportMessage: 'Hello Success Point Student Support, I need assistance with my documents/portal.',
  };
}

export function createDefaultRolePermissions(): Record<UserRole, PermissionKey[]> {
  return {
    super_admin: [
      'manage_cms_branding',
      'manage_security_sessions',
      'manage_backups',
      'manage_users_roles',
      'manage_courses',
      'manage_admissions',
      'manage_students',
      'manage_exams_marksheets',
      'manage_certificates',
      'manage_migrations',
      'manage_fees',
      'manage_franchises',
      'manage_notices_gallery',
      'manage_whatsapp',
      'manage_legal_compliance',
      'view_audit_logs',
    ],
    admin: [
      'manage_cms_branding',
      'manage_users_roles',
      'manage_courses',
      'manage_admissions',
      'manage_students',
      'manage_exams_marksheets',
      'manage_certificates',
      'manage_migrations',
      'manage_fees',
      'manage_franchises',
      'manage_notices_gallery',
      'manage_whatsapp',
      'view_audit_logs',
    ],
    exam_controller: [
      'manage_exams_marksheets',
      'manage_certificates',
      'manage_migrations',
      'manage_students',
      'manage_notices_gallery',
    ],
    office_manager: [
      'manage_admissions',
      'manage_students',
      'manage_notices_gallery',
      'manage_fees',
    ],
    admission_officer: ['manage_admissions', 'manage_students', 'manage_courses'],
    accountant: ['manage_fees', 'manage_students'],
    district_coordinator: ['manage_admissions', 'manage_students', 'manage_franchises'],
    franchise: ['manage_students', 'manage_admissions', 'manage_fees'],
    staff: ['manage_admissions', 'manage_students', 'manage_notices_gallery'],
    student: [],
  };
}

export function createDefaultCmsSettings(): CmsSettings {
  return {
    instituteName: 'Success Point Educational Institute',
    tagline: 'Academic Mentoring, Computer Education & Multi-District Skill Network',
    announcementText:
      'Admissions Open for 2026–27 Session across Dhubri HQ & 8 Active Assam District Centres · Scholarship Guidance Desk Open Fridays',
    heroTitle: 'Structured Academic Coaching & Career Skills Across Assam',
    heroSubtitle:
      'From Class 8–12 board mentoring and college semester guidance to hands-on DCA, PGDCA, Tally GST, and ADRE exam readiness—Success Point Dhubri builds measurable student outcomes.',
    aboutSummary:
      'Founded to expand structured academic support, practical computer literacy, and honest higher-education guidance across Dhubri and Western Assam.',
    visionText:
      'To make dependable academic coaching, computer skills, and career counseling accessible within every Assam district without migrating far from home.',
    missionText:
      'Deliver measurable classroom outcomes, weekly test evaluation, transparent record-keeping, and practical digital readiness for youth.',
    admissionInfoText:
      'Online applications open for School Coaching, Higher Secondary, Computer Diplomas, Tally Prime, Vocational & Competitive batches.',
    headOfficeAddress: 'GTB Road, Ward No. 12, Dhubri, Assam 783301, India',
    contactPhone: '+91-94350-78301',
    secondaryPhone: '+91-98540-78302',
    whatsappNumber: '919435078301',
    officialEmail: 'admissions@successpointdhubri.edu.in',
    officeHours: 'Monday – Saturday, 9:30 AM – 6:00 PM IST',
    directorName: 'Dr. Rafiqul Islam',
    directorMessage:
      'Founded in Dhubri with a clear mission to bridge quality academic mentoring and practical digital skills across Western and Lower Assam, Success Point Educational Institute operates on transparency, personal attention, and verifiable student outcomes. Every learner—whether preparing for board exams, computer literacy, competitive recruitment, or seeking honest guidance on recognized distance pathways—deserves ethical counsel and structured support.',
    footerText: '© 2026 Success Point Educational Institute, Dhubri, Assam.',
    legalDisclaimer:
      'Success Point Educational Institute is an independent academic coaching, computer training, vocational skill institute, and educational consultancy headquartered in Dhubri, Assam. We do not independently confer university degrees or falsely claim UGC/AICTE university status. Academic counseling and facilitation for recognized board or university programs are conducted strictly within authorized institutional boundaries.',
    privacyPolicyText:
      'Success Point Educational Institute collects student, parent, staff, and franchise partner data strictly for academic admissions, attendance tracking, assessment records, and institutional communication. Documents are stored in access-controlled server storage.',
    termsText:
      'Admission into any coaching or skill batch is subject to document verification at Dhubri HQ or the selected district centre. Institutional certificates reflect verified assessment completion within our authorized scope.',
    admissionsOpenBatch: '2026–27 Academic & Skill Session',
    primaryColor: '#0B1E3D',
    accentColor: '#1D4ED8',
    fontPreset: 'Plus Jakarta Sans',
    seoTitle: 'Success Point Educational Institute – Dhubri, Assam | Courses & Admissions',
    seoDescription:
      'Academic coaching, DCA/PGDCA computer education, Tally GST, competitive exam prep, and Assam franchise network headquartered in Dhubri.',
    seoKeywords: 'Success Point Dhubri, Computer Education Assam, PGDCA Dhubri, ADRE Coaching Assam',
    socialLinks: {
      facebook: 'https://facebook.com',
      youtube: 'https://youtube.com',
      instagram: 'https://instagram.com',
      x: 'https://x.com',
    },
    navMenus: {
      courses: 'Courses',
      admissions: 'Admissions',
      centres: 'Centres',
      notices: 'Notices',
      portals: 'Portals',
    },
    testimonials: [
      {
        id: 'tst-1',
        name: 'Aarav Prodhani',
        role: 'Sample PGDCA Learner',
        location: 'Ward No. 7, Dhubri',
        quote:
          'Before joining the PGDCA morning batch in Dhubri, I had never built a spreadsheet or database. Within 6 months of guided lab sessions, I cleared the Assam Grade III computer skill test and joined a block office.',
      },
      {
        id: 'tst-2',
        name: 'Kanak Brahma',
        role: 'Sample Parent Feedback',
        location: 'Kokrajhar District Centre',
        quote:
          'Having an authorized Success Point centre in Kokrajhar meant our daughter could complete her DCA practicals locally with weekly attendance updates and genuine faculty mentoring.',
      },
    ],
    studentIdPrefix: 'SPI',
    studentIdFormat: '{PREFIX}/{DIST}/{YEAR}/{SEQ}',
    sessionTimeoutMinutes: 10,
  };
}

export function allocateStudentIdentifiers(
  db: DatabaseState,
  district: string,
  courseCode: string
) {
  db.lastStudentSeq = (db.lastStudentSeq || 0) + 1;
  const seqStr = String(db.lastStudentSeq).padStart(5, '0');
  const shortSeq = String(db.lastStudentSeq + 100).padStart(3, '0');
  const dist3 = (district || 'DHB').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DHB';
  const year = String(new Date().getFullYear());
  const prefix = (db.cmsSettings.studentIdPrefix || 'SPI').toUpperCase();
  const format = db.cmsSettings.studentIdFormat || '{PREFIX}/{DIST}/{YEAR}/{SEQ}';
  const studentId = format
    .replace('{PREFIX}', prefix)
    .replace('{DIST}', dist3)
    .replace('{YEAR}', year)
    .replace('{SEQ}', seqStr)
    .replace('{COURSE}', courseCode || 'GEN');

  return {
    studentId,
    registrationNumber: `REG-${year}-${seqStr}`,
    admissionNumber: `ADM-${year}-${seqStr}`,
    rollNumber: `${dist3}-${year}-${shortSeq}`,
    admitCardNo: `HAL-${year}-${dist3}-${seqStr}`,
  };
}

function createInitialSeedData(): DatabaseState {
  // Unusable random hash for sample placeholder profiles; no hardcoded default passwords exist.
  const lockedSampleHash = hashPassword(crypto.randomBytes(24).toString('hex'));

  const courses: Course[] = [
    {
      id: 'crs-sch-10',
      code: 'SPEI-SCH-01',
      name: 'Class 8–10 SEBA & CBSE Foundation Coaching',
      category: 'School Education',
      description:
        'Concept-first academic support in Mathematics, Science, English, and Social Studies with weekly unit assessments and board exam readiness.',
      eligibility: 'Students enrolled in Class 8, 9, or 10 (SEBA / CBSE)',
      duration: '10 Months (Academic Session)',
      fees: 7200,
      mode: 'Offline',
      admissionRequirements: ['School ID / Previous Marksheet', '2 Passport Photos', 'Parent Consent Form'],
      syllabus: [
        'Module 1: Number Systems, Algebra & Coordinate Geometry',
        'Module 2: Physical & Life Sciences Practical Foundations',
        'Module 3: English Grammar, Comprehension & Composition',
        'Module 4: Assam History, Civics & Mock Board Series',
      ],
      careerOpportunities: [
        'Strong HSLC / Class 10 Board Performance',
        'Olympiad & NTSE Foundation Readiness',
        'Smooth Transition to Higher Secondary Streams',
      ],
      authorizationNote: 'Institutional supplementary academic coaching program.',
      featured: true,
    },
    {
      id: 'crs-hs-sci',
      code: 'SPEI-HS-02',
      name: 'Higher Secondary (Class 11–12) Science & Arts Mentoring',
      category: 'Higher Secondary Education',
      description:
        'Structured AHSEC / CBSE Class 11 & 12 guided classroom instruction with laboratory problem workshops and regular test evaluation.',
      eligibility: 'Passed HSLC / Class 10 from a recognized board',
      duration: '12 Months per Academic Year',
      fees: 11500,
      mode: 'Hybrid',
      admissionRequirements: ['HSLC / Class 10 Admit & Marksheet', '2 Passport Photos', 'Aadhaar Copy'],
      syllabus: [
        'Module 1: Core Physics, Chemistry & Mathematics / Arts Electives',
        'Module 2: Chapter-wise Numerical & Analytical Practice',
        'Module 3: AHSEC Previous 10-Year Question Bank Drills',
        'Module 4: Pre-Final Full-Length Evaluation Tests',
      ],
      careerOpportunities: [
        'Higher Secondary Board Excellence',
        'CEE / CUET / Polytechnic Entrance Readiness',
        'Undergraduate Honors Admission Preparedness',
      ],
      authorizationNote: 'Supplementary academic coaching aligned to AHSEC & CBSE syllabi.',
      featured: true,
    },
    {
      id: 'crs-col-ug',
      code: 'SPEI-COL-03',
      name: 'Undergraduate (B.A. / B.Com / B.Sc.) Semester Guidance',
      category: 'College Education',
      description:
        'NEP-aligned semester tutoring, project guidance, and internal assessment preparation for undergraduate college students across Assam.',
      eligibility: 'Enrolled in B.A., B.Com., or B.Sc. at a recognized college',
      duration: '6 Months per Semester',
      fees: 6500,
      mode: 'Hybrid',
      admissionRequirements: ['10+2 Marksheet', 'College Admission Receipt', 'Passport Photo'],
      syllabus: [
        'Module 1: Core Discipline Paper Conceptual Lectures',
        'Module 2: Ability Enhancement & Skill Paper Support',
        'Module 3: Academic Writing & Seminar Presentation Prep',
        'Module 4: University Semester Model Paper Practice',
      ],
      careerOpportunities: [
        'Improved University Semester CGPA',
        'Postgraduate Entrance Readiness',
        'Strong Foundation for State Civil & Teaching Exams',
      ],
      authorizationNote: 'Private academic tutoring & mentoring support; degrees are awarded only by the student’s enrolled university.',
      featured: false,
    },
    {
      id: 'crs-uni-fac',
      code: 'SPEI-UNI-04',
      name: 'University Program Academic Facilitation & Counseling',
      category: 'University-Level Programs',
      description:
        'Transparent admission counseling, syllabus navigation, assignment structuring, and exam readiness support for recognized university learners.',
      eligibility: '10+2 or Graduation as per respective recognized university norms',
      duration: 'Program-Specific (1–3 Years)',
      fees: 4500,
      mode: 'Hybrid',
      admissionRequirements: ['Academic Transcripts (10th, 12th / Grad)', 'Valid Govt ID', '2 Photos'],
      syllabus: [
        'Module 1: Program & Elective Selection Counseling',
        'Module 2: Study Schedule & Reference Material Mapping',
        'Module 3: Assignment Formatting & Submission Guidance',
        'Module 4: Term-End Exam Revision Workshops',
      ],
      careerOpportunities: [
        'Informed Higher Education Progression',
        'Working Professional Degree Completion Support',
        'Structured Career Pathway Planning',
      ],
      authorizationNote:
        'Success Point provides academic facilitation and counseling only; we do not grant university degrees independently.',
      featured: false,
    },
    {
      id: 'crs-cmp-dca',
      code: 'SPEI-CMP-05',
      name: 'Diploma in Computer Applications (DCA) & Office Suite',
      category: 'Computer Courses',
      description:
        'Hands-on practical training in Operating Systems, MS Office / LibreOffice, Internet & Digital Services, Database Basics, and Assamese/Hindi/English typing.',
      eligibility: 'Class 10 Passed or Equivalent',
      duration: '6 Months',
      fees: 4800,
      mode: 'Offline',
      admissionRequirements: ['Class 10 Certificate', 'Aadhaar Card', '2 Passport Photos'],
      syllabus: [
        'Module 1: Computer Fundamentals & Windows/Linux Operations',
        'Module 2: Word Processing, Advanced Excel Formulas & Presentations',
        'Module 3: Relational Database Concepts & SQL Basics',
        'Module 4: Cyber Hygiene, Digital Governance Portals & Typing Lab',
      ],
      careerOpportunities: [
        'Office Assistant & Data Entry Operator',
        'CSC / e-Governance Centre Executive',
        'Grade III & IV Computer Proficiency Qualifying',
      ],
      authorizationNote: 'Institutional vocational computer skill certificate issued upon practical evaluation.',
      featured: true,
    },
    {
      id: 'crs-cmp-pgdca',
      code: 'SPEI-CMP-06',
      name: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      category: 'Computer Courses',
      description:
        'Comprehensive 1-year applied computing curriculum covering Programming Logic, Web Design (HTML/CSS/JS), Tally Prime with GST, and SQL Database Systems.',
      eligibility: 'Graduate in any stream (or final-year student)',
      duration: '12 Months',
      fees: 9600,
      mode: 'Offline',
      admissionRequirements: ['Graduation Marksheet / Provisional', 'Govt Photo ID', '2 Photos'],
      syllabus: [
        'Module 1: Structured Programming in C & Python Essentials',
        'Module 2: Web Development (HTML5, Tailwind CSS, JavaScript)',
        'Module 3: Tally Prime with GST & Inventory Accounting',
        'Module 4: Capstone Software Project & Viva Voce',
      ],
      careerOpportunities: [
        'Junior Web & Software Support Associate',
        'Accounts & MIS Executive',
        'Computer Lab Instructor & IT Coordinator',
      ],
      authorizationNote: 'Skill training program with practical assessment and QR-verifiable institute completion certificate.',
      featured: true,
    },
    {
      id: 'crs-pro-acc',
      code: 'SPEI-PRO-07',
      name: 'Certified Accounting, Tally Prime & GST Practitioner',
      category: 'Professional Courses',
      description:
        'Industry-focused financial accounting, GST billing, TDS compliance, payroll management, and MS Excel MIS reporting for commerce and office roles.',
      eligibility: '10+2 Passed (Commerce or Any Stream)',
      duration: '4 Months',
      fees: 5500,
      mode: 'Hybrid',
      admissionRequirements: ['10+2 Marksheet', 'ID Proof', 'Passport Photo'],
      syllabus: [
        'Module 1: Principles of Accounting & Voucher Entry',
        'Module 2: Tally Prime Inventory, Banking & Reconciliation',
        'Module 3: GSTR-1, GSTR-3B Filing Simulation & TDS Basics',
        'Module 4: Payroll & Automated Excel Financial Dashboards',
      ],
      careerOpportunities: [
        'Accounts Executive in MSMEs & Retail Firms',
        'GST Billing & Compliance Operator',
        'Back-Office Finance Coordinator',
      ],
      authorizationNote: 'Professional skill training program.',
      featured: false,
    },
    {
      id: 'crs-skl-eng',
      code: 'SPEI-SKL-08',
      name: 'Spoken English, Communication & Workplace Readiness',
      category: 'Skill Development',
      description:
        'Interactive fluency building, pronunciation clinics, group discussions, resume writing, and mock interviews tailored for Assam youth.',
      eligibility: 'Class 10 Passed & Above',
      duration: '3 Months',
      fees: 3200,
      mode: 'Hybrid',
      admissionRequirements: ['Academic ID / Govt ID', '2 Passport Photos'],
      syllabus: [
        'Module 1: Functional Grammar & Daily Conversational Fluency',
        'Module 2: Public Speaking, Presentation & Listening Labs',
        'Module 3: Resume Structuring, Email Etiquette & LinkedIn Profile',
        'Module 4: HR & Technical Panel Mock Interviews',
      ],
      careerOpportunities: [
        'Customer Success & Front-Office Roles',
        'Corporate & Hospitality Placement Readiness',
        'Confident Interview Performance',
      ],
      authorizationNote: 'Institutional skill development certification.',
      featured: false,
    },
    {
      id: 'crs-voc-hw',
      code: 'SPEI-VOC-09',
      name: 'PC Hardware, Networking & CCTV Technician Training',
      category: 'Vocational Training',
      description:
        'Practical workshop course on desktop/laptop assembly, OS troubleshooting, LAN/Wi-Fi configuration, and IP CCTV installation.',
      eligibility: 'Class 10 Passed',
      duration: '4 Months',
      fees: 6200,
      mode: 'Offline',
      admissionRequirements: ['Class 10 Pass Certificate', 'Aadhaar Copy', '2 Photos'],
      syllabus: [
        'Module 1: Motherboard Diagnostics & Component Assembly',
        'Module 2: Windows/Linux Deployment & Driver Troubleshooting',
        'Module 3: Structured Cabling, Routers & IP Addressing',
        'Module 4: DVR/NVR CCTV Setup & Field Maintenance',
      ],
      careerOpportunities: [
        'IT Support & Hardware Service Technician',
        'Self-Employed Computer & CCTV Service Entrepreneur',
        'School/Office Network Maintenance Staff',
      ],
      authorizationNote: 'Hands-on vocational training module.',
      featured: false,
    },
    {
      id: 'crs-cmp-adre',
      code: 'SPEI-COMP-10',
      name: 'Assam Direct Recruitment (ADRE), SSC & Banking Foundation',
      category: 'Competitive Examination Preparation',
      description:
        'Targeted aptitude, reasoning, Assam GK, Indian Polity, and computer knowledge coaching with OMR and CBT mock test series.',
      eligibility: '10+2 / Graduate Aspirants',
      duration: '6 Months',
      fees: 6800,
      mode: 'Hybrid',
      admissionRequirements: ['10+2 / Degree Certificate', 'ID Proof', '2 Photos'],
      syllabus: [
        'Module 1: Quantitative Aptitude & Speed Mathematics',
        'Module 2: Logical & Analytical Reasoning Drills',
        'Module 3: Assam History, Geography, Economy & Current Affairs',
        'Module 4: Weekly Full-Length OMR & Online CBT Tests',
      ],
      careerOpportunities: [
        'Assam Grade III & Grade IV Recruitment Readiness',
        'SSC CHSL / CGL / MTS Preliminary Readiness',
        'State & Regional Banking Clerical Exams',
      ],
      authorizationNote: 'Competitive exam preparation coaching; selection depends on official exam boards.',
      featured: true,
    },
    {
      id: 'crs-tch-01',
      code: 'SPEI-TCH-11',
      name: 'Early Childhood Pedagogy & Classroom Instruction Orientation',
      category: 'Teacher Training',
      description:
        'Practical foundation for aspiring pre-primary and primary educators focusing on lesson planning, child psychology, and NEP 2020 activity-based learning.',
      eligibility: '10+2 Passed (Minimum 45%)',
      duration: '6 Months',
      fees: 7500,
      mode: 'Offline',
      admissionRequirements: ['10+2 Marksheet', 'Govt Photo ID', '2 Photos'],
      syllabus: [
        'Module 1: Child Development & Inclusive Classroom Practices',
        'Module 2: NEP 2020 Foundational Literacy & Numeracy (FLN)',
        'Module 3: Teaching-Learning Materials (TLM) Workshop',
        'Module 4: Supervised Practice Teaching Sessions',
      ],
      careerOpportunities: [
        'Private Play-School & Primary School Educator',
        'Academic Activity Coordinator',
        'Foundation Tutor & Remedial Instructor',
      ],
      authorizationNote: 'Non-statutory institutional orientation program; does not replace NCTE B.Ed./D.El.Ed. degrees.',
      featured: false,
    },
    {
      id: 'crs-odl-01',
      code: 'SPEI-ODL-12',
      name: 'NIOS & Recognized Open Distance Learning (ODL) Guidance',
      category: 'Distance Education Guidance',
      description:
        'Ethical counseling, subject combination advice, study schedule planning, and TMA/exam form guidance for students pursuing recognized open schooling or ODL programs.',
      eligibility: 'Class 8 / 10 / 12 Learners seeking flexible education pathways',
      duration: 'Session-Based Support',
      fees: 2800,
      mode: 'Hybrid',
      admissionRequirements: ['Previous School Transfer / Marksheet', 'Birth/Age Proof', 'Aadhaar'],
      syllabus: [
        'Module 1: Official Eligibility & Stream Verification',
        'Module 2: Subject Selection & Study Plan Calendar',
        'Module 3: Tutor Marked Assignment (TMA) Workshops',
        'Module 4: Practical & Theory Exam Preparation Clinics',
      ],
      careerOpportunities: [
        'Completion of Secondary / Senior Secondary Milestones',
        'Re-entry into Formal Higher Education',
        'Support for Working Youth & Homemakers',
      ],
      authorizationNote: 'Guidance & coaching support only; official registration and certification remain solely with the respective recognized board/university.',
      featured: false,
    },
  ];

  const centres: Centre[] = [
    {
      id: 'ctr-dhubri-hq',
      code: 'SPEI-DHB-001',
      name: 'Success Point Head Office & Main Campus, Dhubri',
      isHeadOffice: true,
      applicantName: 'Dr. Rafiqul Islam',
      organizationName: 'Success Point Educational Trust',
      mobile: '+91-94350-78301',
      email: 'dhubri.hq@successpointdhubri.edu.in',
      address: 'GTB Road, Ward No. 12, Near Raja Prabhat Chandra Barua Maidan, Dhubri, Assam 783301',
      district: 'Dhubri',
      state: 'Assam',
      proposedLocation: 'Dhubri Town Main Campus',
      infrastructureDetails: '12 Smart Classrooms, 45-PC Computer Lab, Seminar Hall, Counseling Desk & Library',
      experience: '14 Years in Academic & Skill Education',
      lat: 26.0207,
      lng: 89.9743,
      status: 'Active',
      commissionRate: 0,
      createdAt: '2016-04-10T09:00:00Z',
    },
    {
      id: 'ctr-kokrajhar',
      code: 'SPEI-KKJ-002',
      name: 'Success Point Academic & IT Centre, Kokrajhar',
      applicantName: 'Bidyut Narzary',
      organizationName: 'Bodoland Skill Foundation',
      mobile: '+91-98541-22014',
      email: 'kokrajhar@successpointdhubri.edu.in',
      address: 'JD Road, Ward No. 4, Kokrajhar, Assam 783370',
      district: 'Kokrajhar',
      state: 'Assam',
      proposedLocation: 'Kokrajhar Town',
      infrastructureDetails: '4 Classrooms, 20-PC Lab, Counseling Reception',
      experience: '7 Years in Computer Training',
      lat: 26.4014,
      lng: 90.2725,
      status: 'Active',
      commissionRate: 20,
      createdAt: '2022-01-15T10:00:00Z',
    },
    {
      id: 'ctr-bongaigaon',
      code: 'SPEI-BNG-003',
      name: 'Success Point Career & Computer Hub, Bongaigaon',
      applicantName: 'Ananya Choudhury',
      organizationName: 'Choudhury EduCare Services',
      mobile: '+91-97062-33108',
      email: 'bongaigaon@successpointdhubri.edu.in',
      address: 'Chapaguri Road, Near Paglasthan, Bongaigaon, Assam 783380',
      district: 'Bongaigaon',
      state: 'Assam',
      proposedLocation: 'Bongaigaon Central',
      infrastructureDetails: '5 Classrooms, 25-PC Lab, Career Guidance Cell',
      experience: '9 Years in Academic Coaching',
      lat: 26.4824,
      lng: 90.5582,
      status: 'Active',
      commissionRate: 20,
      createdAt: '2022-06-20T11:30:00Z',
    },
    {
      id: 'ctr-goalpara',
      code: 'SPEI-GLP-004',
      name: 'Success Point Learning Centre, Goalpara',
      applicantName: 'Tariqul Ahmed',
      organizationName: 'Brahmaputra Skill Academy',
      mobile: '+91-99543-44819',
      email: 'goalpara@successpointdhubri.edu.in',
      address: 'Bapujinagar, BOC Gate, Goalpara, Assam 783101',
      district: 'Goalpara',
      state: 'Assam',
      proposedLocation: 'Goalpara Town',
      infrastructureDetails: '4 Classrooms, 18-PC Lab',
      experience: '5 Years in Vocational Training',
      lat: 26.1641,
      lng: 90.6254,
      status: 'Active',
      commissionRate: 20,
      createdAt: '2023-03-05T09:15:00Z',
    },
    {
      id: 'ctr-barpeta',
      code: 'SPEI-BPT-005',
      name: 'Success Point Study & Tech Centre, Barpeta',
      applicantName: 'Dipankar Das',
      organizationName: 'Satra Valley Educational Society',
      mobile: '+91-94351-88902',
      email: 'barpeta@successpointdhubri.edu.in',
      address: 'College Road, Near MC College, Barpeta, Assam 781301',
      district: 'Barpeta',
      state: 'Assam',
      proposedLocation: 'Barpeta Town',
      infrastructureDetails: '6 Classrooms, 22-PC Computer Lab',
      experience: '8 Years in Competitive & School Coaching',
      lat: 26.3229,
      lng: 91.0063,
      status: 'Active',
      commissionRate: 20,
      createdAt: '2023-08-12T10:00:00Z',
    },
    {
      id: 'ctr-guwahati',
      code: 'SPEI-GHY-006',
      name: 'Success Point Regional Guidance Centre, Guwahati',
      applicantName: 'Priyanka Kalita',
      organizationName: 'Northeast Academic Partners LLP',
      mobile: '+91-98640-51234',
      email: 'guwahati@successpointdhubri.edu.in',
      address: 'GS Road, Christian Basti, Guwahati, Kamrup Metro, Assam 781005',
      district: 'Guwahati',
      state: 'Assam',
      proposedLocation: 'GS Road, Guwahati',
      infrastructureDetails: '8 Smart Rooms, 30-PC Lab, Regional Assessment Desk',
      experience: '11 Years in Higher Education Counseling',
      lat: 26.1445,
      lng: 91.7362,
      status: 'Active',
      commissionRate: 22,
      createdAt: '2024-01-20T09:00:00Z',
    },
    {
      id: 'ctr-nalbari',
      code: 'SPEI-NLB-007',
      name: 'Success Point Academic Centre, Nalbari',
      applicantName: 'Hiren Sarma',
      organizationName: 'Nalbari Pragati Kendra',
      mobile: '+91-98591-67210',
      email: 'nalbari@successpointdhubri.edu.in',
      address: 'Gopal Bazar, LN Road, Nalbari, Assam 781335',
      district: 'Nalbari',
      state: 'Assam',
      proposedLocation: 'Nalbari Central',
      infrastructureDetails: '3 Classrooms, 15-PC Lab',
      experience: '6 Years in Computer & Tuition Centre',
      lat: 26.4447,
      lng: 91.4411,
      status: 'Active',
      commissionRate: 18,
      createdAt: '2024-07-04T11:00:00Z',
    },
    {
      id: 'ctr-ssm',
      code: 'SPEI-SSM-008',
      name: 'Success Point Extension Centre, South Salmara-Mankachar',
      applicantName: 'Mizanur Rahman',
      organizationName: 'Salmara Youth Skill Initiative',
      mobile: '+91-97071-19044',
      email: 'southsalmara@successpointdhubri.edu.in',
      address: 'Hatsingimari Main Road, South Salmara-Mankachar, Assam 783135',
      district: 'South Salmara-Mankachar',
      state: 'Assam',
      proposedLocation: 'Hatsingimari',
      infrastructureDetails: '3 Classrooms, 16-PC Computer Lab, Solar Backup',
      experience: '4 Years in Community Skill Training',
      lat: 25.8623,
      lng: 89.9146,
      status: 'Active',
      commissionRate: 20,
      createdAt: '2025-02-10T09:30:00Z',
    },
    {
      id: 'ctr-kamrup-pending',
      code: 'SPEI-KMP-009',
      name: 'Rangia Skill & Guidance Centre (Proposed)',
      applicantName: 'Jitendra Nath',
      organizationName: 'Pragjyotish Learning Foundation',
      mobile: '+91-98642-77451',
      email: 'rangia.partner@example.in',
      address: 'Station Road, Rangia, Kamrup, Assam 781354',
      district: 'Kamrup',
      state: 'Assam',
      proposedLocation: 'Rangia Town, Kamrup',
      infrastructureDetails: '1,600 sq ft Ground Floor, 3 Classrooms, 15 PCs ready',
      experience: '5 Years running coaching classes',
      lat: 26.4357,
      lng: 91.6184,
      status: 'Pending',
      commissionRate: 20,
      createdAt: '2026-11-12T10:15:00Z',
    },
  ];

  const primarySuperAdminEmail = getPrimarySuperAdminEmail();

  const users: StoredUser[] = [
    {
      id: 'usr-primary-super-admin',
      name: 'Primary Super Administrator',
      email: primarySuperAdminEmail,
      phone: '+91-94350-78301',
      role: 'super_admin',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Pending',
      isPrimarySuperAdmin: true,
      emailVerified: false,
      twoFactorEnabled: true,
      passwordHash: '',
      createdAt: '2026-11-24T00:00:00Z',
    },
    {
      id: 'usr-admin-root',
      name: 'Head Office Administrator',
      email: 'admin@successpointdhubri.edu.in',
      phone: '+91-94350-78302',
      role: 'admin',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Active',
      twoFactorEnabled: true,
      passwordHash: lockedSampleHash,
      createdAt: '2016-04-10T09:00:00Z',
    },
    {
      id: 'usr-exam-ctrl',
      name: 'Prof. Anirban Goswami (Exam Controller)',
      email: 'exams@successpointdhubri.edu.in',
      phone: '+91-94350-78303',
      role: 'exam_controller',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Active',
      twoFactorEnabled: true,
      passwordHash: lockedSampleHash,
      createdAt: '2022-05-01T09:00:00Z',
    },
    {
      id: 'usr-student-demo',
      name: 'Aarav Prodhani (Sample Student)',
      email: 'student.demo@successpointdhubri.edu.in',
      phone: '+91-98540-11223',
      role: 'student',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Active',
      passwordHash: lockedSampleHash,
      createdAt: '2026-07-01T10:00:00Z',
    },
    {
      id: 'usr-staff-demo',
      name: 'Farhana Begum (Sample Office Staff)',
      email: 'staff.demo@successpointdhubri.edu.in',
      phone: '+91-94352-22110',
      role: 'staff',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Active',
      passwordHash: lockedSampleHash,
      createdAt: '2024-03-10T09:00:00Z',
    },
    {
      id: 'usr-franchise-demo',
      name: 'Bidyut Narzary (Sample Franchise Partner)',
      email: 'franchise.demo@successpointdhubri.edu.in',
      phone: '+91-98541-22014',
      role: 'franchise',
      district: 'Kokrajhar',
      centreId: 'ctr-kokrajhar',
      status: 'Active',
      passwordHash: lockedSampleHash,
      createdAt: '2022-01-15T10:00:00Z',
    },
    {
      id: 'usr-coord-demo',
      name: 'Sanjay Barman (Sample District Coordinator)',
      email: 'coordinator.demo@successpointdhubri.edu.in',
      phone: '+91-94350-55667',
      role: 'district_coordinator',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      status: 'Active',
      passwordHash: lockedSampleHash,
      createdAt: '2023-05-01T09:00:00Z',
    },
  ];

  const applications: ApplicationRecord[] = [
    {
      id: 'app-1',
      applicationId: 'SPEI-2026-1042',
      fullName: 'Aarav Prodhani',
      fatherName: 'Nagen Prodhani',
      motherName: 'Minati Prodhani',
      dob: '2005-04-18',
      gender: 'Male',
      mobile: '9854011223',
      email: 'student.demo@successpointdhubri.edu.in',
      address: 'Boro Bazar, Ward No. 7, Dhubri',
      state: 'Assam',
      district: 'Dhubri',
      pinCode: '783301',
      qualification: 'Graduate (B.A.)',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      centreId: 'ctr-dhubri-hq',
      centreName: 'Success Point Head Office & Main Campus, Dhubri',
      status: 'Approved',
      remarks: 'Documents verified at Dhubri HQ desk. Enrolled in Morning Batch A.',
      createdAt: '2026-07-01T10:15:00Z',
      updatedAt: '2026-07-03T14:20:00Z',
    },
    {
      id: 'app-2',
      applicationId: 'SPEI-2026-1089',
      fullName: 'Roshni Khatun',
      fatherName: 'Abdul Karim',
      motherName: 'Salma Khatun',
      dob: '2007-09-12',
      gender: 'Female',
      mobile: '9706543210',
      email: 'roshni.k@example.in',
      address: 'Station Road, Gauripur',
      state: 'Assam',
      district: 'Dhubri',
      pinCode: '783331',
      qualification: 'Class 12 (AHSEC)',
      courseId: 'crs-cmp-dca',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      centreId: 'ctr-dhubri-hq',
      centreName: 'Success Point Head Office & Main Campus, Dhubri',
      status: 'Pending',
      remarks: 'Awaiting original marksheet check at office desk.',
      createdAt: '2026-11-18T11:30:00Z',
      updatedAt: '2026-11-18T11:30:00Z',
    },
    {
      id: 'app-3',
      applicationId: 'SPEI-2026-1094',
      fullName: 'Mwkhwm Basumatary',
      fatherName: 'Suren Basumatary',
      motherName: 'Bimala Basumatary',
      dob: '2004-11-02',
      gender: 'Male',
      mobile: '9854177889',
      email: 'mwkhwm.b@example.in',
      address: 'Titaguri, Kokrajhar',
      state: 'Assam',
      district: 'Kokrajhar',
      pinCode: '783370',
      qualification: 'Graduate (B.Com)',
      courseId: 'crs-cmp-adre',
      courseName: 'Assam Direct Recruitment (ADRE), SSC & Banking Foundation',
      centreId: 'ctr-kokrajhar',
      centreName: 'Success Point Academic & IT Centre, Kokrajhar',
      status: 'Verified',
      remarks: 'Documents verified by Kokrajhar centre coordinator; pending final fee payment.',
      createdAt: '2026-11-20T09:45:00Z',
      updatedAt: '2026-11-21T16:10:00Z',
    },
  ];

  const students: StudentProfile[] = [
    {
      id: 'stu-1',
      userId: 'usr-student-demo',
      studentId: 'SPI/DHB/2026/00001',
      registrationNumber: 'REG-2026-00001',
      admissionNumber: 'ADM-2026-00001',
      rollNumber: 'DHB-2026-042',
      applicationId: 'SPEI-2026-1042',
      fullName: 'Aarav Prodhani',
      fatherName: 'Nagen Prodhani',
      motherName: 'Minati Prodhani',
      dob: '2005-04-18',
      mobile: '9854011223',
      email: 'student.demo@successpointdhubri.edu.in',
      address: 'Boro Bazar, Ward No. 7, Dhubri, Assam 783301',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      centreCode: 'SPEI-DHB-001',
      centreName: 'Success Point Head Office & Main Campus, Dhubri',
      courseId: 'crs-cmp-pgdca',
      courseCode: 'SPEI-CMP-06',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      academicSession: '2026–27',
      batch: 'Morning Batch 2026–27',
      registrationDate: '2026-07-03',
      feeTotal: 9600,
      feePaid: 6400,
      admitCardNo: 'HAL-2026-DHB-00001',
      certificateNo: 'SPEI-CERT-2026-1001',
      admissionStatus: 'Active',
      enrolledAt: '2026-07-03T14:20:00Z',
      isSample: true,
    },
    {
      id: 'stu-2',
      userId: 'usr-student-kkj-1',
      studentId: 'SPI/KKJ/2026/00002',
      registrationNumber: 'REG-2026-00002',
      admissionNumber: 'ADM-2026-00002',
      rollNumber: 'KKJ-2026-019',
      applicationId: 'SPEI-2026-1019',
      fullName: 'Mousumi Brahma',
      fatherName: 'Kanak Brahma',
      motherName: 'Renu Brahma',
      dob: '2006-02-24',
      mobile: '9854199001',
      email: 'mousumi.b@example.in',
      address: 'JD Road, Kokrajhar, Assam 783370',
      district: 'Kokrajhar',
      centreId: 'ctr-kokrajhar',
      centreCode: 'SPEI-KKJ-002',
      centreName: 'Success Point Academic & IT Centre, Kokrajhar',
      courseId: 'crs-cmp-dca',
      courseCode: 'SPEI-CMP-05',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      academicSession: '2026–27',
      batch: 'Afternoon Batch 2026',
      registrationDate: '2026-08-01',
      feeTotal: 4800,
      feePaid: 4800,
      admitCardNo: 'HAL-2026-KKJ-00002',
      certificateNo: 'SPEI-CERT-2026-1002',
      admissionStatus: 'Active',
      enrolledAt: '2026-08-01T10:00:00Z',
      isSample: true,
    },
  ];

  const admitCards: AdmitCardRecord[] = [
    {
      id: 'adm-1',
      admitCardNo: 'HAL-2026-DHB-00001',
      studentDbId: 'stu-1',
      studentId: 'SPI/DHB/2026/00001',
      registrationNumber: 'REG-2026-00001',
      studentName: 'Aarav Prodhani',
      fatherName: 'Nagen Prodhani',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      courseCode: 'SPEI-CMP-06',
      examName: 'PGDCA Semester-I Theory & Practical Evaluation',
      examSession: 'December 2026',
      examCentre: 'Success Point Head Office & Main Campus, Dhubri',
      examDate: '2026-12-10',
      examTiming: '10:00 AM – 01:00 PM IST',
      subjects: [
        'PGDCA-101: Computing & Python Programming',
        'PGDCA-102: Web Design (HTML5/CSS/JS)',
        'PGDCA-103: Tally Prime with GST',
        'PGDCA-104: SQL & Practical Lab Viva',
      ],
      status: 'Approved',
      approvedBy: 'Prof. Anirban Goswami',
      publishedAt: '2026-11-18T10:00:00Z',
      createdAt: '2026-11-18T09:30:00Z',
      isSample: true,
    },
  ];

  const marksheets: MarksheetRecord[] = [
    {
      id: 'mks-1',
      marksheetNo: 'MKS-2026-DHB-00001',
      studentDbId: 'stu-1',
      studentId: 'SPI/DHB/2026/00001',
      registrationNumber: 'REG-2026-00001',
      studentName: 'Aarav Prodhani',
      fatherName: 'Nagen Prodhani',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      courseCode: 'SPEI-CMP-06',
      examName: 'PGDCA Term-I Institutional Assessment',
      academicSession: '2026–27',
      subjects: [
        { subjectCode: 'PGDCA-101', subjectName: 'Python & C Programming Logic', maxMarks: 100, passingMarks: 40, obtainedMarks: 88 },
        { subjectCode: 'PGDCA-102', subjectName: 'Web Design & Frontend Lab', maxMarks: 100, passingMarks: 40, obtainedMarks: 91 },
        { subjectCode: 'PGDCA-103', subjectName: 'Tally Prime with GST Accounting', maxMarks: 100, passingMarks: 40, obtainedMarks: 85 },
        { subjectCode: 'PGDCA-104', subjectName: 'SQL Database & Viva Voce', maxMarks: 100, passingMarks: 40, obtainedMarks: 88 },
      ],
      totalMaxMarks: 400,
      totalObtainedMarks: 352,
      percentage: 88,
      grade: 'A+',
      resultStatus: 'Pass',
      status: 'Published',
      approvedBy: 'Prof. Anirban Goswami',
      issueDate: '2026-11-01',
      versionHistory: [
        {
          version: 1,
          subjects: [
            { subjectCode: 'PGDCA-101', subjectName: 'Python & C Programming Logic', maxMarks: 100, passingMarks: 40, obtainedMarks: 88 },
            { subjectCode: 'PGDCA-102', subjectName: 'Web Design & Frontend Lab', maxMarks: 100, passingMarks: 40, obtainedMarks: 91 },
            { subjectCode: 'PGDCA-103', subjectName: 'Tally Prime with GST Accounting', maxMarks: 100, passingMarks: 40, obtainedMarks: 85 },
            { subjectCode: 'PGDCA-104', subjectName: 'SQL Database & Viva Voce', maxMarks: 100, passingMarks: 40, obtainedMarks: 88 },
          ],
          totalMaxMarks: 400,
          totalObtainedMarks: 352,
          percentage: 88,
          grade: 'A+',
          resultStatus: 'Pass',
          editedBy: 'Prof. Anirban Goswami',
          reason: 'Initial verified result publication',
          timestamp: '2026-11-01T12:00:00Z',
        },
      ],
      isSample: true,
    },
  ];

  const migrations: MigrationRecord[] = [
    {
      id: 'mig-1',
      migrationNo: 'MIG-2026-DHB-0001',
      studentDbId: 'stu-2',
      studentId: 'SPI/KKJ/2026/00002',
      registrationNumber: 'REG-2026-00002',
      studentName: 'Mousumi Brahma',
      fatherName: 'Kanak Brahma',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      academicSession: '2026–27',
      lastExamDetails: 'DCA Final Practical & Theory (Grade A, 84%)',
      targetInstitution: 'Bodoland Skill Higher Track / Regional Centre',
      reason: 'Course completion institutional transfer verification',
      documentVerified: true,
      feeVerified: true,
      authorizationType: 'Institutional Transfer Certificate',
      status: 'Approved',
      remarks: 'All institutional fees cleared; DCA completion verified.',
      issueDate: '2026-11-10',
      approvedBy: 'Dr. Rafiqul Islam',
      createdAt: '2026-11-09T10:00:00Z',
      isSample: true,
    },
  ];

  const certificates: CertificateRecord[] = [
    {
      id: 'cert-1',
      certificateNo: 'SPEI-CERT-2026-1001',
      documentType: 'Course Completion Certificate',
      studentId: 'stu-1',
      studentCode: 'SPI/DHB/2026/00001',
      studentName: 'Aarav Prodhani',
      fatherName: 'Nagen Prodhani',
      courseName: 'Diploma in Computer Applications (DCA) Foundation',
      district: 'Dhubri',
      centreName: 'Success Point Head Office & Main Campus, Dhubri',
      grade: 'A+ (88%)',
      issueDate: '2026-10-28',
      status: 'Issued',
      reprintHistory: [],
      isSample: true,
    },
    {
      id: 'cert-2',
      certificateNo: 'SPEI-CERT-2026-1002',
      documentType: 'Training Certificate',
      studentId: 'stu-2',
      studentCode: 'SPI/KKJ/2026/00002',
      studentName: 'Mousumi Brahma',
      fatherName: 'Kanak Brahma',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      district: 'Kokrajhar',
      centreName: 'Success Point Academic & IT Centre, Kokrajhar',
      grade: 'A (84%)',
      issueDate: '2026-11-05',
      status: 'Issued',
      reprintHistory: [],
      isSample: true,
    },
  ];

  const attendance: AttendanceRecord[] = [
    {
      id: 'att-1',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      courseId: 'crs-cmp-pgdca',
      district: 'Dhubri',
      date: '2026-11-18',
      status: 'Present',
      markedBy: 'Farhana Begum',
    },
    {
      id: 'att-2',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      courseId: 'crs-cmp-pgdca',
      district: 'Dhubri',
      date: '2026-11-19',
      status: 'Present',
      markedBy: 'Farhana Begum',
    },
    {
      id: 'att-3',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      courseId: 'crs-cmp-pgdca',
      district: 'Dhubri',
      date: '2026-11-20',
      status: 'Late',
      markedBy: 'Farhana Begum',
    },
    {
      id: 'att-4',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      courseId: 'crs-cmp-pgdca',
      district: 'Dhubri',
      date: '2026-11-21',
      status: 'Present',
      markedBy: 'Farhana Begum',
    },
    {
      id: 'att-5',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      courseId: 'crs-cmp-pgdca',
      district: 'Dhubri',
      date: '2026-11-22',
      status: 'Present',
      markedBy: 'Farhana Begum',
    },
  ];

  const studyMaterials: StudyMaterial[] = [
    {
      id: 'mat-1',
      title: 'Python & C Programming Lab Workbook (PGDCA Module 1)',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      type: 'PDF',
      summary: 'Structured lab exercises covering control flow, functions, file handling, and data structures.',
      contentBody:
        'SUCCESS POINT EDUCATIONAL INSTITUTE - STUDY MODULE\nCourse: PGDCA Track\nTopic: Programming Logic & Python Lab Exercises\n\n1. Variables, Data Types & Conditional Branching\n2. Loops, Lists, Dictionaries & Modular Functions\n3. Practice Exercises (1–15) for Dhubri & District Computer Labs.',
      uploadedBy: 'Subhajit Roy (Senior IT Faculty)',
      createdAt: '2026-10-12T09:00:00Z',
    },
    {
      id: 'mat-2',
      title: 'Tally Prime with GST Practical Ledger Set',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      type: 'Notes',
      summary: '30 real-world Assam MSME GST billing scenarios, voucher types, and GSTR-3B reconciliation steps.',
      contentBody:
        'SUCCESS POINT EDUCATIONAL INSTITUTE - ACCOUNTING LAB\nTopic: Tally Prime GST Configuration\n\n- Company Creation with Assam State Code (18)\n- CGST + SGST vs IGST Ledger Setup\n- Generating e-Invoice JSON & GSTR-1 Summary.',
      uploadedBy: 'Farhana Begum',
      createdAt: '2026-11-02T11:30:00Z',
    },
    {
      id: 'mat-3',
      title: 'Assam History & Geography Quick Revision Compendium',
      courseId: 'crs-cmp-adre',
      courseName: 'Assam Direct Recruitment (ADRE), SSC & Banking Foundation',
      type: 'PDF',
      summary: 'District-by-district Assam socio-economic facts, river systems, and previous ADRE solved questions.',
      contentBody:
        'SUCCESS POINT COMPETITIVE CELL\nTopic: Assam General Knowledge\n\nKey Topics: Brahmaputra & Barak Valley Districts, Cultural Heritage, State Schemes & Mock MCQs.',
      uploadedBy: 'Dr. Rafiqul Islam',
      createdAt: '2026-11-08T10:00:00Z',
    },
  ];

  const onlineClasses: OnlineClassSession[] = [
    {
      id: 'cls-1',
      title: 'SQL Database Normalization & Query Workshop',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      instructor: 'Subhajit Roy',
      scheduleDate: '2026-11-26',
      scheduleTime: '10:30 AM – 12:00 PM IST',
      meetingLink: 'https://meet.jit.si/successpoint-dhubri-pgdca',
      platform: 'Live Interactive Classroom',
      status: 'Upcoming',
    },
    {
      id: 'cls-2',
      title: 'ADRE Quantitative Aptitude: Percentage & Profit-Loss',
      courseId: 'crs-cmp-adre',
      courseName: 'Assam Direct Recruitment (ADRE), SSC & Banking Foundation',
      instructor: 'Manashjyoti Bora',
      scheduleDate: '2026-11-27',
      scheduleTime: '04:00 PM – 05:30 PM IST',
      meetingLink: 'https://meet.jit.si/successpoint-assam-adre',
      platform: 'Live Interactive Classroom',
      status: 'Upcoming',
    },
  ];

  const assignments: AssignmentRecord[] = [
    {
      id: 'asg-1',
      title: 'Build a Responsive Institute Profile Page in HTML5 & CSS',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      submissionText: 'Completed responsive 3-section layout with semantic header, table, and contact form.',
      grade: 'A (92/100)',
      feedback: 'Clean semantic markup and accessible contrast.',
      status: 'Graded',
      dueDate: '2026-11-10',
      submittedAt: '2026-11-09T15:20:00Z',
    },
    {
      id: 'asg-2',
      title: 'Prepare GSTR-1 Monthly Invoice Sheet in Tally Prime',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      submissionText: '',
      status: 'Pending',
      dueDate: '2026-11-30',
    },
  ];

  const exams: ExamDefinition[] = [
    {
      id: 'exm-1',
      title: 'PGDCA Mid-Term Online Assessment (Computing & Web Basics)',
      courseId: 'crs-cmp-pgdca',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      examDate: '2026-11-25',
      durationMinutes: 20,
      totalMarks: 20,
      status: 'Open',
      questions: [
        {
          id: 'q1',
          question: 'Which HTML element is used to define the primary navigation links of a document?',
          options: ['<section>', '<nav>', '<aside>', '<header-links>'],
          correctIndex: 1,
        },
        {
          id: 'q2',
          question: 'In Tally Prime, which function key opens the Payment Voucher?',
          options: ['F4', 'F5', 'F6', 'F8'],
          correctIndex: 1,
        },
        {
          id: 'q3',
          question: 'What does SQL stand for in relational database management?',
          options: [
            'Structured Question Language',
            'Simple Query Logic',
            'Structured Query Language',
            'System Queue Language',
          ],
          correctIndex: 2,
        },
        {
          id: 'q4',
          question: 'Which GST tax applies to intra-state supplies within Assam?',
          options: ['IGST only', 'CGST + SGST', 'UTGST only', 'Customs Duty'],
          correctIndex: 1,
        },
      ],
    },
  ];

  const examResults: ExamResult[] = [
    {
      id: 'res-1',
      examId: 'exm-prev-1',
      examTitle: 'Module 1 Practical & Theory Evaluation',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      rollNumber: 'DHB-2026-042',
      score: 88,
      totalMarks: 100,
      grade: 'A',
      status: 'Pass',
      publishedAt: '2026-10-25T12:00:00Z',
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay-1',
      receiptNo: 'RCPT-SPEI-2026-701',
      studentId: 'stu-1',
      studentName: 'Aarav Prodhani',
      applicationId: 'SPEI-2026-1042',
      courseName: 'Post Graduate Diploma in Computer Applications (PGDCA) Track',
      district: 'Dhubri',
      centreId: 'ctr-dhubri-hq',
      amount: 6400,
      method: 'UPI',
      transactionRef: 'UPI-631984512098',
      status: 'Paid',
      paidAt: '2026-07-03T14:15:00Z',
    },
    {
      id: 'pay-2',
      receiptNo: 'RCPT-SPEI-2026-745',
      studentId: 'stu-2',
      studentName: 'Mousumi Brahma',
      applicationId: 'SPEI-2026-1019',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      district: 'Kokrajhar',
      centreId: 'ctr-kokrajhar',
      amount: 4800,
      method: 'Card',
      transactionRef: 'RZP-9812345611',
      status: 'Paid',
      paidAt: '2026-08-01T10:10:00Z',
    },
  ];

  const certificateRequests: CertificateRequest[] = [
    {
      id: 'creq-1',
      centreId: 'ctr-kokrajhar',
      centreName: 'Success Point Academic & IT Centre, Kokrajhar',
      studentId: 'stu-2',
      studentName: 'Mousumi Brahma',
      courseName: 'Diploma in Computer Applications (DCA) & Office Suite',
      status: 'Approved',
      requestedAt: '2026-11-02T09:00:00Z',
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'not-1',
      title: 'Winter 2026–27 Admissions Open Across All 11 Program Categories',
      category: 'Admission',
      district: 'All Assam',
      summary:
        'Online applications are open for School Coaching, Higher Secondary, DCA/PGDCA, Tally GST, and ADRE Competitive batches at Dhubri HQ and district centres.',
      content:
        'Candidates may submit their online admission form via the Apply Now portal or visit the Dhubri Head Office (GTB Road, Ward No. 12) between 9:30 AM and 6:00 PM Monday to Saturday.',
      publishedAt: '2026-11-20',
      isPinned: true,
    },
    {
      id: 'not-2',
      title: 'PGDCA & DCA Practical Examination Schedule — December 2026',
      category: 'Examination',
      district: 'Dhubri',
      summary:
        'Admit cards for enrolled computer batch learners are now available inside the Student Dashboard.',
      content:
        'Practical lab evaluations for Batch 2026–27 will commence from December 10, 2026. Students must download their Admit Card and bring their institute ID card.',
      publishedAt: '2026-11-18',
      isPinned: true,
    },
    {
      id: 'not-3',
      title: 'Assam Pre-Matric & Post-Matric Minority / OBC Scholarship Guidance Desk',
      category: 'Scholarship',
      district: 'All Assam',
      summary:
        'Free document checklist and National Scholarship Portal (NSP) guidance sessions every Friday at Dhubri & Goalpara centres.',
      content:
        'Eligible school and college students can bring income, caste, and bonafide certificates for step-by-step scholarship application assistance.',
      publishedAt: '2026-11-14',
      isPinned: false,
    },
    {
      id: 'not-4',
      title: 'Module 1 Assessment Results Published for Dhubri & Kokrajhar Batches',
      category: 'Result',
      district: 'Kokrajhar',
      summary:
        'Students can check their scorecards and faculty remarks inside the Student Portal Results tab.',
      content:
        'Congratulations to all learners who scored above 80% in the Module 1 evaluation. Re-evaluation requests may be submitted via Helpdesk within 7 days.',
      publishedAt: '2026-11-10',
      isPinned: false,
    },
    {
      id: 'not-5',
      title: 'Assam Direct Recruitment (ADRE) & District Employment Exchange Update',
      category: 'Job',
      district: 'All Assam',
      summary:
        'New practice mock test series and computer skill test drills launched for upcoming Grade III & IV skill tests.',
      content:
        'Weekly OMR and practical computer typing mock tests are scheduled every Saturday at 10:00 AM across all active Success Point centres.',
      publishedAt: '2026-11-06',
      isPinned: false,
    },
    {
      id: 'not-6',
      title: 'Annual Career Guidance Seminar at Dhubri Town Hall',
      category: 'Event',
      district: 'Dhubri',
      summary:
        'Open seminar for Class 10, 12, and college students on digital careers, competitive exams, and skill pathways.',
      content:
        'Join educators, IT mentors, and district coordinators on December 5, 2026 at 11:00 AM. Free entry for students and parents.',
      publishedAt: '2026-11-03',
      isPinned: false,
    },
  ];

  const gallery: GalleryItem[] = [
    {
      id: 'gal-1',
      title: 'Success Point Head Office & Campus Courtyard, Dhubri',
      category: 'Campus',
      mediaUrl: '/src/assets/images/hero_campus_dhubri_1795532445456.jpg',
      caption: 'Main academic complex at GTB Road, Ward No. 12, Dhubri, Assam.',
      date: '2026-10-15',
    },
    {
      id: 'gal-2',
      title: 'Smart Classroom Interactive Seminar Session',
      category: 'Seminar',
      mediaUrl: '/src/assets/images/about_seminar_hall_1795532446180.jpg',
      caption: 'Higher Secondary and college mentoring workshop led by senior faculty.',
      date: '2026-10-22',
    },
    {
      id: 'gal-3',
      title: 'DCA & PGDCA Practical Computer Laboratory',
      category: 'Activities',
      mediaUrl: '/src/assets/images/course_computer_lab_1795532446387.jpg',
      caption: 'Students practicing database queries, Tally Prime, and web development.',
      date: '2026-11-01',
    },
    {
      id: 'gal-4',
      title: 'Annual Certificate Distribution & Felicitation Ceremony',
      category: 'Certificate',
      mediaUrl: '/src/assets/images/gallery_convocation_1795532446358.jpg',
      caption: 'Meritorious learners receiving QR-verified skill completion certificates.',
      date: '2026-11-08',
    },
  ];

  const enquiries: EnquiryRecord[] = [
    {
      id: 'enq-1',
      name: 'Rituraj Kalita',
      phone: '+91-98641-30091',
      email: 'rituraj.k@example.in',
      district: 'Goalpara',
      subject: 'DCA Evening Batch Timings',
      message: 'Please share the fee installment option and evening lab timings at Goalpara centre.',
      status: 'New',
      createdAt: '2026-11-21T08:40:00Z',
    },
  ];

  const supportTickets: SupportTicket[] = [
    {
      id: 'tkt-1',
      userId: 'usr-student-demo',
      userName: 'Aarav Prodhani',
      userRole: 'student',
      district: 'Dhubri',
      subject: 'Update Father Name Spelling on Admit Card',
      category: 'Academic Document',
      message: 'Kindly verify my HSLC marksheet attachment for final admit card spelling check.',
      reply: 'Verified against uploaded HSLC copy. Record updated cleanly.',
      status: 'Resolved',
      createdAt: '2026-11-15T10:20:00Z',
    },
  ];

  const staffTasks: StaffTask[] = [
    {
      id: 'tsk-1',
      title: 'Verify pending Dhubri & Gauripur DCA admission documents',
      assignedTo: 'usr-staff-demo',
      assignedToName: 'Farhana Begum',
      district: 'Dhubri',
      priority: 'High',
      dueDate: '2026-11-26',
      status: 'In Progress',
    },
    {
      id: 'tsk-2',
      title: 'Publish December practical lab seating chart on Notice Board',
      assignedTo: 'usr-staff-demo',
      assignedToName: 'Farhana Begum',
      district: 'Dhubri',
      priority: 'Medium',
      dueDate: '2026-11-28',
      status: 'Pending',
    },
  ];

  const blogs: BlogArticle[] = [
    {
      id: 'blg-1',
      title: 'Choosing Between Computer Diploma (DCA/PGDCA) and Tally GST After Class 12 in Assam',
      category: 'Career Update',
      summary:
        'A practical guide for students in Dhubri, Kokrajhar, and Goalpara evaluating office IT skills versus accounting specialization.',
      content:
        'Students completing Class 12 often wonder whether to pursue a broad computer diploma or specialized GST accounting. For Assam state government Grade III roles requiring computer proficiency, a 6-month DCA or 12-month PGDCA provides essential MS Office, database, and typing skills. Those targeting private-sector accounts and MSME billing benefit immediately from Tally Prime with GST.',
      publishedAt: '2026-11-12',
      author: 'Academic Advisory Desk, Dhubri',
    },
    {
      id: 'blg-2',
      title: '2026–27 Assam & National Scholarship Checklist for School and College Learners',
      category: 'Scholarship Guide',
      summary:
        'Essential documents—income certificate, bonafide verification, Aadhaar-bank seeding—required before applying on NSP.',
      content:
        'Keep your previous academic marksheet, active bank passbook seeded with Aadhaar, valid income certificate from the circle office, and institutional bonafide letter ready prior to portal deadlines.',
      publishedAt: '2026-11-05',
      author: 'Student Support Cell',
    },
  ];

  const cmsSettings = createDefaultCmsSettings();
  const branding = createDefaultBranding();

  return {
    adminClaimed: false,
    lastStudentSeq: 2,
    cmsSettings,
    branding,
    documentTemplates: createDefaultDocumentTemplates(),
    whatsappSettings: createDefaultWhatsAppSettings(),
    cmsVersions: [
      {
        id: 'cmsv-1',
        version: 1,
        savedBy: 'System Initializer',
        note: 'Initial institutional configuration',
        timestamp: '2026-11-24T06:00:00Z',
        cmsSettings,
        branding,
      },
    ],
    backups: [],
    rolePermissions: createDefaultRolePermissions(),
    sessions: [],
    loginAttempts: [],
    otpChallenges: [],
    activationChallenges: [],
    twoFactorChallenges: [],
    securityAlerts: [],
    studentIdHistory: [
      {
        id: 'sidh-1',
        studentId: 'SPI/DHB/2026/00001',
        studentName: 'Aarav Prodhani',
        action: 'Generated',
        actorName: 'Admission System',
        timestamp: '2026-07-03T14:20:00Z',
      },
    ],
    courses,
    centres,
    users,
    applications,
    students,
    admitCards,
    marksheets,
    migrations,
    attendance,
    studyMaterials,
    onlineClasses,
    assignments,
    exams,
    examResults,
    payments,
    certificates,
    certificateRequests,
    notifications,
    gallery,
    enquiries,
    supportTickets,
    staffTasks,
    blogs,
    newsletterSubscribers: ['parent.dhubri@example.in'],
    auditLogs: [
      {
        id: 'aud-1',
        userId: 'system',
        actorName: 'System Initializer',
        actorRole: 'system',
        action: 'SEED_SAMPLE_DATA',
        recordId: 'seed-v2',
        target: 'Dhubri HQ & Assam District Registry',
        timestamp: '2026-11-24T06:00:00Z',
      },
    ],
  };
}

function hydrateDbDefaults(raw: Partial<DatabaseState>): DatabaseState {
  const defaults = createInitialSeedData();
  const mergedCms: CmsSettings = {
    ...defaults.cmsSettings,
    ...(raw.cmsSettings || {}),
    socialLinks: {
      ...defaults.cmsSettings.socialLinks,
      ...(raw.cmsSettings?.socialLinks || {}),
    },
    navMenus: {
      ...defaults.cmsSettings.navMenus,
      ...(raw.cmsSettings?.navMenus || {}),
    },
    testimonials:
      Array.isArray(raw.cmsSettings?.testimonials) && raw.cmsSettings.testimonials.length > 0
        ? raw.cmsSettings.testimonials
        : defaults.cmsSettings.testimonials,
  };

  const mergedBranding: BrandingConfig = {
    ...defaults.branding,
    ...(raw.branding || {}),
  };

  const students = (raw.students || defaults.students).map((s, idx) => ({
    ...s,
    studentId: s.studentId || `SPI/DHB/2026/${String(idx + 1).padStart(5, '0')}`,
    registrationNumber: s.registrationNumber || `REG-2026-${String(idx + 1).padStart(5, '0')}`,
    admissionNumber: s.admissionNumber || `ADM-2026-${String(idx + 1).padStart(5, '0')}`,
    centreCode: s.centreCode || 'SPEI-DHB-001',
    courseCode: s.courseCode || 'SPEI-GEN',
    academicSession: s.academicSession || '2026–27',
    registrationDate: s.registrationDate || (s.enrolledAt || '2026-07-03').slice(0, 10),
  }));

  const certificates = (raw.certificates || defaults.certificates).map((c) => ({
    ...c,
    documentType: c.documentType || 'Course Completion Certificate',
    reprintHistory: Array.isArray(c.reprintHistory) ? c.reprintHistory : [],
  }));

  const primaryEmail = getPrimarySuperAdminEmail();
  const rawUsers = (raw.users || defaults.users).filter(
    (u) => u.id !== 'usr-super-admin' && u.email.toLowerCase() !== 'superadmin@successpointdhubri.edu.in'
  );
  let users: StoredUser[] = rawUsers.map((u) => {
    if (u.id === 'usr-primary-super-admin' || u.email.toLowerCase() === primaryEmail) {
      const verified = Boolean(u.emailVerified && u.passwordHash);
      return {
        ...u,
        id: 'usr-primary-super-admin',
        email: primaryEmail,
        role: 'super_admin',
        isPrimarySuperAdmin: true,
        twoFactorEnabled: true,
        emailVerified: verified,
        status: verified ? 'Active' : 'Pending',
      };
    }
    return u;
  });

  if (!users.some((u) => u.id === 'usr-primary-super-admin')) {
    const primaryDef = defaults.users.find((u) => u.id === 'usr-primary-super-admin')!;
    users.unshift(primaryDef);
  }
  for (const defUser of defaults.users) {
    if (
      defUser.id !== 'usr-primary-super-admin' &&
      !users.some((u) => u.email.toLowerCase() === defUser.email.toLowerCase())
    ) {
      users.push(defUser);
    }
  }

  const primaryAdmin = users.find((u) => u.id === 'usr-primary-super-admin');
  const isPrimaryActivated = Boolean(
    primaryAdmin && primaryAdmin.emailVerified && primaryAdmin.passwordHash && primaryAdmin.status === 'Active'
  );

  const mergedPermissions = {
    ...defaults.rolePermissions,
    ...(raw.rolePermissions || {}),
    super_admin: defaults.rolePermissions.super_admin,
  };

  return {
    ...defaults,
    ...raw,
    adminClaimed: isPrimaryActivated,
    lastStudentSeq: typeof raw.lastStudentSeq === 'number' ? raw.lastStudentSeq : students.length,
    cmsSettings: mergedCms,
    branding: mergedBranding,
    documentTemplates:
      Array.isArray(raw.documentTemplates) && raw.documentTemplates.length > 0
        ? raw.documentTemplates
        : defaults.documentTemplates,
    whatsappSettings: {
      ...defaults.whatsappSettings,
      ...(raw.whatsappSettings || {}),
    },
    cmsVersions:
      Array.isArray(raw.cmsVersions) && raw.cmsVersions.length > 0
        ? raw.cmsVersions
        : defaults.cmsVersions,
    backups: Array.isArray(raw.backups) ? raw.backups : [],
    rolePermissions: mergedPermissions,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    loginAttempts: Array.isArray(raw.loginAttempts) ? raw.loginAttempts : [],
    otpChallenges: Array.isArray(raw.otpChallenges) ? raw.otpChallenges : [],
    activationChallenges: Array.isArray(raw.activationChallenges) ? raw.activationChallenges : [],
    twoFactorChallenges: Array.isArray(raw.twoFactorChallenges) ? raw.twoFactorChallenges : [],
    securityAlerts: Array.isArray(raw.securityAlerts) ? raw.securityAlerts : [],
    studentIdHistory:
      Array.isArray(raw.studentIdHistory) && raw.studentIdHistory.length > 0
        ? raw.studentIdHistory
        : defaults.studentIdHistory,
    users,
    students,
    admitCards:
      Array.isArray(raw.admitCards) && raw.admitCards.length > 0
        ? raw.admitCards
        : defaults.admitCards,
    marksheets:
      Array.isArray(raw.marksheets) && raw.marksheets.length > 0
        ? raw.marksheets
        : defaults.marksheets,
    migrations:
      Array.isArray(raw.migrations) && raw.migrations.length > 0
        ? raw.migrations
        : defaults.migrations,
    certificates,
  };
}

let cachedState: DatabaseState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadDb(): Promise<DatabaseState> {
  if (cachedState) return cachedState;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    cachedState = hydrateDbDefaults(JSON.parse(raw) as Partial<DatabaseState>);
    return cachedState;
  } catch {
    cachedState = createInitialSeedData();
    await persistDb(cachedState);
    return cachedState;
  }
}

export async function persistDb(state: DatabaseState): Promise<void> {
  cachedState = state;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmpFile, DB_FILE);
  });
  await writeQueue;
}

export function addAuditLog(
  state: DatabaseState,
  actorName: string,
  actorRole: string,
  action: string,
  target: string,
  meta?: {
    userId?: string;
    recordId?: string;
    previousValue?: string;
    updatedValue?: string;
    ip?: string;
    userAgent?: string;
  }
) {
  state.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    userId: meta?.userId || 'system',
    actorName,
    actorRole,
    action,
    recordId: meta?.recordId || target.slice(0, 40),
    target,
    previousValue: meta?.previousValue,
    updatedValue: meta?.updatedValue,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
    timestamp: new Date().toISOString(),
  });
  if (state.auditLogs.length > 1000) {
    state.auditLogs = state.auditLogs.slice(0, 1000);
  }
}

export function addSecurityAlert(
  state: DatabaseState,
  title: string,
  severity: SecurityAlert['severity'],
  message: string,
  emailDispatched: boolean,
  ip?: string
) {
  state.securityAlerts.unshift({
    id: `sec-${crypto.randomUUID().slice(0, 8)}`,
    title,
    severity,
    message,
    emailDispatched,
    acknowledged: false,
    ip,
    timestamp: new Date().toISOString(),
  });
  if (state.securityAlerts.length > 200) {
    state.securityAlerts = state.securityAlerts.slice(0, 200);
  }
}

export async function createEncryptedBackup(
  state: DatabaseState,
  actorName: string
): Promise<BackupRecord> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const id = `bkp-${crypto.randomUUID().slice(0, 8)}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `spei-backup-${stamp}.enc`;
  const key = crypto.scryptSync(BACKUP_MASTER_SECRET, 'spei-backup-salt-v2', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const snapshot = JSON.stringify({
    ...state,
    sessions: [],
    otpChallenges: [],
    activationChallenges: [],
    twoFactorChallenges: [],
  });
  const encrypted = Buffer.concat([cipher.update(snapshot, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = JSON.stringify({
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: encrypted.toString('base64'),
  });
  await fs.writeFile(path.join(BACKUPS_DIR, filename), payload, 'utf8');

  const record: BackupRecord = {
    id,
    filename,
    createdBy: actorName,
    encrypted: true,
    recordCounts: {
      students: state.students.filter((s) => !s.deletedAt).length,
      applications: state.applications.filter((a) => !a.deletedAt).length,
      marksheets: state.marksheets.filter((m) => !m.deletedAt).length,
      certificates: state.certificates.filter((c) => !c.deletedAt).length,
    },
    createdAt: new Date().toISOString(),
  };
  state.backups.unshift(record);
  if (state.backups.length > 50) {
    state.backups = state.backups.slice(0, 50);
  }
  return record;
}

export async function restoreEncryptedBackup(
  currentState: DatabaseState,
  backupId: string
): Promise<DatabaseState> {
  const entry = currentState.backups.find((b) => b.id === backupId);
  if (!entry) {
    throw new Error('Backup record not found.');
  }
  const safeName = path.basename(entry.filename);
  const target = path.resolve(BACKUPS_DIR, safeName);
  if (!target.startsWith(BACKUPS_DIR + path.sep)) {
    throw new Error('Invalid backup path.');
  }
  const raw = await fs.readFile(target, 'utf8');
  const envelope = JSON.parse(raw) as { iv: string; tag: string; data: string };
  const key = crypto.scryptSync(BACKUP_MASTER_SECRET, 'spei-backup-salt-v2', 32);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  const restored = hydrateDbDefaults(JSON.parse(decrypted.toString('utf8')) as Partial<DatabaseState>);
  // Preserve active sessions and backup history + immutable audit trail
  restored.sessions = currentState.sessions;
  restored.backups = currentState.backups;
  restored.auditLogs = currentState.auditLogs;
  return restored;
}
