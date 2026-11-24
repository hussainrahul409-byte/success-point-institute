export type Language = 'en' | 'hi' | 'as';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'exam_controller'
  | 'office_manager'
  | 'admission_officer'
  | 'accountant'
  | 'district_coordinator'
  | 'franchise'
  | 'staff'
  | 'student';

export const ALL_USER_ROLES: { id: UserRole; label: string }[] = [
  { id: 'super_admin', label: 'Super Admin' },
  { id: 'admin', label: 'Admin' },
  { id: 'exam_controller', label: 'Examination Controller' },
  { id: 'office_manager', label: 'Office Manager' },
  { id: 'admission_officer', label: 'Admission Officer' },
  { id: 'accountant', label: 'Accountant' },
  { id: 'district_coordinator', label: 'District Coordinator' },
  { id: 'franchise', label: 'Franchise Owner' },
  { id: 'staff', label: 'Staff Member' },
  { id: 'student', label: 'Student' },
];

export type PermissionKey =
  | 'manage_cms_branding'
  | 'manage_security_sessions'
  | 'manage_backups'
  | 'manage_users_roles'
  | 'manage_courses'
  | 'manage_admissions'
  | 'manage_students'
  | 'manage_exams_marksheets'
  | 'manage_certificates'
  | 'manage_migrations'
  | 'manage_fees'
  | 'manage_franchises'
  | 'manage_notices_gallery'
  | 'manage_whatsapp'
  | 'manage_legal_compliance'
  | 'view_audit_logs';

export type CourseCategory =
  | 'School Education'
  | 'Higher Secondary Education'
  | 'College Education'
  | 'University-Level Programs'
  | 'Computer Courses'
  | 'Professional Courses'
  | 'Skill Development'
  | 'Vocational Training'
  | 'Competitive Examination Preparation'
  | 'Teacher Training'
  | 'Distance Education Guidance';

export const COURSE_CATEGORIES: CourseCategory[] = [
  'School Education',
  'Higher Secondary Education',
  'College Education',
  'University-Level Programs',
  'Computer Courses',
  'Professional Courses',
  'Skill Development',
  'Vocational Training',
  'Competitive Examination Preparation',
  'Teacher Training',
  'Distance Education Guidance',
];

export const ASSAM_DISTRICTS = [
  'Dhubri',
  'Kokrajhar',
  'Bongaigaon',
  'Goalpara',
  'Barpeta',
  'Kamrup',
  'Guwahati',
  'Nalbari',
  'South Salmara-Mankachar',
  'Jorhat',
  'Dibrugarh',
  'Nagaon',
  'Silchar',
  'Tezpur',
  'Other Assam / India District',
] as const;

export interface Course {
  id: string;
  code: string;
  name: string;
  category: CourseCategory;
  description: string;
  eligibility: string;
  duration: string;
  fees: number;
  mode: 'Offline' | 'Online' | 'Hybrid';
  admissionRequirements: string[];
  syllabus: string[];
  careerOpportunities: string[];
  authorizationNote: string;
  featured: boolean;
  deletedAt?: string;
}

export interface Centre {
  id: string;
  code: string;
  name: string;
  isHeadOffice?: boolean;
  applicantName: string;
  organizationName: string;
  mobile: string;
  email: string;
  address: string;
  district: string;
  state: string;
  proposedLocation: string;
  infrastructureDetails: string;
  experience: string;
  documentUrl?: string;
  lat: number;
  lng: number;
  status: 'Active' | 'Pending' | 'Rejected' | 'Suspended';
  commissionRate: number;
  createdAt: string;
  deletedAt?: string;
}

