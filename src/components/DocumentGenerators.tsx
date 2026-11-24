import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, ShieldCheck } from 'lucide-react';
import {
  downloadAdmitCardPdf,
  downloadCertificatePdf,
  downloadMarksheetPdf,
  downloadMigrationPdf,
  downloadStudentIdPdf,
} from '../lib/pdfEngine';
import type {
  AdmitCardRecord,
  BrandingConfig,
  CertificateRecord,
  DocumentTemplateConfig,
  MarksheetRecord,
  MigrationRecord,
  PaymentRecord,
  StudentProfile,
} from '../types/institute';

function findTemplate(
  templates: DocumentTemplateConfig[] | undefined,
  id: DocumentTemplateConfig['id']
): DocumentTemplateConfig | undefined {
  return templates?.find((t) => t.id === id);
}

export function StudentIdCardView({
  student,
  branding,
  templates,
  onDownloadLog,
}: {
  student: StudentProfile;
  branding?: BrandingConfig;
  templates?: DocumentTemplateConfig[];
  onDownloadLog?: (action: 'Printed' | 'PDF Downloaded') => void;
}) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const tpl = findTemplate(templates, 'id_card');
  const primary = tpl?.primaryColor || '#0B1E3D';
  const verifyUrl = `${window.location.origin}/verify?cert=${encodeURIComponent(student.studentId)}`;

  async function handlePdf() {
    const svg = qrWrapRef.current?.querySelector('svg') || null;
    await downloadStudentIdPdf({ student, branding, template: tpl, qrSvg: svg });
    onDownloadLog?.('PDF Downloaded');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h3 className="text-base font-semibold text-slate-900">
          Official Student Identity Card ({student.studentId})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => {
              onDownloadLog?.('Printed');
              window.print();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      <div className="max-w-lg rounded-xl border border-slate-300 bg-white overflow-hidden relative">
        {student.isSample && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1 text-[11px] font-bold text-amber-900 tracking-wider">
            SAMPLE PREVIEW RECORD
          </div>
        )}
        <div
          style={{ backgroundColor: primary }}
          className="px-5 py-3.5 text-white flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            {tpl?.showLogo !== false && branding?.idCardLogoUrl && (
              <img
                src={branding.idCardLogoUrl}
                alt="Institute Logo"
                className="h-9 w-9 rounded bg-white p-0.5 object-contain shrink-0"
              />
            )}
            <div>
              <p className="text-sm font-bold tracking-tight">Success Point Educational Institute</p>
              <p className="text-[11px] text-blue-100">
                {tpl?.headerNote || 'GTB Road, Ward No. 12, Dhubri, Assam 783301'}
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] font-semibold text-blue-100 shrink-0">
            STUDENT ID
          </span>
        </div>

        <div className="p-5 flex gap-4 items-start">
          <div className="h-24 w-20 shrink-0 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center text-xs font-semibold text-slate-500">
            {student.photoUrl ? (
              <img
                src={student.photoUrl}
                alt={student.fullName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{student.fullName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            <p className="text-base font-bold text-slate-900">{student.fullName}</p>
            <p className="font-mono text-blue-800 font-bold">ID: {student.studentId}</p>
            <p className="font-mono text-slate-700">
              Reg: {student.registrationNumber} · Roll: {student.rollNumber}
            </p>
            <p className="text-slate-600">
              Course ({student.courseCode}): {student.courseName}
            </p>
            <p className="text-slate-600">
              Centre: {student.centreCode} ({student.district})
            </p>
            <p className="text-slate-600 font-mono">
              Session: {student.academicSession} · Reg Date: {student.registrationDate}
            </p>
          </div>
          {tpl?.showQr !== false && (
            <div ref={qrWrapRef} className="rounded border border-slate-200 p-1.5 bg-white shrink-0">
              <QRCodeSVG value={verifyUrl} size={58} />
            </div>
          )}
        </div>

        <div className="px-5 pb-3 flex items-end justify-between gap-4">
          <p className="text-[11px] text-slate-500 max-w-xs">
            {tpl?.footerNote || 'Non-transferable institutional identity card.'}
          </p>
          <div className="flex items-end gap-3">
            {tpl?.showSeal !== false && branding?.officialSealUrl && (
              <img
                src={branding.officialSealUrl}
                alt="Official Seal"
                className="h-10 w-10 object-contain opacity-90"
              />
            )}
            {tpl?.showSignature !== false && branding?.authorizedSignatureUrl && (
              <div className="text-right">
                <img
                  src={branding.authorizedSignatureUrl}
                  alt="Authorized Signature"
                  className="h-7 w-20 object-contain ml-auto"
                />
                <p className="text-[10px] font-semibold text-slate-700">
                  {branding.signatoryTitle || 'Director'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdmitCardView({
  admitCard,
  student,
  branding,
  templates,
}: {
  admitCard?: AdmitCardRecord;
  student?: StudentProfile;
  branding?: BrandingConfig;
  templates?: DocumentTemplateConfig[];
}) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const tpl = findTemplate(templates, 'admit_card');
  const primary = tpl?.primaryColor || '#0B1E3D';

  const card: AdmitCardRecord | null = admitCard
    ? admitCard
    : student
    ? {
        id: `fallback-${student.id}`,
        admitCardNo: student.admitCardNo,
        studentDbId: student.id,
        studentId: student.studentId,
        registrationNumber: student.registrationNumber,
        studentName: student.fullName,
        fatherName: student.fatherName,
        photoUrl: student.photoUrl,
        courseName: student.courseName,
        courseCode: student.courseCode,
        examName: 'Institutional Term Evaluation',
        examSession: student.academicSession,
        examCentre: student.centreName,
        examDate: 'As per Notice Board',
        examTiming: '10:00 AM – 01:00 PM IST',
        subjects: ['Paper I: Core Theory', 'Paper II: Practical Assessment'],
        status: 'Approved',
        createdAt: student.enrolledAt,
        isSample: student.isSample,
      }
    : null;

  if (!card) return null;
  const verifyUrl = `${window.location.origin}/verify?cert=${encodeURIComponent(card.admitCardNo)}`;

  async function handlePdf() {
    if (!card) return;
    const svg = qrWrapRef.current?.querySelector('svg') || null;
    await downloadAdmitCardPdf({ admitCard: card, branding, template: tpl, qrSvg: svg });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h3 className="text-base font-semibold text-slate-900">
          Examination Admit Card ({card.admitCardNo})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download A4 PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      <div
        style={{ borderColor: primary }}
        className="rounded-xl border-2 bg-white p-6 space-y-5 relative"
      >
        {card.isSample && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
            SAMPLE ADMIT CARD PREVIEW
          </p>
        )}
        <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {tpl?.showLogo !== false && branding?.admitCardLogoUrl && (
              <img
                src={branding.admitCardLogoUrl}
                alt="Institute Logo"
                className="h-12 w-12 object-contain"
              />
            )}
            <div>
              <p className="text-xs font-semibold text-blue-700">
                {tpl?.headerNote || 'EXAMINATION CELL · DHUBRI HEAD OFFICE'}
              </p>
              <h4 className="text-lg font-bold text-slate-900">Success Point Educational Institute</h4>
              <p className="text-xs text-slate-600">{card.examName} ({card.examSession})</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Admit Card No.</p>
            <p className="font-mono text-sm font-bold text-slate-900">{card.admitCardNo}</p>
            <p className="font-mono text-[11px] text-emerald-700 font-semibold">{card.status}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Candidate Name</p>
              <p className="font-semibold text-slate-900">{card.studentName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Student ID &amp; Reg No</p>
              <p className="font-mono text-xs font-semibold text-slate-900">
                {card.studentId} · {card.registrationNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Father&apos;s Name</p>
              <p className="text-slate-800">{card.fatherName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Exam Date &amp; Timing</p>
              <p className="font-mono text-xs text-slate-800">
                {card.examDate} · {card.examTiming}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Course &amp; Exam Centre</p>
              <p className="font-medium text-slate-900">
                {card.courseName} ({card.courseCode}) — {card.examCentre}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between gap-2">
            <div className="h-24 w-20 rounded border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center text-[11px] text-slate-500">
              {card.photoUrl ? (
                <img src={card.photoUrl} alt={card.studentName} className="h-full w-full object-cover" />
              ) : (
                <span>PHOTO</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">Scheduled Papers / Subjects:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {card.subjects.map((sub) => (
              <li key={sub}>{sub}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
          {tpl?.showQr !== false && (
            <div ref={qrWrapRef} className="rounded border border-slate-200 p-1.5 bg-white">
              <QRCodeSVG value={verifyUrl} size={64} />
            </div>
          )}
          <div className="flex items-end gap-4 ml-auto">
            {tpl?.showSeal !== false && branding?.officialSealUrl && (
              <img src={branding.officialSealUrl} alt="Official Seal" className="h-12 w-12 object-contain" />
            )}
            {tpl?.showSignature !== false && branding?.authorizedSignatureUrl && (
              <div className="text-right text-xs">
                <img
                  src={branding.authorizedSignatureUrl}
                  alt="Authorized Signature"
                  className="h-8 w-24 object-contain ml-auto"
                />
                <p className="font-semibold text-slate-900">
                  {branding.signatoryTitle || 'Controller of Examinations'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarksheetView({
  marksheet,
  branding,
  templates,
}: {
  marksheet: MarksheetRecord;
  branding?: BrandingConfig;
  templates?: DocumentTemplateConfig[];
}) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const tpl = findTemplate(templates, 'marksheet');
  const primary = tpl?.primaryColor || '#0B1E3D';
  const verifyUrl = `${window.location.origin}/verify?cert=${encodeURIComponent(marksheet.marksheetNo)}`;

  async function handlePdf() {
    const svg = qrWrapRef.current?.querySelector('svg') || null;
    await downloadMarksheetPdf({ marksheet, branding, template: tpl, qrSvg: svg });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h3 className="text-base font-semibold text-slate-900">
          Academic Marksheet ({marksheet.marksheetNo})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download A4 PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      <div style={{ borderColor: primary }} className="rounded-xl border-2 bg-white p-6 space-y-5">
        {marksheet.isSample && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
            SAMPLE MARKSHEET PREVIEW
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {tpl?.showLogo !== false && branding?.marksheetLogoUrl && (
              <img src={branding.marksheetLogoUrl} alt="Logo" className="h-12 w-12 object-contain" />
            )}
            <div>
              <p className="text-xs font-semibold text-blue-700">
                {tpl?.headerNote || 'STATEMENT OF MARKS · INSTITUTIONAL EVALUATION'}
              </p>
              <h4 className="text-xl font-bold text-[#0B1E3D]">Success Point Educational Institute</h4>
              <p className="text-xs text-slate-600">{marksheet.examName} · {marksheet.academicSession}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Marksheet No.</p>
            <p className="font-mono text-sm font-bold text-slate-900">{marksheet.marksheetNo}</p>
            <p className="font-mono text-[11px] text-emerald-700 font-semibold">{marksheet.status}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 text-xs text-slate-700">
          <p><strong>Candidate:</strong> {marksheet.studentName}</p>
          <p><strong>Father&apos;s Name:</strong> {marksheet.fatherName}</p>
          <p className="font-mono"><strong>Student ID:</strong> {marksheet.studentId}</p>
          <p className="font-mono"><strong>Reg No:</strong> {marksheet.registrationNumber}</p>
          <p className="sm:col-span-2"><strong>Program:</strong> {marksheet.courseName}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200">
            <thead>
              <tr style={{ backgroundColor: primary }} className="text-white">
                <th className="py-2 px-3">Subject Code</th>
                <th className="py-2 px-3">Subject Title</th>
                <th className="py-2 px-3 text-right">Max Marks</th>
                <th className="py-2 px-3 text-right">Pass Marks</th>
                <th className="py-2 px-3 text-right">Obtained</th>
              </tr>
            </thead>
            <tbody>
              {marksheet.subjects.map((s) => (
                <tr key={s.subjectCode} className="border-t border-slate-200">
                  <td className="py-2 px-3 font-mono">{s.subjectCode}</td>
                  <td className="py-2 px-3 font-medium">{s.subjectName}</td>
                  <td className="py-2 px-3 text-right font-mono">{s.maxMarks}</td>
                  <td className="py-2 px-3 text-right font-mono">{s.passingMarks}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{s.obtainedMarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap justify-between gap-4 text-xs font-semibold">
          <span className="font-mono">
            Total: {marksheet.totalObtainedMarks} / {marksheet.totalMaxMarks}
          </span>
          <span className="font-mono">Percentage: {marksheet.percentage}%</span>
          <span className="font-mono">Grade: {marksheet.grade}</span>
          <span className={marksheet.resultStatus === 'Pass' ? 'text-emerald-700' : 'text-red-700'}>
            Result: {marksheet.resultStatus}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-200">
          {tpl?.showQr !== false && (
            <div ref={qrWrapRef} className="rounded border border-slate-200 p-1.5 bg-white">
              <QRCodeSVG value={verifyUrl} size={64} />
            </div>
          )}
          <div className="text-xs text-slate-500">
            <p className="font-mono">Issue Date: {marksheet.issueDate}</p>
            <p>{tpl?.footerNote || 'Verify authenticity via QR or /verify portal.'}</p>
          </div>
          <div className="flex items-end gap-4">
            {tpl?.showSeal !== false && branding?.officialSealUrl && (
              <img src={branding.officialSealUrl} alt="Seal" className="h-12 w-12 object-contain" />
            )}
            {tpl?.showSignature !== false && branding?.authorizedSignatureUrl && (
              <div className="text-right text-xs">
                <img src={branding.authorizedSignatureUrl} alt="Signature" className="h-8 w-24 object-contain ml-auto" />
                <p className="font-semibold text-slate-900">
                  {branding.signatoryTitle || 'Controller of Examinations'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MigrationCertificateView({
  migration,
  branding,
  templates,
}: {
  migration: MigrationRecord;
  branding?: BrandingConfig;
  templates?: DocumentTemplateConfig[];
}) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const tpl = findTemplate(templates, 'migration_certificate');
  const primary = tpl?.primaryColor || '#0B1E3D';
  const verifyUrl = `${window.location.origin}/verify?cert=${encodeURIComponent(migration.migrationNo)}`;

  async function handlePdf() {
    const svg = qrWrapRef.current?.querySelector('svg') || null;
    await downloadMigrationPdf({ migration, branding, template: tpl, qrSvg: svg });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h3 className="text-base font-semibold text-slate-900">
          {migration.authorizationType} ({migration.migrationNo})
        </h3>
        <button
          type="button"
          onClick={handlePdf}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
        >
          <Download className="h-3.5 w-3.5" />
          Download A4 PDF
        </button>
      </div>

      <div style={{ borderColor: primary }} className="rounded-xl border-2 bg-white p-6 space-y-4">
        {migration.isSample && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
            SAMPLE MIGRATION CERTIFICATE PREVIEW
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-xs font-semibold text-blue-700">
              {tpl?.headerNote || 'OFFICE OF THE REGISTRAR & DIRECTOR · DHUBRI'}
            </p>
            <h4 className="text-xl font-bold text-[#0B1E3D]">{migration.authorizationType}</h4>
          </div>
          <div className="text-right text-xs">
            <p className="font-mono font-bold text-slate-900">{migration.migrationNo}</p>
            <p className="text-emerald-700 font-semibold">{migration.status}</p>
          </div>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">
          This is to certify that <strong>{migration.studentName}</strong> (S/O or D/O{' '}
          <strong>{migration.fatherName}</strong>), Student ID{' '}
          <span className="font-mono">{migration.studentId}</span>, Reg No{' '}
          <span className="font-mono">{migration.registrationNumber}</span>, was enrolled in{' '}
          <strong>{migration.courseName}</strong> ({migration.academicSession}). Last assessment:{' '}
          {migration.lastExamDetails}. Document Check:{' '}
          <strong>{migration.documentVerified ? 'Verified' : 'Pending'}</strong> · Fee Clearance:{' '}
          <strong>{migration.feeVerified ? 'Cleared' : 'Pending'}</strong>. Issued for transfer toward{' '}
          <strong>{migration.targetInstitution}</strong>.
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-3">
          {tpl?.showQr !== false && (
            <div ref={qrWrapRef} className="rounded border border-slate-200 p-1.5 bg-white">
              <QRCodeSVG value={verifyUrl} size={60} />
            </div>
          )}
          <div className="flex items-end gap-4 ml-auto">
            {tpl?.showSeal !== false && branding?.officialSealUrl && (
              <img src={branding.officialSealUrl} alt="Seal" className="h-12 w-12 object-contain" />
            )}
            {tpl?.showSignature !== false && branding?.authorizedSignatureUrl && (
              <div className="text-right text-xs">
                <img src={branding.authorizedSignatureUrl} alt="Signature" className="h-8 w-24 object-contain ml-auto" />
                <p className="font-semibold text-slate-900">{branding.signatoryTitle || 'Director'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CertificateView({
  cert,
  branding,
  templates,
  onDownloadLog,
}: {
  cert: CertificateRecord;
  branding?: BrandingConfig;
  templates?: DocumentTemplateConfig[];
  onDownloadLog?: (certId: string) => void;
}) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const tpl = findTemplate(
    templates,
    cert.documentType === 'Registration Certificate' ? 'registration_certificate' : 'course_certificate'
  );
  const primary = tpl?.primaryColor || '#0B1E3D';
  const verifyUrl = `${window.location.origin}/verify?cert=${encodeURIComponent(cert.certificateNo)}`;

  async function handlePdf() {
    const svg = qrWrapRef.current?.querySelector('svg') || null;
    await downloadCertificatePdf({ cert, branding, template: tpl, qrSvg: svg });
    onDownloadLog?.(cert.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h3 className="text-base font-semibold text-slate-900">
          {cert.documentType} ({cert.certificateNo})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download A4 PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      <div style={{ borderColor: primary }} className="rounded-xl border-2 bg-white p-8 space-y-6">
        {cert.isSample && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
            SAMPLE CERTIFICATE PREVIEW
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {tpl?.showLogo !== false && branding?.certificateLogoUrl && (
              <img src={branding.certificateLogoUrl} alt="Logo" className="h-12 w-12 object-contain" />
            )}
            <div>
              <p className="text-xs font-semibold tracking-wider text-blue-700">
                {tpl?.headerNote || 'SUCCESS POINT EDUCATIONAL INSTITUTE · DHUBRI, ASSAM'}
              </p>
              <h4 className="mt-1 text-2xl font-bold text-[#0B1E3D]">{cert.documentType}</h4>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Certificate Number</p>
            <p className="font-mono text-sm font-bold text-slate-900">{cert.certificateNo}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-700">
          This is to certify that{' '}
          <span className="font-bold text-slate-900">{cert.studentName}</span>, S/O or D/O{' '}
          <span className="font-semibold text-slate-900">{cert.fatherName}</span>
          {cert.studentCode ? ` (Student ID: ${cert.studentCode})` : ''}, has fulfilled the
          institutional training and evaluation requirements for{' '}
          <span className="font-bold text-blue-800">{cert.courseName}</span> at{' '}
          <span className="font-medium text-slate-900">{cert.centreName}</span> ({cert.district}),
          achieving <span className="font-mono font-bold text-slate-900">{cert.grade}</span>.
        </p>

        <div className="flex flex-wrap items-end justify-between gap-6 pt-4 border-t border-slate-200">
          <div className="space-y-1 text-xs text-slate-600">
            <div
              className={`inline-flex items-center gap-1.5 font-semibold ${
                cert.status === 'Cancelled' ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Status: {cert.status}</span>
            </div>
            <p className="font-mono">Issue Date: {cert.issueDate}</p>
            {cert.replacesCertificateNo && (
              <p className="font-mono text-blue-700">Replaces: {cert.replacesCertificateNo}</p>
            )}
            <p className="text-[11px] text-slate-500">
              {tpl?.footerNote || 'Institutional skill/training certificate. Verify authenticity at /verify.'}
            </p>
          </div>
          <div className="flex items-end gap-4">
            {tpl?.showQr !== false && (
              <div ref={qrWrapRef} className="rounded-lg border border-slate-200 p-2 bg-white">
                <QRCodeSVG value={verifyUrl} size={72} />
              </div>
            )}
            {tpl?.showSeal !== false && branding?.officialSealUrl && (
              <img src={branding.officialSealUrl} alt="Official Seal" className="h-14 w-14 object-contain" />
            )}
            {tpl?.showSignature !== false && branding?.authorizedSignatureUrl && (
              <div className="text-right text-xs">
                <img
                  src={branding.authorizedSignatureUrl}
                  alt="Authorized Signature"
                  className="h-8 w-24 object-contain ml-auto"
                />
                <p className="font-semibold text-slate-900">
                  {branding.signatoryTitle || 'Director & Controller'}
                </p>
                <p className="text-slate-500">Success Point, Dhubri</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeeReceiptRow({ payment }: { payment: PaymentRecord }) {
  return (
    <tr className="border-b border-slate-200 text-sm hover:bg-slate-50">
      <td className="py-3 px-3 font-mono text-xs font-semibold text-slate-900">{payment.receiptNo}</td>
      <td className="py-3 px-3 text-slate-700">{payment.courseName}</td>
      <td className="py-3 px-3 font-mono text-xs text-slate-600">
        {payment.method} · {payment.transactionRef}
      </td>
      <td className="py-3 px-3 font-mono font-semibold text-slate-900 text-right">
        ₹{payment.amount.toLocaleString('en-IN')}
      </td>
      <td className="py-3 px-3 font-mono text-xs text-slate-500">{payment.paidAt.slice(0, 10)}</td>
      <td className="py-3 px-3 text-xs font-medium text-emerald-700">{payment.status}</td>
    </tr>
  );
}
