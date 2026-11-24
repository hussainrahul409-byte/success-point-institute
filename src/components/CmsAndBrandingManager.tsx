import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Download,
  History,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiRequest, readFileAsDataUrl } from '../lib/api';
import { ALL_USER_ROLES } from '../types/institute';
import type {
  BackupRecord,
  BrandingConfig,
  CmsSettings,
  CmsVersion,
  DocumentTemplateConfig,
  LoginAttemptRecord,
  PermissionKey,
  SessionRecord,
  UserRole,
  WhatsAppSettings,
} from '../types/institute';

const ALL_PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: 'manage_cms_branding', label: 'Website CMS, Logos & Templates' },
  { key: 'manage_whatsapp', label: 'WhatsApp Business Settings' },
  { key: 'manage_security_sessions', label: 'Manage Sessions & Security' },
  { key: 'manage_backups', label: 'Encrypted Backups & Restore' },
  { key: 'manage_users_roles', label: 'Create Staff & Manage Roles' },
  { key: 'manage_courses', label: 'Add/Edit Courses & Fees' },
  { key: 'manage_admissions', label: 'Approve Admissions' },
  { key: 'manage_students', label: 'Manage Student Records & IDs' },
  { key: 'manage_exams_marksheets', label: 'Admit Cards & Marksheets' },
  { key: 'manage_certificates', label: 'Digital Certificates' },
  { key: 'manage_migrations', label: 'Migration Certificates' },
  { key: 'manage_fees', label: 'Fees & Financial Ledger' },
  { key: 'manage_franchises', label: 'Approve Franchises' },
  { key: 'manage_notices_gallery', label: 'Notices & Gallery' },
  { key: 'manage_legal_compliance', label: 'Legal Compliance & Policies' },
  { key: 'view_audit_logs', label: 'View Audit Logs' },
];