export interface ApplicationRecord {
  id: string;
  applicationId: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  email: string;
  address: string;
  state: string;
  district: string;
  pinCode: string;
  qualification: string;
  courseId: string;
  courseName: string;
  centreId: string;
  centreName: string;
  photoUrl?: string;
  documentUrl?: string;
  status: 'Pending' | 'Verified' | 'Approved' | 'Rejected';
  remarks: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  district: string;
  centreId?: string;
  status: 'Active' | 'Suspended' | 'Pending';
  isPrimarySuperAdmin?: boolean;
  emailVerified?: boolean;
  activatedAt?: string;
  twoFactorEnabled?: boolean;
  failedAttempts?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  lastKnownIp?: string;
  createdAt: string;
  deletedAt?: string;
}

export interface SecurityAlert {
  id: string;
  title: string;
  severity: 'Info' | 'Warning' | 'Critical';
  message: string;
  emailDispatched: boolean;
  acknowledged: boolean;
  ip?: string;
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedReason?: string;
}

export interface LoginAttemptRecord {
  id: string;
  email: string;
  ip: string;
  userAgent: string;
  success: boolean;
  suspicious: boolean;
  reason: string;
  timestamp: string;
}

export interface StudentIdHistoryItem {
  id: string;
  studentId: string;
  studentName: string;
  action: 'Generated' | 'Printed' | 'Reprinted' | 'PDF Downloaded';
  actorName: string;
  timestamp: string;
}

export interface StudentProfile {
  id: string;
  userId: string;
  studentId: string; // e.g. SPI/DHB/2026/00001
  registrationNumber: string; // e.g. REG-2026-00001
  admissionNumber: string; // e.g. ADM-2026-00001
  rollNumber: string;
  applicationId: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  dob: string;
  mobile: string;
  email: string;
  address: string;
  district: string;
  centreId: string;
  centreCode: string;
  centreName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  academicSession: string;
  batch: string;
  registrationDate: string;
  photoUrl?: string;
  feeTotal: number;
  feePaid: number;
  admitCardNo: string;
  certificateNo?: string;
  admissionStatus: 'Active' | 'Completed' | 'Suspended' | 'Cancelled';
  enrolledAt: string;
  isSample?: boolean;
  deletedAt?: string;
}

export interface AdmitCardRecord {
  id: string;
  admitCardNo: string;
  studentDbId: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  fatherName: string;
  photoUrl?: string;
  courseName: string;
  courseCode: string;
  examName: string;
  examSession: string;
  examCentre: string;
  examDate: string;
  examTiming: string;
  subjects: string[];
  status: 'Draft' | 'Approved';
  approvedBy?: string;
  publishedAt?: string;
  createdAt: string;
  isSample?: boolean;
}

export interface SubjectMark {
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  passingMarks: number;
  obtainedMarks: number;
}

export interface MarksheetVersion {
  version: number;
  subjects: SubjectMark[];
  totalMaxMarks: number;
  totalObtainedMarks: number;
  percentage: number;
  grade: string;
  resultStatus: 'Pass' | 'Fail';
  editedBy: string;
  reason: string;
  timestamp: string;
}

export interface MarksheetRecord {
  id: string;
  marksheetNo: string;
  studentDbId: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  fatherName: string;
  courseName: string;
  courseCode: string;
  examName: string;
  academicSession: string;
  subjects: SubjectMark[];
  totalMaxMarks: number;
  totalObtainedMarks: number;
  percentage: number;
  grade: string;
  resultStatus: 'Pass' | 'Fail';
  status: 'Draft' | 'Approved' | 'Published';
  approvedBy?: string;
  issueDate: string;
  versionHistory: MarksheetVersion[];
  isSample?: boolean;
  deletedAt?: string;
}

export interface MigrationRecord {
  id: string;
  migrationNo: string;
  studentDbId: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  fatherName: string;
  courseName: string;
  academicSession: string;
  lastExamDetails: string;
  targetInstitution: string;
  reason: string;
  documentVerified: boolean;
  feeVerified: boolean;
  authorizationType: 'Institutional Transfer Certificate' | 'Awarding Body Referral Letter';
  status: 'Pending' | 'Verified' | 'Approved' | 'Rejected';
  remarks: string;
  issueDate?: string;
  approvedBy?: string;
  createdAt: string;
  isSample?: boolean;
}

