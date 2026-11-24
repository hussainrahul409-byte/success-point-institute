import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, readFileAsDataUrl } from '../lib/api';
import { TRANSLATIONS } from '../lib/i18n';
import {
  ASSAM_DISTRICTS,
  COURSE_CATEGORIES,
} from '../types/institute';
import type {
  BlogArticle,
  BrandingConfig,
  Centre,
  CertificateRecord,
  CmsSettings,
  Course,
  DocumentTemplateConfig,
  GalleryItem,
  Language,
  NotificationCategory,
  NotificationItem,
  WhatsAppSettings,
} from '../types/institute';
import { CentreLocatorMap } from './CentreLocatorMap';

export type PublicPageRoute =
  | 'home'
  | 'about'
  | 'courses'
  | 'apply'
  | 'notifications'
  | 'gallery'
  | 'franchise'
  | 'contact'
  | 'verify'
  | 'blog'
  | 'privacy'
  | 'terms';

export interface BootstrapData {
  cmsSettings: CmsSettings;
  branding: BrandingConfig;
  documentTemplates: DocumentTemplateConfig[];
  whatsappSettings: WhatsAppSettings;
  courses: Course[];
  centres: Centre[];
  notifications: NotificationItem[];
  gallery: GalleryItem[];
  blogs: BlogArticle[];
  metrics: {
    totalCourses: number;
    activeCentres: number;
    activeDistricts: number;
    enrolledLearners: number;
  };
}

interface PublicPagesProps {
  route: PublicPageRoute;
  lang: Language;
  data: BootstrapData;
  onNavigate: (route: PublicPageRoute, preselectCourseId?: string) => void;
  preselectedCourseId?: string;
  onOpenPortal: () => void;
  onOpenProspectus: () => void;
}

const FAQS = [
  {
    q: 'What types of courses and guidance programs does Success Point offer?',
    a: 'We offer structured academic coaching for School (Class 8–10) and Higher Secondary (Class 11–12), Undergraduate tutoring, Computer Diplomas (DCA, PGDCA), Accounting (Tally Prime with GST), Vocational & Skill training, Competitive exam preparation (ADRE, SSC, Banking), Teacher orientation, and ethical guidance for recognized Open & Distance Learning pathways.',
  },
  {
    q: 'Does Success Point award university degrees directly?',
    a: 'No. Success Point Educational Institute is an independent coaching, skill training, and academic consultancy institute. Degrees and statutory board certificates are awarded solely by the respective recognized boards or universities in which students enroll.',
  },
  {
    q: 'How can I apply for admission online and track my status?',
    a: 'Click Apply Now, complete the admission form with your photograph and educational document, and submit. You will immediately receive a unique Application ID (SPEI-2026-XXXX) which you can track anytime using your registered mobile number.',
  },
  {
    q: 'How do district franchise partnerships work across Assam?',
    a: 'Educators and organizations across Dhubri, Kokrajhar, Bongaigaon, Goalpara, Barpeta, Kamrup, Guwahati, Nalbari, South Salmara-Mankachar, and other districts can apply via the Franchise page. All centres undergo Head Office verification before activation.',
  },
];

export function PublicPages({
  route,
  lang,
  data,
  onNavigate,
  preselectedCourseId,
  onOpenPortal,
  onOpenProspectus,
}: PublicPagesProps) {
  const t = TRANSLATIONS[lang];
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  return (
    <>
      {route === 'home' && (
        <HomeSection
          t={t}
          data={data}
          onNavigate={onNavigate}
          onSelectCourse={setSelectedCourse}
          onOpenPortal={onOpenPortal}
          onOpenProspectus={onOpenProspectus}
        />
      )}
      {route === 'about' && (
        <AboutSection data={data} onNavigate={onNavigate} onOpenProspectus={onOpenProspectus} />
      )}
      {route === 'courses' && (
        <CoursesSection
          courses={data.courses}
          onSelectCourse={setSelectedCourse}
          onApply={(courseId) => onNavigate('apply', courseId)}
        />
      )}
      {route === 'apply' && (
        <AdmissionSection
          courses={data.courses}
          centres={data.centres}
          preselectedCourseId={preselectedCourseId}
        />
      )}
      {route === 'notifications' && (
        <NotificationsSection notifications={data.notifications} />
      )}
      {route === 'gallery' && <GallerySection gallery={data.gallery} />}
      {route === 'franchise' && <FranchiseSection centres={data.centres} />}
      {route === 'contact' && (
        <ContactSection cms={data.cmsSettings} centres={data.centres} />
      )}
      {route === 'verify' && <CertificateVerifySection />}
      {route === 'blog' && <BlogSection blogs={data.blogs} />}
      {route === 'privacy' && <LegalSection mode="privacy" cms={data.cmsSettings} />}
      {route === 'terms' && <LegalSection mode="terms" cms={data.cmsSettings} />}

      {selectedCourse && (
        <CourseDetailModal
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onApply={() => {
            const id = selectedCourse.id;
            setSelectedCourse(null);
            onNavigate('apply', id);
          }}
        />
      )}
    </>
  );
}

