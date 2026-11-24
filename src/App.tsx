import { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  Menu,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { apiRequest } from './lib/api';
import { TRANSLATIONS } from './lib/i18n';
import type { Language } from './types/institute';
import { PublicPages } from './components/PublicPages';
import type { BootstrapData, PublicPageRoute } from './components/PublicPages';
import { PortalHub } from './components/PortalHub';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { WhatsAppWidget } from './components/WhatsAppWidget';

type AppRoute = PublicPageRoute | 'portal' | 'super-admin-login' | 'super-admin-dashboard';

function pathToRoute(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const map: Record<string, AppRoute> = {
    '/': 'home',
    '/about': 'about',
    '/courses': 'courses',
    '/apply': 'apply',
    '/notifications': 'notifications',
    '/gallery': 'gallery',
    '/franchise': 'franchise',
    '/contact': 'contact',
    '/verify': 'verify',
    '/blog': 'blog',
    '/privacy': 'privacy',
    '/terms': 'terms',
    '/portal': 'portal',
    '/super-admin': 'super-admin-login',
    '/super-admin/login': 'super-admin-login',
    '/super-admin/dashboard': 'super-admin-dashboard',
  };
  return map[clean] || 'home';
}

function routeToPath(route: AppRoute): string {
  if (route === 'home') return '/';
  if (route === 'super-admin-login') return '/super-admin/login';
  if (route === 'super-admin-dashboard') return '/super-admin/dashboard';
  return `/${route}`;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => pathToRoute(window.location.pathname));
  const [lang, setLang] = useState<Language>('en');
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [preselectedCourseId, setPreselectedCourseId] = useState<string | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [prospectusOpen, setProspectusOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await apiRequest<BootstrapData>('/api/public/bootstrap');
      setData(res);
      setLoadError('');
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to institute server.');
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const titles: Record<AppRoute, string> = {
      home:
        data?.cmsSettings?.seoTitle ||
        'Success Point Educational Institute – Dhubri, Assam | Courses & Admissions',
      about: 'About Us – Success Point Educational Institute, Dhubri',
      courses: 'Courses & Programs (11 Categories) – Success Point Educational Institute',
      apply: 'Online Admission & Application Tracker – Success Point Dhubri',
      notifications: 'Notice Board & Circulars – Success Point Educational Institute',
      gallery: 'Campus & Event Gallery – Success Point Educational Institute',
      franchise: 'Assam Franchise Network & Centre Locator – Success Point',
      contact: 'Contact Dhubri Head Office – Success Point Educational Institute',
      verify: 'Verify QR Certificate – Success Point Educational Institute',
      blog: 'Educational News & Scholarship Guides – Success Point',
      privacy: 'Privacy Policy – Success Point Educational Institute',
      terms: 'Terms & Legal Compliance – Success Point Educational Institute',
      portal: 'Student, Staff, Franchise & Admin Portals – Success Point',
      'super-admin-login': 'Super Admin Login – Success Point Educational Institute',
      'super-admin-dashboard': 'Super Admin Dashboard – Success Point Educational Institute',
    };
    document.title = titles[route];

    if (data?.cmsSettings?.seoDescription) {
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) descMeta.setAttribute('content', data.cmsSettings.seoDescription);
    }

    if (data?.branding?.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = data.branding.faviconUrl;
    }
  }, [route, data]);

  function navigate(nextRoute: AppRoute, courseId?: string) {
    if (courseId) setPreselectedCourseId(courseId);
    setRoute(nextRoute);
    setMobileMenuOpen(false);
    setSearchOpen(false);
    const nextPath = routeToPath(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const t = TRANSLATIONS[lang];

  const searchResults =
    data && searchQuery.trim()
      ? {
          courses: data.courses.filter(
            (c) =>
              c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              c.category.toLowerCase().includes(searchQuery.toLowerCase())
          ),
          notices: data.notifications.filter((n) =>
            n.title.toLowerCase().includes(searchQuery.toLowerCase())
          ),
          centres: data.centres.filter(
            (c) =>
              c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              c.district.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }
      : null;

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
      style={{
        fontFamily: data?.cmsSettings?.fontPreset
          ? `"${data.cmsSettings.fontPreset}", system-ui, sans-serif`
          : undefined,
      }}
    >
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm no-print">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Non-sticky Announcement & Language / Search Utility Strip */}
      <div
        className="text-slate-100 text-xs no-print"
        style={{ backgroundColor: data?.cmsSettings?.primaryColor || '#0B1E3D' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-3">
          <p className="truncate max-w-2xl text-blue-100">
            {data?.cmsSettings.announcementText ||
              'Admissions Open for 2026–27 Session · Dhubri Head Office & Assam District Centres'}
          </p>
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 text-blue-100 hover:text-white whitespace-nowrap"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
            </button>
            <div className="flex items-center gap-1 border-l border-blue-900 pl-3">
              <Globe className="h-3.5 w-3.5 text-blue-300" />
              {(['en', 'hi', 'as'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                    lang === code ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white'
                  }`}
                >
                  {code === 'en' ? 'EN' : code === 'hi' ? 'हिं' : 'অস'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Bar Contract: Single-row, strictly 3 zones */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 no-print">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark + Optional Uploaded Logo */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-[#0B1E3D] whitespace-nowrap shrink-0"
          >
            {data?.branding?.websiteLogoUrl && (
              <img
                src={data.branding.websiteLogoUrl}
                alt="Success Point Logo"
                className="h-9 w-auto object-contain"
              />
            )}
            <span>{t.brandShort}</span>
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigate('courses')}
              className={`hover:text-[#0B1E3D] hover:underline underline-offset-4 whitespace-nowrap shrink-0 ${
                route === 'courses' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {lang === 'en' ? data?.cmsSettings?.navMenus?.courses || t.navCourses : t.navCourses}
            </button>
            <button
              type="button"
              onClick={() => navigate('apply')}
              className={`hover:text-[#0B1E3D] hover:underline underline-offset-4 whitespace-nowrap shrink-0 ${
                route === 'apply' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {lang === 'en'
                ? data?.cmsSettings?.navMenus?.admissions || t.navAdmissions
                : t.navAdmissions}
            </button>
            <button
              type="button"
              onClick={() => navigate('franchise')}
              className={`hover:text-[#0B1E3D] hover:underline underline-offset-4 whitespace-nowrap shrink-0 ${
                route === 'franchise' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {lang === 'en' ? data?.cmsSettings?.navMenus?.centres || t.navCentres : t.navCentres}
            </button>
            <button
              type="button"
              onClick={() => navigate('notifications')}
              className={`hover:text-[#0B1E3D] hover:underline underline-offset-4 whitespace-nowrap shrink-0 ${
                route === 'notifications' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {lang === 'en' ? data?.cmsSettings?.navMenus?.notices || t.navNotices : t.navNotices}
            </button>
            <button
              type="button"
              onClick={() => navigate('portal')}
              className={`hover:text-[#0B1E3D] hover:underline underline-offset-4 whitespace-nowrap shrink-0 ${
                route === 'portal' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {lang === 'en' ? data?.cmsSettings?.navMenus?.portals || t.navPortals : t.navPortals}
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('apply')}
              className="hidden md:inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              {t.applyNow}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="md:hidden rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2 text-sm">
            {(
              [
                ['home', 'Home'],
                ['about', 'About Us'],
                ['courses', t.navCourses],
                ['apply', t.navAdmissions],
                ['franchise', 'Franchise & Centres'],
                ['notifications', t.navNotices],
                ['gallery', 'Gallery'],
                ['verify', 'Verify Certificate'],
                ['contact', 'Contact Us'],
                ['portal', 'Student / Staff / Admin Portals'],
              ] as [AppRoute, string][]
            ).map(([r, label]) => (
              <button
                key={r}
                type="button"
                onClick={() => navigate(r)}
                className="block w-full text-left rounded-lg px-3 py-2.5 font-medium text-slate-800 hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {loadError && !data ? (
          <div className="mx-auto max-w-xl px-4 py-16 text-center space-y-3">
            <p className="text-sm text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={loadBootstrap}
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
            >
              Retry Connection
            </button>
          </div>
        ) : !data ? (
          <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-slate-500">
            Loading Success Point Educational Institute...
          </div>
        ) : route === 'portal' ? (
          <PortalHub
            courses={data.courses}
            branding={data.branding}
            onDataMutated={loadBootstrap}
            onOpenSuperAdminPortal={() => navigate('super-admin-login')}
          />
        ) : route === 'super-admin-login' || route === 'super-admin-dashboard' ? (
          <SuperAdminPortal
            mode={route === 'super-admin-dashboard' ? 'dashboard' : 'login'}
            branding={data.branding}
            onNavigateDashboard={() => navigate('super-admin-dashboard')}
            onNavigateLogin={() => navigate('super-admin-login')}
            onDataMutated={loadBootstrap}
          />
        ) : (
          <PublicPages
            route={route}
            lang={lang}
            data={data}
            onNavigate={(r, cId) => navigate(r, cId)}
            preselectedCourseId={preselectedCourseId}
            onOpenPortal={() => navigate('portal')}
            onOpenProspectus={() => setProspectusOpen(true)}
          />
        )}
      </main>

      {/* Institutional Footer */}
      <footer
        className="text-slate-300 border-t border-slate-800 no-print"
        style={{ backgroundColor: data?.cmsSettings?.primaryColor || '#0B1E3D' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="space-y-3">
            <p className="text-base font-bold text-white">
              {data?.cmsSettings?.instituteName || 'Success Point Educational Institute'}
            </p>
            <p className="leading-relaxed text-slate-300">
              {data?.cmsSettings.headOfficeAddress || 'GTB Road, Ward No. 12, Dhubri, Assam 783301'}
            </p>
            <p className="font-mono text-blue-200">
              {data?.cmsSettings.contactPhone || '+91-94350-78301'}
            </p>
            {data?.cmsSettings?.socialLinks && (
              <div className="flex flex-wrap gap-3 pt-1 text-blue-200">
                {data.cmsSettings.socialLinks.facebook && (
                  <a
                    href={data.cmsSettings.socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white underline"
                  >
                    Facebook
                  </a>
                )}
                {data.cmsSettings.socialLinks.youtube && (
                  <a
                    href={data.cmsSettings.socialLinks.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white underline"
                  >
                    YouTube
                  </a>
                )}
                {data.cmsSettings.socialLinks.instagram && (
                  <a
                    href={data.cmsSettings.socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white underline"
                  >
                    Instagram
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-white">Institution</p>
            <div className="flex flex-col gap-1.5 items-start">
              <button type="button" onClick={() => navigate('about')} className="hover:text-white">
                About Us &amp; Director
              </button>
              <button type="button" onClick={() => navigate('courses')} className="hover:text-white">
                All 11 Course Categories
              </button>
              <button type="button" onClick={() => navigate('gallery')} className="hover:text-white">
                Campus &amp; Event Gallery
              </button>
              <button type="button" onClick={() => navigate('blog')} className="hover:text-white">
                Scholarships &amp; Career News
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-white">Student &amp; Partner Services</p>
            <div className="flex flex-col gap-1.5 items-start">
              <button type="button" onClick={() => navigate('apply')} className="hover:text-white">
                Apply Online &amp; Track Status
              </button>
              <button type="button" onClick={() => navigate('portal')} className="hover:text-white">
                Student / Staff / Admin Portals
              </button>
              <button type="button" onClick={() => navigate('franchise')} className="hover:text-white">
                Assam Franchise Locator
              </button>
              <button type="button" onClick={() => navigate('verify')} className="hover:text-white">
                QR Certificate Verification
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-white">Compliance &amp; Resources</p>
            <div className="flex flex-col gap-1.5 items-start">
              <button
                type="button"
                onClick={() => setProspectusOpen(true)}
                className="hover:text-white"
              >
                Download Digital Prospectus
              </button>
              <button type="button" onClick={() => navigate('contact')} className="hover:text-white">
                Contact &amp; WhatsApp Desk
              </button>
              <button type="button" onClick={() => navigate('privacy')} className="hover:text-white">
                Privacy Policy
              </button>
              <button type="button" onClick={() => navigate('terms')} className="hover:text-white">
                Terms &amp; Legal Disclaimer
              </button>
              <a href="/sitemap.xml" className="hover:text-white">
                XML Sitemap
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-slate-400">
            <p className="max-w-3xl leading-relaxed">
              {data?.cmsSettings.legalDisclaimer}
            </p>
            <p className="whitespace-nowrap shrink-0">
              {data?.cmsSettings?.footerText || '© 2026 Success Point Educational Institute, Dhubri.'}
            </p>
          </div>
        </div>
      </footer>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-20 no-print">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 flex-1">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses, Assam districts, notices..."
                  className="w-full text-sm focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {searchResults ? (
              <div className="max-h-80 overflow-y-auto space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">
                    Courses ({searchResults.courses.length})
                  </p>
                  {searchResults.courses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate('courses')}
                      className="block w-full text-left py-1.5 text-blue-800 hover:underline"
                    >
                      {c.name} ({c.category})
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">
                    District Centres ({searchResults.centres.length})
                  </p>
                  {searchResults.centres.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate('franchise')}
                      className="block w-full text-left py-1.5 text-slate-800 hover:underline"
                    >
                      {c.name} — {c.district}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">
                    Notices ({searchResults.notices.length})
                  </p>
                  {searchResults.notices.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => navigate('notifications')}
                      className="block w-full text-left py-1.5 text-slate-800 hover:underline"
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Type keywords such as PGDCA, ADRE, Dhubri, Kokrajhar, or Scholarship.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Printable Digital Prospectus Modal */}
      {prospectusOpen && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold text-blue-700">
                  OFFICIAL INFORMATION PROSPECTUS · {data.cmsSettings.admissionsOpenBatch}
                </p>
                <h2 className="text-2xl font-bold text-[#0B1E3D]">
                  Success Point Educational Institute
                </h2>
                <p className="text-xs text-slate-600">{data.cmsSettings.headOfficeAddress}</p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setProspectusOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {data.cmsSettings.directorMessage}
            </p>

            <div>
              <h3 className="text-sm font-bold text-[#0B1E3D] mb-2">
                Authorized Programs &amp; Fee Structure
              </h3>
              <table className="w-full text-left text-xs border-t border-slate-200">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Code</th>
                    <th className="py-2">Program Name</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2 text-right">Fee (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.courses.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-2 font-mono">{c.code}</td>
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="py-2">{c.duration}</td>
                      <td className="py-2 text-right font-mono">
                        ₹{c.fees.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-3">
              {data.cmsSettings.legalDisclaimer}
            </p>
          </div>
        </div>
      )}
      {/* WhatsApp Floating Widget & Welcome Popup */}
      <WhatsAppWidget settings={data?.whatsappSettings} />
    </div>
  );
}