export type CertificateDocumentType =
  | 'Course Completion Certificate'
  | 'Training Certificate'
  | 'Participation Certificate'
  | 'Achievement Certificate'
  | 'Internship Certificate'
  | 'Experience Certificate'
  | 'Migration Certificate'
  | 'Provisional Certificate'
  | 'Academic Marksheet'
  | 'Student Identity Card'
  | 'Admit Card'
  | 'Registration Certificate';

export const CERTIFICATE_TYPES: CertificateDocumentType[] = [
  'Course Completion Certificate',
  'Training Certificate',
  'Participation Certificate',
  'Achievement Certificate',
  'Internship Certificate',
  'Experience Certificate',
  'Migration Certificate',
  'Provisional Certificate',
  'Academic Marksheet',
  'Student Identity Card',
  'Admit Card',
  'Registration Certificate',
];

export interface CertificateReprintLog {
  actorName: string;
  reason: string;
  timestamp: string;
}

export interface CertificateRecord {
  id: string;
  certificateNo: string;
  documentType: CertificateDocumentType;
  studentId: string; // Student DB id or external recipient id
  studentCode?: string; // SPI/DHB/2026/00001
  studentName: string;
  fatherName: string;
  courseName: string;
  district: string;
  centreName: string;
  grade: string;
  issueDate: string;
  status: 'Issued' | 'Cancelled' | 'Corrected';
  correctionNote?: string;
  replacesCertificateNo?: string;
  reprintHistory: CertificateReprintLog[];
  isSample?: boolean;
  deletedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  courseId: string;
  district: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late';
  markedBy: string;
}

export interface StudyMaterial {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  type: 'PDF' | 'Notes' | 'Video';
  summary: string;
  contentBody: string;
  uploadedBy: string;
  createdAt: string;
}

export interface OnlineClassSession {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  instructor: string;
  scheduleDate: string;
  scheduleTime: string;
  meetingLink: string;
  platform: string;
  status: 'Upcoming' | 'Live' | 'Recorded';
}

export interface AssignmentRecord {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  fileUrl?: string;
  grade?: string;
  feedback?: string;
  status: 'Pending' | 'Submitted' | 'Graded';
  dueDate: string;
  submittedAt?: string;
}

export interface ExamQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ExamDefinition {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  examDate: string;
  durationMinutes: number;
  totalMarks: number;
  questions: ExamQuestion[];
  status: 'Scheduled' | 'Open' | 'Completed';
}

export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  score: number;
  totalMarks: number;
  grade: string;
  status: 'Pass' | 'Fail';
  publishedAt: string;
}

export interface PaymentRecord {
  id: string;
  receiptNo: string;
  studentId: string;
  studentName: string;
  applicationId?: string;
  courseName: string;
  district: string;
  centreId: string;
  amount: number;
  method: 'UPI' | 'Card' | 'NetBanking' | 'Cash';
  transactionRef: string;
  status: 'Paid' | 'Pending' | 'Failed';
  paidAt: string;
}

export interface CertificateRequest {
  id: string;
  centreId: string;
  centreName: string;
  studentId: string;
  studentName: string;
  courseName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: string;
}

export type NotificationCategory =
  | 'Admission'
  | 'Examination'
  | 'Result'
  | 'Announcement'
  | 'Holiday'
  | 'Scholarship'
  | 'Job'
  | 'Event';

export interface NotificationItem {
  id: string;
  title: string;
  category: NotificationCategory;
  district: string;
  summary: string;
  content: string;
  publishedAt: string;
  isPinned: boolean;
}