function HomeSection({
  t,
  data,
  onNavigate,
  onSelectCourse,
  onOpenPortal,
  onOpenProspectus,
}: {
  t: (typeof TRANSLATIONS)['en'];
  data: BootstrapData;
  onNavigate: (r: PublicPageRoute, cId?: string) => void;
  onSelectCourse: (c: Course) => void;
  onOpenPortal: () => void;
  onOpenProspectus: () => void;
}) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMsg, setNewsletterMsg] = useState('');

  const featuredCourses = data.courses.filter((c) => c.featured).slice(0, 6);
  const latestNotices = data.notifications.slice(0, 4);

  async function handleNewsletter(e: FormEvent) {
    e.preventDefault();
    setNewsletterMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail }),
      });
      setNewsletterMsg(res.message);
      setNewsletterEmail('');
    } catch (err: unknown) {
      setNewsletterMsg(err instanceof Error ? err.message : 'Unable to subscribe.');
    }
  }

  return (
    <div className="space-y-20 pb-16">
      {/* Hero Banner */}
      <section className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
                {t.heroKicker}
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15]"
                style={{
                  textWrap: 'balance',
                  color: data.cmsSettings.primaryColor || '#0B1E3D',
                }}
              >
                {data.cmsSettings.heroTitle || t.heroTitle}
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                {data.cmsSettings.heroSubtitle || t.heroSubtitle}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('apply')}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                >
                  {t.applyNow}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {t.exploreCourses}
                </button>
                <button
                  type="button"
                  onClick={onOpenProspectus}
                  className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
                >
                  <FileText className="h-4 w-4" />
                  Download Prospectus
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                Admissions Open: {data.cmsSettings.admissionsOpenBatch} ·{' '}
                {data.cmsSettings.admissionInfoText}
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[280px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src={
                    data.branding?.websiteBannerUrl ||
                    '/src/assets/images/hero_campus_dhubri_1795532445456.jpg'
                  }
                  alt="Success Point Educational Institute Campus in Dhubri, Assam"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Full-width KPI Strip below Hero Split */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-[#0B1E3D] tabular-nums">
                {data.metrics.enrolledLearners.toLocaleString('en-IN')}+
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Learners Guided Across Assam
              </p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-[#0B1E3D] tabular-nums">
                {data.metrics.totalCourses}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Programs Across 11 Academic Tracks
              </p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-[#0B1E3D] tabular-nums">
                {data.metrics.activeCentres}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Active Centres &amp; Dhubri HQ
              </p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-[#0B1E3D] tabular-nums">
                {data.metrics.activeDistricts} Districts
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Multi-District Assam Presence
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Welcome + School/College/University Education Pillars */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
              Headquartered in Dhubri, Assam
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1E3D]">
              {t.welcomeHeading}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Located at GTB Road, Ward No. 12, Dhubri, Success Point serves school students,
              higher secondary learners, college undergraduates, job seekers, and working youth
              with structured classroom coaching, practical IT labs, and ethical academic
              consultancy.
            </p>
            <div className="grid gap-4 sm:grid-cols-3 pt-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-[#0B1E3D]">School &amp; HS</p>
                <p className="mt-1 text-xs text-slate-600">
                  SEBA, CBSE &amp; AHSEC Classes 8–12 conceptual mentoring.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-[#0B1E3D]">College &amp; ODL</p>
                <p className="mt-1 text-xs text-slate-600">
                  Undergraduate semester tutoring &amp; recognized distance guidance.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-[#0B1E3D]">Computer &amp; Skill</p>
                <p className="mt-1 text-xs text-slate-600">
                  DCA, PGDCA, Tally GST, Vocational &amp; ADRE exam readiness.
                </p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white aspect-[4/3]">
              <img
                src="/src/assets/images/about_seminar_hall_1795532446180.jpg"
                alt="Classroom mentoring session at Success Point"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
                Academic &amp; Skill Catalog
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1E3D]">
                Featured Programs Across Assam
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              View All {data.courses.length} Courses
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featuredCourses.map((course) => (
              <div
                key={course.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-6 hover:border-blue-300 transition-colors"
              >
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {course.category} · {course.mode} · {course.duration}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-[#0B1E3D] leading-snug">
                    {course.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                    {course.description}
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-slate-500 block">Program Fee</span>
                    <span className="font-mono text-base font-bold text-[#0B1E3D] tabular-nums">
                      ₹{course.fees.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectCourse(course)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      Syllabus
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('apply', course.id)}
                      className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us + Student Success Stories (Adjacent Claim-to-Proof) */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-4">
            <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
              Verified Institutional Standards
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1E3D]">
              {t.whyChooseTitle}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every student enrolled at Dhubri HQ or a partner district centre receives a
              verified Roll Number, digital attendance log, printable Admit Card, online
              assessment access, and QR-authenticated completion records.
            </p>
            <div className="pt-2 space-y-3">
              {[
                '01. Transparent fee receipts & zero hidden charges',
                '02. Bilingual classroom support (English, Assamese & Hindi)',
                '03. Dedicated computer labs & weekly OMR/CBT exam practice',
                '04. Ethical counseling with strict partner authorization clarity',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-slate-800">
                  <CheckCircle2 className="h-4 w-4 text-blue-700 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 grid gap-5 sm:grid-cols-2">
            {(data.cmsSettings.testimonials || []).slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                <p className="text-xs font-medium text-slate-500">
                  {item.role} · {item.location}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">&ldquo;{item.quote}&rdquo;</p>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-sm font-bold text-[#0B1E3D]">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Notifications & Events + Gallery Preview */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0B1E3D]">
                {t.notificationsTitle}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                All Notices
              </button>
            </div>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {latestNotices.map((n) => (
                <div key={n.id} className="p-4 space-y-1">
                  <p className="text-xs font-medium text-slate-500">
                    {n.category} · {n.district} · <span className="font-mono">{n.publishedAt}</span>
                  </p>
                  <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{n.summary}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0B1E3D]">
                Campus &amp; Activities Gallery
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('gallery')}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                Full Gallery
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {data.gallery.slice(0, 4).map((g) => (
                <div
                  key={g.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-slate-200">
                    <img
                      src={g.mediaUrl}
                      alt={g.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-medium text-slate-500">{g.category}</p>
                    <p className="text-xs font-semibold text-slate-900 truncate">{g.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Franchise Opportunity + Portal Callout */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-[#0B1E3D] text-white p-8 sm:p-10 grid gap-8 lg:grid-cols-12 items-center">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-semibold tracking-wider text-blue-300 uppercase">
              Assam &amp; India Expansion Network
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t.franchiseTitle}
            </h2>
            <p className="text-sm text-blue-100 leading-relaxed max-w-2xl">
              Partner with Success Point Dhubri to operate an authorized academic mentoring,
              computer training, or skill centre in Kokrajhar, Bongaigaon, Goalpara, Barpeta,
              Kamrup, Guwahati, Nalbari, or South Salmara-Mankachar with centralized ERP access.
            </p>
          </div>
          <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
            <button
              type="button"
              onClick={() => onNavigate('franchise')}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#0B1E3D] hover:bg-blue-50 whitespace-nowrap shrink-0"
            >
              Franchise Partner Form
            </button>
            <button
              type="button"
              onClick={onOpenPortal}
              className="rounded-lg border border-blue-400 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 whitespace-nowrap shrink-0"
            >
              Login to Portals
            </button>
          </div>
        </div>
      </section>

      {/* FAQ + Newsletter */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-2xl font-bold text-[#0B1E3D]">{t.faqTitle}</h2>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 p-4 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    <span>{item.q}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                  </button>
                  {isOpen && (
                    <p className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4 self-start">
          <h3 className="text-lg font-bold text-[#0B1E3D]">Admission &amp; Scholarship Alerts</h3>
          <p className="text-sm text-slate-600">
            Receive verified exam schedules, scholarship checklists, and batch opening dates from
            our Dhubri Head Office.
          </p>
          <form onSubmit={handleNewsletter} className="space-y-3">
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="Enter student or parent email"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#0B1E3D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 transition-colors"
            >
              Subscribe to Updates
            </button>
          </form>
          {newsletterMsg && <p className="text-xs font-medium text-blue-800">{newsletterMsg}</p>}
          <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-900">Dhubri Head Office</p>
            <p>{data.cmsSettings.headOfficeAddress}</p>
            <p className="font-mono">{data.cmsSettings.contactPhone} · {data.cmsSettings.officeHours}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AboutSection({
  data,
  onNavigate,
  onOpenProspectus,
}: {
  data: BootstrapData;
  onNavigate: (r: PublicPageRoute) => void;
  onOpenProspectus: () => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-14">
      <div className="grid gap-10 lg:grid-cols-12 items-center">
        <div className="lg:col-span-7 space-y-4">
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            Established in Dhubri, Assam
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0B1E3D]">
            About Success Point Educational Institute
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            {data.cmsSettings.aboutSummary ||
              `Founded to expand structured academic support, practical computer literacy, and honest higher-education guidance across Dhubri and Western Assam, Success Point now coordinates ${data.metrics.activeCentres} centres across ${data.metrics.activeDistricts} Assam districts.`}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onOpenProspectus}
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              View Digital Prospectus
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Visit Dhubri Campus
            </button>
          </div>
        </div>
        <div className="lg:col-span-5">
          <img
            src="/src/assets/images/about_seminar_hall_1795532446180.jpg"
            alt="Success Point Smart Classroom"
            referrerPolicy="no-referrer"
            className="w-full rounded-xl border border-slate-200 object-cover aspect-[4/3]"
          />
        </div>
      </div>

      {/* Vision, Mission, Objectives, Philosophy */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Our Vision',
            body: data.cmsSettings.visionText,
          },
          {
            title: 'Our Mission',
            body: data.cmsSettings.missionText,
          },
          {
            title: 'Core Objectives',
            body: 'Deliver measurable classroom outcomes, weekly test evaluation, transparent record-keeping, and digital readiness for youth.',
          },
          {
            title: 'Educational Philosophy',
            body: 'Bilingual clarity, disciplined practice, ethical academic counseling, and respect for statutory board & university regulations.',
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-6 space-y-2">
            <h3 className="text-base font-bold text-[#0B1E3D]">{card.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      {/* Director's Message */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 grid gap-8 lg:grid-cols-12 items-center">
        <div className="lg:col-span-3">
          <img
            src="/src/assets/images/director_portrait_1795532446995.jpg"
            alt={data.cmsSettings.directorName}
            referrerPolicy="no-referrer"
            className="w-48 h-48 mx-auto rounded-xl object-cover border border-slate-200"
          />
        </div>
        <div className="lg:col-span-9 space-y-3">
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            Director&apos;s Message
          </p>
          <h2 className="text-2xl font-bold text-[#0B1E3D]">{data.cmsSettings.directorName}</h2>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            {data.cmsSettings.directorMessage}
          </p>
        </div>
      </div>

      {/* Team, Infrastructure & Legal Compliance Disclosure */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-lg font-bold text-[#0B1E3D]">Leadership &amp; Faculty Team</h3>
          <div className="divide-y divide-slate-200 text-sm">
            {[
              { name: 'Dr. Rafiqul Islam', role: 'Founder & Academic Director, Dhubri HQ' },
              { name: 'Subhajit Roy', role: 'Head of Computer Science & IT Labs' },
              { name: 'Farhana Begum', role: 'Senior Admissions & Student Support Officer' },
              { name: 'Sanjay Barman', role: 'District Network & Assessment Coordinator' },
            ].map((member) => (
              <div key={member.name} className="py-3 flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-900">{member.name}</span>
                <span className="text-xs text-slate-600 text-right">{member.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-lg font-bold text-[#0B1E3D]">
            Institutional Partnerships &amp; Compliance Notice
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {data.cmsSettings.legalDisclaimer}
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-900">Campus Infrastructure Highlights:</p>
            <p>· 12 Smart Classrooms with projector &amp; bilingual learning aids at Dhubri HQ</p>
            <p>· 45-Workstation Computer Lab with Tally Prime, Python, Web &amp; Typing suites</p>
            <p>· Centralized Student Portal, Admit Card &amp; QR Certificate Registry</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoursesSection({
  courses,
  onSelectCourse,
  onApply,
}: {
  courses: Course[];
  onSelectCourse: (c: Course) => void;
  onApply: (courseId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');

  const filtered = courses.filter((c) => {
    const matchesCat = category === 'All' || c.category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            11 Authorized Program Categories
          </p>
          <h1 className="mt-1 text-3xl font-bold text-[#0B1E3D]">
            Explore Courses &amp; Academic Programs
          </h1>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses, DCA, ADRE, Class 10..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm focus:border-blue-700 focus:outline-none"
          />
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setCategory('All')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            category === 'All'
              ? 'bg-[#0B1E3D] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Programs ({courses.length})
        </button>
        {COURSE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              category === cat
                ? 'bg-[#0B1E3D] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
          No courses match your filter. Try clearing the search query.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => (
            <div
              key={course.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
            >
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-slate-500">
                  <span className="font-mono text-blue-800">{course.code}</span> · {course.category}
                </p>
                <h3 className="text-lg font-bold text-[#0B1E3D] leading-snug">{course.name}</h3>
                <p className="text-sm text-slate-600">{course.description}</p>
                <div className="pt-2 space-y-1 text-xs text-slate-600">
                  <p>
                    <strong className="text-slate-800">Eligibility:</strong> {course.eligibility}
                  </p>
                  <p>
                    <strong className="text-slate-800">Duration:</strong> {course.duration} · Mode:{' '}
                    {course.mode}
                  </p>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 block">Tuition Fee</span>
                  <span className="font-mono text-base font-bold text-[#0B1E3D] tabular-nums">
                    ₹{course.fees.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectCourse(course)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Full Syllabus
                  </button>
                  <button
                    type="button"
                    onClick={() => onApply(course.id)}
                    className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                  >
                    Apply Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseDetailModal({
  course,
  onClose,
  onApply,
}: {
  course: Course;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-mono font-semibold text-blue-700">
              {course.code} · {course.category}
            </p>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#0B1E3D]">{course.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close course details"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{course.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
          <div>
            <p className="text-slate-500">Duration</p>
            <p className="mt-0.5 font-semibold text-slate-900">{course.duration}</p>
          </div>
          <div>
            <p className="text-slate-500">Mode</p>
            <p className="mt-0.5 font-semibold text-slate-900">{course.mode}</p>
          </div>
          <div>
            <p className="text-slate-500">Program Fee</p>
            <p className="mt-0.5 font-mono font-bold text-blue-800">
              ₹{course.fees.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Eligibility</p>
            <p className="mt-0.5 font-semibold text-slate-900">{course.eligibility}</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 text-sm">
          <div>
            <h3 className="font-bold text-[#0B1E3D] mb-2">Syllabus Outline</h3>
            <ul className="space-y-1.5 text-xs text-slate-700">
              {course.syllabus.map((s) => (
                <li key={s}>· {s}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-[#0B1E3D] mb-1.5">Admission Requirements</h3>
              <ul className="space-y-1 text-xs text-slate-700">
                {course.admissionRequirements.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-[#0B1E3D] mb-1.5">Career Opportunities</h3>
              <ul className="space-y-1 text-xs text-slate-700">
                {course.careerOpportunities.map((o) => (
                  <li key={o}>· {o}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <strong>Authorization Scope:</strong> {course.authorizationNote}
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Apply Now for This Course
          </button>
        </div>
      </div>
    </div>
  );
}

function AdmissionSection({
  courses,
  centres,
  preselectedCourseId,
}: {
  courses: Course[];
  centres: Centre[];
  preselectedCourseId?: string;
}) {
  const [form, setForm] = useState({
    fullName: '',
    fatherName: '',
    motherName: '',
    dob: '',
    gender: 'Male',
    mobile: '',
    email: '',
    address: '',
    state: 'Assam',
    district: 'Dhubri',
    pinCode: '',
    qualification: 'Class 12 / AHSEC Passed',
    courseId: preselectedCourseId || courses[0]?.id || '',
    centreId: centres[0]?.id || '',
  });
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [documentDataUrl, setDocumentDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedApp, setSubmittedApp] = useState<{
    applicationId: string;
    courseName: string;
    centreName: string;
    status: string;
  } | null>(null);

  // Tracker state
  const [trackId, setTrackId] = useState('SPEI-2026-1042');
  const [trackMobile, setTrackMobile] = useState('9854011223');
  const [trackResult, setTrackResult] = useState<{
    applicationId: string;
    fullName: string;
    courseName: string;
    centreName: string;
    district: string;
    status: string;
    remarks: string;
  } | null>(null);
  const [trackError, setTrackError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        applicationId: string;
        courseName: string;
        centreName: string;
        status: string;
      }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ ...form, photoDataUrl, documentDataUrl }),
      });
      setSubmittedApp(res);
      setTrackId(res.applicationId);
      setTrackMobile(form.mobile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit application.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTrack(e: FormEvent) {
    e.preventDefault();
    setTrackError('');
    setTrackResult(null);
    try {
      const res = await apiRequest<NonNullable<typeof trackResult>>(
        `/api/applications/track?applicationId=${encodeURIComponent(
          trackId
        )}&mobile=${encodeURIComponent(trackMobile)}`
      );
      setTrackResult(res);
    } catch (err: unknown) {
      setTrackError(err instanceof Error ? err.message : 'Application not found.');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 grid gap-10 lg:grid-cols-12 items-start">
      <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            Online Admission Portal
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1E3D]">
            Student Admission Application Form
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit your details for Dhubri Head Office or any authorized Assam district centre.
          </p>
        </div>

        {submittedApp ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
              <CheckCircle2 className="h-6 w-6" />
              <span>Application Submitted Successfully</span>
            </div>
            <p className="text-sm text-slate-700">
              Your unique Application ID is{' '}
              <strong className="font-mono text-[#0B1E3D]">{submittedApp.applicationId}</strong>.
              Save this ID to track verification and admission approval.
            </p>
            <div className="text-xs text-slate-700 space-y-1 pt-1">
              <p>Course: {submittedApp.courseName}</p>
              <p>Centre: {submittedApp.centreName}</p>
              <p>Current Status: {submittedApp.status}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubmittedApp(null)}
              className="mt-2 rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900"
            >
              Submit Another Application
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Student Full Name *
                </label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Father&apos;s Name *
                </label>
                <input
                  required
                  value={form.fatherName}
                  onChange={(e) => setForm({ ...form, fatherName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mother&apos;s Name *
                </label>
                <input
                  required
                  value={form.motherName}
                  onChange={(e) => setForm({ ...form, motherName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number *
                </label>
                <input
                  required
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Postal Address *
              </label>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="House / Ward / Village / Road"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State *</label>
                <input
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  District *
                </label>
                <select
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {ASSAM_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Code *
                </label>
                <input
                  required
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                  placeholder="783301"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Highest Qualification *
                </label>
                <input
                  required
                  value={form.qualification}
                  onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preferred Study Centre *
                </label>
                <select
                  value={form.centreId}
                  onChange={(e) => setForm({ ...form, centreId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.district} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selected Course / Program *
              </label>
              <select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.category}] {c.name} (₹{c.fees.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-dashed border-slate-300 p-3.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1.5">
                  <Upload className="h-4 w-4 text-blue-700" />
                  <span>Student Photograph (JPG/PNG, max 1.8MB)</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoDataUrl(await readFileAsDataUrl(file));
                  }}
                  className="text-xs text-slate-600 w-full"
                />
                {photoDataUrl && <p className="mt-1 text-[11px] text-emerald-700">Photo attached</p>}
              </div>

              <div className="rounded-lg border border-dashed border-slate-300 p-3.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1.5">
                  <Upload className="h-4 w-4 text-blue-700" />
                  <span>Marksheet / ID Document (PDF/JPG/PNG)</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setDocumentDataUrl(await readFileAsDataUrl(file));
                  }}
                  className="text-xs text-slate-600 w-full"
                />
                {documentDataUrl && (
                  <p className="mt-1 text-[11px] text-emerald-700">Document attached</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting Application...' : 'Submit Online Admission Application'}
            </button>
          </form>
        )}
      </div>

      {/* Application Status Tracker */}
      <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#0B1E3D]">Application Status Tracker</h2>
        <p className="text-xs text-slate-600">
          Enter your Application ID (e.g. sample <span className="font-mono">SPEI-2026-1042</span>)
          and registered mobile number to check live office status.
        </p>
        <form onSubmit={handleTrack} className="space-y-3">
          <input
            required
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            placeholder="SPEI-2026-XXXX"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <input
            required
            value={trackMobile}
            onChange={(e) => setTrackMobile(e.target.value)}
            placeholder="Registered Mobile Number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-[#0B1E3D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900"
          >
            Check Application Status
          </button>
        </form>

        {trackError && <p className="text-xs text-red-700">{trackError}</p>}
        {trackResult && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-xs">
            <p className="font-mono font-bold text-blue-800">{trackResult.applicationId}</p>
            <p className="font-semibold text-slate-900 text-sm">{trackResult.fullName}</p>
            <p className="text-slate-600">Course: {trackResult.courseName}</p>
            <p className="text-slate-600">Centre: {trackResult.centreName}</p>
            <p className="pt-1 font-semibold text-slate-900">Status: {trackResult.status}</p>
            <p className="text-slate-600">Remarks: {trackResult.remarks}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsSection({ notifications }: { notifications: NotificationItem[] }) {
  const categories: ('All' | NotificationCategory)[] = [
    'All',
    'Admission',
    'Examination',
    'Result',
    'Announcement',
    'Holiday',
    'Scholarship',
    'Job',
    'Event',
  ];
  const [filter, setFilter] = useState<'All' | NotificationCategory>('All');
  const filtered =
    filter === 'All' ? notifications : notifications.filter((n) => n.category === filter);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
          Digital Notice Board
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[#0B1E3D]">
          Institutional Notifications &amp; Circulars
        </h1>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              filter === cat ? 'bg-[#0B1E3D] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {filtered.map((n) => (
          <div key={n.id} className="p-6 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {n.category} · {n.district} {n.isPinned ? '· Pinned Notice' : ''}
              </span>
              <span className="font-mono">{n.publishedAt}</span>
            </div>
            <h3 className="text-lg font-bold text-[#0B1E3D]">{n.title}</h3>
            <p className="text-sm text-slate-700 leading-relaxed">{n.content}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            No notifications in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}

function GallerySection({ gallery }: { gallery: GalleryItem[] }) {
  const cats = ['All', 'Campus', 'Seminar', 'Activities', 'Certificate', 'Events', 'Photo', 'Video'];
  const [cat, setCat] = useState('All');
  const items = cat === 'All' ? gallery : gallery.filter((g) => g.category === cat);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
          Campus &amp; Event Archive
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[#0B1E3D]">Photo &amp; Activities Gallery</h1>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              cat === c ? 'bg-[#0B1E3D] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="aspect-[4/3] overflow-hidden bg-slate-100">
              <img
                src={item.mediaUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5 space-y-1">
              <p className="text-xs text-slate-500">
                {item.category} · <span className="font-mono">{item.date}</span>
              </p>
              <h3 className="text-base font-bold text-[#0B1E3D]">{item.title}</h3>
              <p className="text-xs text-slate-600">{item.caption}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FranchiseSection({ centres }: { centres: Centre[] }) {
  const [districtFilter, setDistrictFilter] = useState('All');
  const [form, setForm] = useState({
    applicantName: '',
    organizationName: '',
    mobile: '',
    email: '',
    address: '',
    district: 'Goalpara',
    state: 'Assam',
    proposedLocation: '',
    infrastructureDetails: '',
    experience: '',
  });
  const [docDataUrl, setDocDataUrl] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrMsg('');
    setStatusMsg('');
    try {
      const res = await apiRequest<{ centreCode: string; message: string }>(
        '/api/franchise/apply',
        {
          method: 'POST',
          body: JSON.stringify({ ...form, documentDataUrl: docDataUrl }),
        }
      );
      setStatusMsg(`${res.message} Reference Code: ${res.centreCode}`);
      setForm({
        applicantName: '',
        organizationName: '',
        mobile: '',
        email: '',
        address: '',
        district: 'Goalpara',
        state: 'Assam',
        proposedLocation: '',
        infrastructureDetails: '',
        experience: '',
      });
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to submit franchise application.');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
          Multi-District Educational Network
        </p>
        <h1 className="text-3xl font-bold text-[#0B1E3D]">
          Assam Franchise Centre Locator &amp; Partner Program
        </h1>
        <p className="text-sm sm:text-base text-slate-600 max-w-3xl">
          Operate an authorized Success Point study and computer skill centre in your district.
          Every franchise centre receives centralized portal access, study modules, exam
          coordination, and transparent revenue-sharing ledgers after Head Office approval.
        </p>
      </div>

      {/* District Map Locator */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[#0B1E3D]">
            Interactive District Centre Locator
          </h2>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="All">All Districts ({centres.length} Centres)</option>
            {Array.from(new Set(centres.map((c) => c.district))).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <CentreLocatorMap centres={centres} selectedDistrict={districtFilter} />
      </div>

      {/* Benefits, Eligibility, Requirements + Application Form */}
      <div className="grid gap-10 lg:grid-cols-12 items-start">
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-2">
            <h3 className="text-base font-bold text-[#0B1E3D]">Franchise Partner Benefits</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              · Centralized Student Admission, Fee Ledger &amp; Commission Portal
              <br />· Standardized DCA, PGDCA, School &amp; Competitive study curricula
              <br />· Dhubri Head Office academic support &amp; QR-verified certification workflow
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-2">
            <h3 className="text-base font-bold text-[#0B1E3D]">Eligibility &amp; Infrastructure</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              · Registered Trust / Society / Proprietorship or dedicated educator
              <br />· Minimum 800–1,200 sq. ft. commercial/academic floor space
              <br />· At least 2 classrooms, 10–15 functional PCs, broadband &amp; power backup
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
          <h2 className="text-xl font-bold text-[#0B1E3D]">Become Our Franchise Partner</h2>
          {statusMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {statusMsg}
            </div>
          )}
          {errMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errMsg}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                required
                placeholder="Applicant Full Name *"
                value={form.applicantName}
                onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Organization / Trust Name *"
                value={form.organizationName}
                onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Mobile Number *"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Official Email *"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {ASSAM_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="State (e.g. Assam) *"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              required
              placeholder="Applicant Full Address *"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Proposed Centre Location (Town / Locality) *"
              value={form.proposedLocation}
              onChange={(e) => setForm({ ...form, proposedLocation: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              required
              rows={2}
              placeholder="Infrastructure Details (Sq ft, Classrooms, Number of PCs) *"
              value={form.infrastructureDetails}
              onChange={(e) => setForm({ ...form, infrastructureDetails: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Prior Education / Training Experience *"
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="rounded-lg border border-dashed border-slate-300 p-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload Proposal / Premises Document (PDF/JPG/PNG)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setDocDataUrl(await readFileAsDataUrl(file));
                }}
                className="text-xs text-slate-600 w-full"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Submit Franchise Application for Admin Approval
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ContactSection({ cms, centres }: { cms: CmsSettings; centres: Centre[] }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    district: 'Dhubri',
    subject: '',
    message: '',
  });
  const [reply, setReply] = useState('');

  async function submitEnquiry(e: FormEvent) {
    e.preventDefault();
    setReply('');
    try {
      const res = await apiRequest<{ message: string }>('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setReply(res.message);
      setForm({ name: '', phone: '', email: '', district: 'Dhubri', subject: '', message: '' });
    } catch (err: unknown) {
      setReply(err instanceof Error ? err.message : 'Unable to send enquiry.');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-5">
          <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
            Head Office &amp; Counseling Desk
          </p>
          <h1 className="text-3xl font-bold text-[#0B1E3D]">Contact Success Point</h1>
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Head Office Address</p>
                <p className="text-slate-600">{cms.headOfficeAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Phone &amp; Helpline</p>
                <p className="font-mono text-slate-700">
                  {cms.contactPhone}
                  {cms.secondaryPhone ? ` · ${cms.secondaryPhone}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Official Email</p>
                <p className="text-slate-700">{cms.officialEmail}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Office Working Hours</p>
                <p className="text-slate-600">{cms.officeHours}</p>
              </div>
            </div>
            <a
              href={`https://wa.me/${cms.whatsappNumber}?text=${encodeURIComponent(
                'Hello Success Point Educational Institute Dhubri, I would like admission/course information.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <MessageSquare className="h-4 w-4" />
              Chat on WhatsApp Counseling Desk
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
          <h2 className="text-xl font-bold text-[#0B1E3D]">Send an Academic Enquiry</h2>
          {reply && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-900">
              {reply}
            </div>
          )}
          <form onSubmit={submitEnquiry} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                required
                placeholder="Your Full Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Mobile Number *"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {ASSAM_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <input
              placeholder="Subject (e.g. Admission Enquiry / Franchise)"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              required
              rows={4}
              placeholder="How can our academic counselors assist you? *"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Submit Enquiry
            </button>
          </form>
        </div>
      </div>

      <CentreLocatorMap centres={centres} selectedDistrict="Dhubri" heightClass="h-[360px]" />
    </div>
  );
}

function CertificateVerifySection() {
  const initialParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('cert') || 'SPEI-CERT-2026-1001'
      : 'SPEI-CERT-2026-1001';
  const [certNo, setCertNo] = useState(initialParam);
  const [result, setResult] = useState<CertificateRecord | null>(null);
  const [error, setError] = useState('');

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      const res = await apiRequest<CertificateRecord>(
        `/api/certificates/verify/${encodeURIComponent(certNo.trim())}`
      );
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Certificate not found.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 space-y-6">
      <div className="text-center space-y-2">
        <ShieldCheck className="h-10 w-10 text-blue-700 mx-auto" />
        <h1 className="text-3xl font-bold text-[#0B1E3D]">Certificate Verification Portal</h1>
        <p className="text-sm text-slate-600">
          Verify institutional training certificates issued by Success Point Educational Institute
          (sample certificate: <span className="font-mono">SPEI-CERT-2026-1001</span>).
        </p>
      </div>

      <form onSubmit={verify} className="flex gap-2">
        <input
          required
          value={certNo}
          onChange={(e) => setCertNo(e.target.value)}
          placeholder="Enter Certificate Number (e.g. SPEI-CERT-2026-1001)"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-mono"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          Verify Now
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-white p-6 space-y-3">
          {result.isSample && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 uppercase">
              SAMPLE DEMONSTRATION RECORD — FOR VERIFICATION TESTING ONLY
            </div>
          )}
          <p className="text-xs font-semibold text-emerald-700 uppercase">
            Verified {result.documentType || 'Certificate'} · {result.status}
          </p>
          <h3 className="text-xl font-bold text-[#0B1E3D]">{result.studentName}</h3>
          <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
            <p>
              <strong>Document No:</strong>{' '}
              <span className="font-mono">{result.certificateNo}</span>
            </p>
            <p>
              <strong>Grade / Result:</strong> <span className="font-mono">{result.grade}</span>
            </p>
            <p className="sm:col-span-2">
              <strong>Course:</strong> {result.courseName}
            </p>
            <p>
              <strong>Centre:</strong> {result.centreName}
            </p>
            <p>
              <strong>Issue Date:</strong> <span className="font-mono">{result.issueDate}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BlogSection({ blogs }: { blogs: BlogArticle[] }) {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-wider text-blue-700 uppercase">
          Scholarships, Careers &amp; Academic Guides
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[#0B1E3D]">
          Educational News &amp; Career Updates
        </h1>
      </div>
      <div className="space-y-6">
        {blogs.map((b) => (
          <article
            key={b.id}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-2.5"
          >
            <p className="text-xs text-slate-500">
              {b.category} · {b.author} · <span className="font-mono">{b.publishedAt}</span>
            </p>
            <h2 className="text-xl font-bold text-[#0B1E3D]">{b.title}</h2>
            <p className="text-sm font-medium text-slate-700">{b.summary}</p>
            <p className="text-sm text-slate-600 leading-relaxed">{b.content}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function LegalSection({ mode, cms }: { mode: 'privacy' | 'terms'; cms: CmsSettings }) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 space-y-6">
      <h1 className="text-3xl font-bold text-[#0B1E3D]">
        {mode === 'privacy' ? 'Privacy Policy & Data Protection' : 'Terms, Conditions & Compliance'}
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4 text-sm text-slate-700 leading-relaxed">
        {mode === 'privacy' ? (
          <>
            {cms.privacyPolicyText && <p>{cms.privacyPolicyText}</p>}
            <p>
              Success Point Educational Institute ({cms.headOfficeAddress}) collects student,
              parent, staff, and franchise partner data strictly for academic admissions,
              attendance tracking, assessment records, and institutional communication.
            </p>
            <p>
              Uploaded identity documents and photographs are stored in access-controlled server
              directories and are never sold or shared with unauthorized third parties.
            </p>
            <p>
              Interactive maps on this website integrate Google Maps Platform features and are
              subject to the{' '}
              <a
                href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                Google Privacy Policy
              </a>
              .
            </p>
          </>
        ) : (
          <>
            {cms.termsText && <p>{cms.termsText}</p>}
            <p>
              <strong>Institutional Scope &amp; Non-Affiliation Disclaimer:</strong>{' '}
              {cms.legalDisclaimer}
            </p>
            <p>
              <strong>Admissions &amp; Fees:</strong> Admission into any coaching or skill batch is
              subject to document verification at Dhubri HQ or the selected district centre.
            </p>
            <p>
              <strong>Maps Service Terms:</strong> By using our District Centre Locator, you agree
              to be bound by the{' '}
              <a
                href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                Google Maps / Google Earth Additional Terms of Service
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