export function CmsManagerPanel({
  cmsSettings,
  cmsVersions,
  onSaved,
}: {
  cmsSettings: CmsSettings;
  cmsVersions: CmsVersion[];
  onSaved: (msg: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CmsSettings>(cmsSettings);
  const [note, setNote] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  async function saveCms(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ ...form, versionNote: note || 'Visual CMS Update' }),
    });
    setNote('');
    await onSaved('CMS settings published and version snapshot recorded.');
  }

  async function restoreVersion(versionId: string) {
    await apiRequest(`/api/admin/cms/restore/${versionId}`, { method: 'POST' });
    await onSaved('CMS version restored.');
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveCms} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#0B1E3D]">
              Visual Website CMS &amp; Theme Controller
            </h3>
            <p className="text-xs text-slate-500">
              Edit homepage, vision/mission, contact details, colors, fonts, navigation labels, ID
              format, SEO metadata, and legal pages.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(!previewOpen)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {previewOpen ? 'Hide Draft Preview' : 'Preview Draft Changes'}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              <Save className="h-3.5 w-3.5" />
              Publish CMS Changes
            </button>
          </div>
        </div>

        {previewOpen && (
          <div
            style={{ fontFamily: form.fontPreset }}
            className="rounded-xl border border-blue-200 bg-slate-50 p-5 space-y-2"
          >
            <p className="text-[11px] font-bold text-blue-700 uppercase">Live Draft Preview</p>
            <div style={{ backgroundColor: form.primaryColor }} className="rounded-lg p-4 text-white">
              <p className="text-xs opacity-90">{form.announcementText}</p>
              <h4 className="text-lg font-bold mt-1">{form.heroTitle}</h4>
              <p className="text-xs opacity-90 mt-1">{form.heroSubtitle}</p>
            </div>
            <p className="text-xs text-slate-600">
              Footer: {form.footerText} · Phone: {form.contactPhone} · Accent:{' '}
              <span style={{ color: form.accentColor }} className="font-mono font-bold">
                {form.accentColor}
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold mb-1">Institute Name</label>
            <input
              value={form.instituteName}
              onChange={(e) => setForm({ ...form, instituteName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Open Admission Batch</label>
            <input
              value={form.admissionsOpenBatch}
              onChange={(e) => setForm({ ...form, admissionsOpenBatch: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Top Announcement Bar</label>
            <input
              value={form.announcementText}
              onChange={(e) => setForm({ ...form, announcementText: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Home Hero Heading</label>
            <input
              value={form.heroTitle}
              onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Home Hero Subtitle</label>
            <textarea
              rows={2}
              value={form.heroSubtitle}
              onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Vision Statement</label>
            <textarea
              rows={2}
              value={form.visionText}
              onChange={(e) => setForm({ ...form, visionText: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Mission Statement</label>
            <textarea
              rows={2}
              value={form.missionText}
              onChange={(e) => setForm({ ...form, missionText: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Head Office Address</label>
            <input
              value={form.headOfficeAddress}
              onChange={(e) => setForm({ ...form, headOfficeAddress: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Official Phone / Secondary</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <input
                value={form.secondaryPhone}
                onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Official Email</label>
            <input
              value={form.officialEmail}
              onChange={(e) => setForm({ ...form, officialEmail: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Office Hours</label>
            <input
              value={form.officeHours}
              onChange={(e) => setForm({ ...form, officeHours: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Primary / Accent Colors</label>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="h-9 w-12 rounded border border-slate-300"
              />
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                className="h-9 w-12 rounded border border-slate-300"
              />
              <select
                value={form.fontPreset}
                onChange={(e) =>
                  setForm({ ...form, fontPreset: e.target.value as CmsSettings['fontPreset'] })
                }
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                <option value="Outfit">Outfit</option>
                <option value="Manrope">Manrope</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              Student ID Format &amp; Inactivity Timeout (mins)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={form.studentIdPrefix}
                onChange={(e) => setForm({ ...form, studentIdPrefix: e.target.value })}
                placeholder="SPI"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <input
                value={form.studentIdFormat}
                onChange={(e) => setForm({ ...form, studentIdFormat: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
              <input
                type="number"
                min={2}
                max={120}
                value={form.sessionTimeoutMinutes}
                onChange={(e) =>
                  setForm({ ...form, sessionTimeoutMinutes: Number(e.target.value) || 10 })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">SEO Title &amp; Description</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Director&apos;s Message</label>
            <textarea
              rows={3}
              value={form.directorMessage}
              onChange={(e) => setForm({ ...form, directorMessage: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Save Version Note</label>
            <input
              placeholder="e.g. Updated admission batch banner & phone"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </form>

      {/* Version History & Restore */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-blue-700" />
          <h3 className="text-sm font-bold text-[#0B1E3D]">CMS Version History &amp; Restore</h3>
        </div>
        <div className="divide-y divide-slate-200 text-xs">
          {cmsVersions.map((v) => (
            <div key={v.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono font-bold text-[#0B1E3D]">v{v.version}</span> ·{' '}
                <span className="font-semibold">{v.note}</span> · {v.savedBy} (
                <span className="font-mono">{v.timestamp.slice(0, 16)}</span>)
              </div>
              <button
                type="button"
                onClick={() => restoreVersion(v.id)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 font-semibold hover:bg-slate-50"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BrandingAndTemplatesPanel({
  branding,
  templates,
  whatsapp,
  onSaved,
}: {
  branding: BrandingConfig;
  templates: DocumentTemplateConfig[];
  whatsapp: WhatsAppSettings;
  onSaved: (msg: string) => Promise<void>;
}) {
  const [brandForm, setBrandForm] = useState<BrandingConfig>(branding);
  const [tplList, setTplList] = useState<DocumentTemplateConfig[]>(templates);
  const [waForm, setWaForm] = useState<WhatsAppSettings>(whatsapp);

  async function uploadBrandingSlot(key: keyof BrandingConfig, file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await apiRequest<{ url: string }>('/api/admin/upload-asset', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, prefix: key }),
    });
    const next = { ...brandForm, [key]: res.url };
    setBrandForm(next);
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/branding', {
      method: 'PATCH',
      body: JSON.stringify(brandForm),
    });
    await onSaved('Institution logos, favicon, official seal & signature updated.');
  }

  async function saveTemplate(tpl: DocumentTemplateConfig) {
    await apiRequest(`/api/admin/templates/${tpl.id}`, {
      method: 'PUT',
      body: JSON.stringify(tpl),
    });
    await onSaved(`Template "${tpl.label}" saved.`);
  }

  async function saveWhatsapp(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/whatsapp', {
      method: 'PATCH',
      body: JSON.stringify(waForm),
    });
    await onSaved('WhatsApp Business widget & popup settings saved.');
  }

  const slots: { key: keyof BrandingConfig; label: string }[] = [
    { key: 'websiteLogoUrl', label: 'Website Header Logo' },
    { key: 'faviconUrl', label: 'Website Favicon' },
    { key: 'websiteBannerUrl', label: 'Home Hero Banner' },
    { key: 'loginLogoUrl', label: 'Portal Login Logo' },
    { key: 'certificateLogoUrl', label: 'Certificate Logo' },
    { key: 'idCardLogoUrl', label: 'ID Card Logo' },
    { key: 'admitCardLogoUrl', label: 'Admit Card Logo' },
    { key: 'marksheetLogoUrl', label: 'Marksheet Logo' },
    { key: 'officialSealUrl', label: 'Official Institute Seal' },
    { key: 'authorizedSignatureUrl', label: 'Authorized Signature' },
  ];

  return (
    <div className="space-y-8">
      {/* Branding Slots */}
      <form onSubmit={saveBranding} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-blue-700" />
            <div>
              <h3 className="text-base font-bold text-[#0B1E3D]">
                Institution Logo, Favicon, Seal &amp; Signature Manager
              </h3>
              <p className="text-xs text-slate-500">
                Upload PNG/JPG/SVG/WebP assets (up to 1.8 MB) with instant preview.
              </p>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            Save All Branding Assets
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => (
            <div key={slot.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-bold text-[#0B1E3D]">{slot.label}</p>
              <div className="h-16 rounded border border-slate-200 bg-slate-50 flex items-center justify-center p-2 overflow-hidden">
                <img
                  src={brandForm[slot.key]}
                  alt={slot.label}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-3 w-3" />
                Upload Replacement
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await uploadBrandingSlot(slot.key, f);
                  }}
                />
              </label>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Authorized Signatory Title</label>
          <input
            value={brandForm.signatoryTitle}
            onChange={(e) => setBrandForm({ ...brandForm, signatoryTitle: e.target.value })}
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </form>

      {/* Document Template Customizer */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-base font-bold text-[#0B1E3D]">
          Document Template Designer (ID, Admit Card, Marksheet, Migration, Certificates)
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {tplList.map((tpl, idx) => (
            <div key={tpl.id} className="rounded-lg border border-slate-200 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-[#0B1E3D]">{tpl.label}</p>
                <button
                  type="button"
                  onClick={() => saveTemplate(tpl)}
                  className="rounded bg-[#0B1E3D] px-3 py-1 font-semibold text-white"
                >
                  Save Template
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <span>Primary:</span>
                  <input
                    type="color"
                    value={tpl.primaryColor}
                    onChange={(e) => {
                      const copy = [...tplList];
                      copy[idx] = { ...tpl, primaryColor: e.target.value };
                      setTplList(copy);
                    }}
                  />
                </label>
                <select
                  value={tpl.borderStyle}
                  onChange={(e) => {
                    const copy = [...tplList];
                    copy[idx] = {
                      ...tpl,
                      borderStyle: e.target.value as DocumentTemplateConfig['borderStyle'],
                    };
                    setTplList(copy);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                >
                  <option value="double">Double Border</option>
                  <option value="solid">Solid Border</option>
                  <option value="classic">Classic Frame</option>
                </select>
              </div>
              <input
                value={tpl.headerNote}
                onChange={(e) => {
                  const copy = [...tplList];
                  copy[idx] = { ...tpl, headerNote: e.target.value };
                  setTplList(copy);
                }}
                placeholder="Header Note"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5"
              />
              <input
                value={tpl.footerNote}
                onChange={(e) => {
                  const copy = [...tplList];
                  copy[idx] = { ...tpl, footerNote: e.target.value };
                  setTplList(copy);
                }}
                placeholder="Footer Note"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5"
              />
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ['showLogo', 'Logo'],
                    ['showSeal', 'Seal'],
                    ['showSignature', 'Signature'],
                    ['showQr', 'QR Verify'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={tpl[field]}
                      onChange={(e) => {
                        const copy = [...tplList];
                        copy[idx] = { ...tpl, [field]: e.target.checked };
                        setTplList(copy);
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp Business Settings */}
      <form onSubmit={saveWhatsapp} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-700" />
            <h3 className="text-base font-bold text-[#0B1E3D]">
              WhatsApp Business Floating Widget &amp; Welcome Popup
            </h3>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
          >
            Save WhatsApp Settings
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={waForm.enabled}
              onChange={(e) => setWaForm({ ...waForm, enabled: e.target.checked })}
            />
            Enable Floating WhatsApp Button
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={waForm.popupEnabled}
              onChange={(e) => setWaForm({ ...waForm, popupEnabled: e.target.checked })}
            />
            Show Welcome Popup
          </label>
          <div>
            <label className="block text-xs font-semibold mb-1">Popup Delay (seconds)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={waForm.popupDelaySeconds}
              onChange={(e) =>
                setWaForm({ ...waForm, popupDelaySeconds: Number(e.target.value) || 12 })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">WhatsApp Number (with 91)</label>
            <input
              value={waForm.number}
              onChange={(e) => setWaForm({ ...waForm, number: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Popup Heading</label>
            <input
              value={waForm.welcomeHeading}
              onChange={(e) => setWaForm({ ...waForm, welcomeHeading: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Working Hours Text</label>
            <input
              value={waForm.workingHoursNote}
              onChange={(e) => setWaForm({ ...waForm, workingHoursNote: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <textarea
          rows={2}
          value={waForm.popupText}
          onChange={(e) => setWaForm({ ...waForm, popupText: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </form>
    </div>
  );
}

export function SecurityAndBackupPanel({
  role,
  sessions,
  loginAttempts,
  backups,
  rolePermissions,
  deletedRecords,
  onRefresh,
  onFeedback,
}: {
  role: UserRole;
  sessions: SessionRecord[];
  loginAttempts: LoginAttemptRecord[];
  backups: BackupRecord[];
  rolePermissions?: Record<UserRole, PermissionKey[]>;
  deletedRecords?: {
    courses: { id: string; name?: string; deletedAt?: string }[];
    students: { id: string; fullName?: string; deletedAt?: string }[];
    applications: { id: string; fullName?: string; applicationId?: string; deletedAt?: string }[];
    certificates: { id: string; certificateNo?: string; deletedAt?: string }[];
    marksheets: { id: string; marksheetNo?: string; deletedAt?: string }[];
  };
  onRefresh: () => Promise<void>;
  onFeedback: (msg: string) => void;
}) {
  const [selectedPermRole, setSelectedPermRole] = useState<UserRole>('admin');
  const [permsDraft, setPermsDraft] = useState<Record<UserRole, PermissionKey[]> | undefined>(
    rolePermissions
  );

  async function createBackup() {
    await apiRequest('/api/admin/backups', { method: 'POST' });
    onFeedback('AES-256-GCM encrypted backup created cleanly.');
    await onRefresh();
  }

  async function restoreBackup(id: string) {
    await apiRequest(`/api/admin/backups/${id}/restore`, { method: 'POST' });
    onFeedback('Encrypted backup restored successfully.');
    await onRefresh();
  }

  async function terminateSession(id: string) {
    await apiRequest(`/api/admin/sessions/${id}`, { method: 'DELETE' });
    onFeedback('User session revoked.');
    await onRefresh();
  }

  async function terminateAllSessions() {
    const res = await apiRequest<{ terminated: number }>('/api/admin/sessions/terminate-all', {
      method: 'POST',
    });
    onFeedback(`Terminated ${res.terminated} active sessions.`);
    await onRefresh();
  }

  async function exportSanitizedJson() {
    const backup = await apiRequest<unknown>('/api/admin/backup');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `success-point-sanitized-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onFeedback('Sanitized JSON backup exported.');
  }

  return (
    <div className="space-y-8">
      {/* Active Sessions Control */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-700" />
            <h3 className="text-base font-bold text-[#0B1E3D]">
              Active Sessions &amp; Inactivity Enforcement
            </h3>
          </div>
          <button
            type="button"
            onClick={terminateAllSessions}
            className="rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            Terminate All Other Active Sessions
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">User &amp; Role</th>
                <th className="py-2">IP</th>
                <th className="py-2">Last Activity</th>
                <th className="py-2">State</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 20).map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">
                    {s.userName} ({s.role})
                  </td>
                  <td className="py-2 font-mono">{s.ip}</td>
                  <td className="py-2 font-mono">{s.lastActivityAt.slice(0, 19)}</td>
                  <td className="py-2 font-semibold">
                    {s.revoked ? (
                      <span className="text-slate-500">Revoked ({s.revokedReason})</span>
                    ) : (
                      <span className="text-emerald-700">Active</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!s.revoked && (
                      <button
                        type="button"
                        onClick={() => terminateSession(s.id)}
                        className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
                      >
                        Force Logout
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Login Attempts & Suspicious Detection */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-700" />
          <h3 className="text-base font-bold text-[#0B1E3D]">
            Login Attempt Monitor &amp; Lockout Alerts
          </h3>
        </div>
        <div className="divide-y divide-slate-200 text-xs max-h-60 overflow-y-auto">
          {loginAttempts.map((a) => (
            <div key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
              <span>
                <strong className={a.success ? 'text-emerald-700' : 'text-red-700'}>
                  {a.success ? 'SUCCESS' : 'FAILED'}
                </strong>{' '}
                · <span className="font-mono">{a.email}</span> · {a.reason}
                {a.suspicious && (
                  <span className="ml-2 font-bold text-amber-800">[SUSPICIOUS FLAG]</span>
                )}
              </span>
              <span className="font-mono text-slate-500">
                {a.ip} · {a.timestamp.slice(0, 19)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Super Admin RBAC Permissions Matrix */}
      {role === 'super_admin' && permsDraft && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#0B1E3D]">
              Super Admin RBAC Permission Matrix
            </h3>
            <select
              value={selectedPermRole}
              onChange={(e) => setSelectedPermRole(e.target.value as UserRole)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white font-semibold"
            >
              {ALL_USER_ROLES.filter((r) => r.id !== 'super_admin').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            {ALL_PERMISSIONS.map((p) => {
              const checked = (permsDraft[selectedPermRole] || []).includes(p.key);
              return (
                <label
                  key={p.key}
                  className="flex items-center gap-2 rounded border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const cur = permsDraft[selectedPermRole] || [];
                      const next = e.target.checked
                        ? [...cur, p.key]
                        : cur.filter((x) => x !== p.key);
                      setPermsDraft({ ...permsDraft, [selectedPermRole]: next });
                    }}
                  />
                  <span>{p.label}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={async () => {
              await apiRequest('/api/admin/permissions', {
                method: 'PUT',
                body: JSON.stringify({
                  role: selectedPermRole,
                  permissions: permsDraft[selectedPermRole] || [],
                }),
              });
              onFeedback(`Updated permissions for ${selectedPermRole}.`);
              await onRefresh();
            }}
            className="rounded-lg bg-[#0B1E3D] px-4 py-2 text-xs font-semibold text-white"
          >
            Save Role Permissions
          </button>
        </div>
      )}

      {/* Encrypted Backup & Restore */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0B1E3D]">
              AES-256-GCM Encrypted Database Backups
            </h3>
            <p className="text-xs text-slate-500">
              Automatic daily backup + instant encrypted restore stored separately in data/backups/.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createBackup}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Create Encrypted Backup
            </button>
            <button
              type="button"
              onClick={exportSanitizedJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export Sanitized JSON
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-200 text-xs">
          {backups.map((b) => (
            <div key={b.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono font-bold text-[#0B1E3D]">{b.filename}</p>
                <p className="text-slate-500">
                  By {b.createdBy} · {b.createdAt.slice(0, 19)} · Students:{' '}
                  {b.recordCounts.students}, Certs: {b.recordCounts.certificates}
                </p>
              </div>
              {role === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => restoreBackup(b.id)}
                  className="rounded border border-blue-700 px-3 py-1 font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Restore Snapshot
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Soft-Deleted Records Recovery */}
      {deletedRecords && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <h3 className="text-base font-bold text-[#0B1E3D]">
            Soft-Deleted Record Recovery &amp; Protection
          </h3>
          <div className="space-y-2 text-xs">
            {(
              [
                ['courses', deletedRecords.courses],
                ['students', deletedRecords.students],
                ['applications', deletedRecords.applications],
                ['certificates', deletedRecords.certificates],
                ['marksheets', deletedRecords.marksheets],
              ] as const
            ).map(([type, list]) =>
              list.map((item) => (
                <div
                  key={`${type}-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2.5"
                >
                  <span>
                    <strong className="uppercase">{type}</strong> ·{' '}
                    {'name' in item
                      ? item.name
                      : 'fullName' in item
                      ? item.fullName
                      : 'certificateNo' in item
                      ? item.certificateNo
                      : 'marksheetNo' in item
                      ? item.marksheetNo
                      : item.id}{' '}
                    <span className="font-mono text-slate-500">
                      (deleted {item.deletedAt?.slice(0, 10)})
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/records/${type}/${item.id}/restore`, {
                          method: 'POST',
                        });
                        onFeedback('Soft-deleted record restored.');
                        await onRefresh();
                      }}
                      className="rounded bg-emerald-700 px-2.5 py-1 text-white font-semibold"
                    >
                      Recover
                    </button>
                    {role === 'super_admin' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/records/${type}/${item.id}/permanent`, {
                            method: 'DELETE',
                          });
                          onFeedback('Record permanently purged by Super Admin.');
                          await onRefresh();
                        }}
                        className="inline-flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-red-700 font-semibold"
                      >
                        <Trash2 className="h-3 w-3" />
                        Purge
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