export interface GalleryItem {
  id: string;
  title: string;
  category:
    | 'Photo'
    | 'Video'
    | 'Events'
    | 'Seminar'
    | 'Campus'
    | 'Activities'
    | 'Certificate';
  mediaUrl: string;
  caption: string;
  date: string;
}

export interface EnquiryRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  district: string;
  subject: string;
  message: string;
  status: 'New' | 'In Progress' | 'Resolved';
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  district: string;
  subject: string;
  category: string;
  message: string;
  reply?: string;
  status: 'Open' | 'In Review' | 'Resolved';
  createdAt: string;
}

export interface StaffTask {
  id: string;
  title: string;
  assignedTo: string;
  assignedToName: string;
  district: string;
  priority: 'Low' | 'Medium' | 'High';
  dueDate: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface BlogArticle {
  id: string;
  title: string;
  category: 'Education News' | 'Scholarship Guide' | 'Career Update';
  summary: string;
  content: string;
  publishedAt: string;
  author: string;
}

export interface BrandingConfig {
  websiteLogoUrl: string;
  transparentLogoUrl: string;
  faviconUrl: string;
  websiteBannerUrl: string;
  loginLogoUrl: string;
  studentDashboardLogoUrl: string;
  certificateLogoUrl: string;
  idCardLogoUrl: string;
  admitCardLogoUrl: string;
  marksheetLogoUrl: string;
  officialSealUrl: string;
  authorizedSignatureUrl: string;
  signatoryTitle: string;
}

export interface DocumentTemplateConfig {
  id:
    | 'id_card'
    | 'admit_card'
    | 'marksheet'
    | 'migration_certificate'
    | 'course_certificate'
    | 'registration_certificate'
    | 'official_letter';
  label: string;
  primaryColor: string;
  accentColor: string;
  borderStyle: 'double' | 'solid' | 'classic';
  orientation: 'portrait' | 'landscape';
  showLogo: boolean;
  showSeal: boolean;
  showSignature: boolean;
  showQr: boolean;
  headerNote: string;
  footerNote: string;
}

export interface WhatsAppSettings {
  enabled: boolean;
  number: string;
  popupEnabled: boolean;
  popupDelaySeconds: number;
  welcomeHeading: string;
  popupText: string;
  workingHoursNote: string;
  admissionMessage: string;
  courseMessage: string;
  franchiseMessage: string;
  supportMessage: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  location: string;
  quote: string;
}

export interface CmsSettings {
  instituteName: string;
  tagline: string;
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutSummary: string;
  visionText: string;
  missionText: string;
  admissionInfoText: string;
  headOfficeAddress: string;
  contactPhone: string;
  secondaryPhone: string;
  whatsappNumber: string;
  officialEmail: string;
  officeHours: string;
  directorName: string;
  directorMessage: string;
  footerText: string;
  legalDisclaimer: string;
  privacyPolicyText: string;
  termsText: string;
  admissionsOpenBatch: string;
  primaryColor: string;
  accentColor: string;
  fontPreset: 'Plus Jakarta Sans' | 'Outfit' | 'Manrope';
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  socialLinks: {
    facebook: string;
    youtube: string;
    instagram: string;
    x: string;
  };
  navMenus: {
    courses: string;
    admissions: string;
    centres: string;
    notices: string;
    portals: string;
  };
  testimonials: TestimonialItem[];
  studentIdPrefix: string;
  studentIdFormat: string;
  sessionTimeoutMinutes: number;
}

export interface CmsVersion {
  id: string;
  version: number;
  savedBy: string;
  note: string;
  timestamp: string;
  cmsSettings: CmsSettings;
  branding: BrandingConfig;
}

export interface BackupRecord {
  id: string;
  filename: string;
  createdBy: string;
  encrypted: boolean;
  recordCounts: {
    students: number;
    applications: number;
    marksheets: number;
    certificates: number;
  };
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  actorName: string;
  actorRole: string;
  action: string;
  recordId: string;
  target: string;
  previousValue?: string;
  updatedValue?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}
