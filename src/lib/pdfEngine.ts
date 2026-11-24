import { jsPDF } from 'jspdf';
import type {
  AdmitCardRecord,
  BrandingConfig,
  CertificateRecord,
  DocumentTemplateConfig,
  MarksheetRecord,
  MigrationRecord,
  StudentProfile,
} from '../types/institute';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [11, 30, 61];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

async function urlToPngDataUrl(src: string | undefined, maxW = 240): Promise<string | null> {
  if (!src) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load error'));
      img.src = src;
    });
    const ratio = Math.min(1, maxW / Math.max(1, img.width));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(40, Math.round(img.width * ratio));
    canvas.height = Math.max(40, Math.round(img.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function qrSvgToPngDataUrl(svgElement: SVGSVGElement | null): Promise<string | null> {
  if (!svgElement) return Promise.resolve(null);
  const serialized = new XMLSerializer().serializeToString(svgElement);
  const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(serialized)))}`;
  return urlToPngDataUrl(svgUrl, 180);
}

function drawSampleWatermark(doc: jsPDF, w: number, h: number) {
  doc.saveGraphicsState();
  doc.setTextColor(210, 215, 224);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(46);
  doc.text('SAMPLE', w / 2, h / 2, { align: 'center', angle: 30 });
  doc.restoreGraphicsState();
}

export async function downloadStudentIdPdf(params: {
  student: StudentProfile;
  branding?: BrandingConfig;
  template?: DocumentTemplateConfig;
  qrSvg?: SVGSVGElement | null;
}) {
  const { student, branding, template, qrSvg } = params;
  const primary = hexToRgb(template?.primaryColor || '#0B1E3D');
  const accent = hexToRgb(template?.accentColor || '#1D4ED8');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setDrawColor(200, 210, 224);
  doc.roundedRect(25, 25, 160, 100, 4, 4);

  // Card header
  doc.setFillColor(...primary);
  doc.rect(25, 25, 160, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SUCCESS POINT EDUCATIONAL INSTITUTE', 31, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(template?.headerNote || 'GTB Road, Ward No. 12, Dhubri, Assam 783301', 31, 39);
  doc.text('STUDENT ID CARD', 179, 36, { align: 'right' });

  if (student.isSample) {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SAMPLE RECORD', 179, 49, { align: 'right' });
  }

  const photoPng = await urlToPngDataUrl(student.photoUrl, 160);
  if (photoPng) {
    doc.addImage(photoPng, 'PNG', 31, 51, 26, 32);
  } else {
    doc.setDrawColor(...accent);
    doc.rect(31, 51, 26, 32);
    doc.setTextColor(...primary);
    doc.setFontSize(12);
    doc.text(student.fullName.slice(0, 2).toUpperCase(), 44, 69, { align: 'center' });
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(student.fullName, 62, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Student ID: ${student.studentId}`, 62, 62);
  doc.text(`Reg No: ${student.registrationNumber}`, 62, 67);
  doc.text(`Roll No: ${student.rollNumber}`, 62, 72);
  doc.text(`Course: ${student.courseName.slice(0, 48)}`, 62, 77);
  doc.text(`Centre: ${student.centreCode} (${student.district})`, 62, 82);
  doc.text(`Session: ${student.academicSession} | Reg Date: ${student.registrationDate}`, 62, 87);

  const qrPng = await qrSvgToPngDataUrl(qrSvg || null);
  if (qrPng && template?.showQr !== false) {
    doc.addImage(qrPng, 'PNG', 155, 56, 22, 22);
  }
  const sealPng = await urlToPngDataUrl(branding?.officialSealUrl, 120);
  if (sealPng && template?.showSeal !== false) {
    doc.addImage(sealPng, 'PNG', 132, 92, 18, 18);
  }
  const sigPng = await urlToPngDataUrl(branding?.authorizedSignatureUrl, 140);
  if (sigPng && template?.showSignature !== false) {
    doc.addImage(sigPng, 'PNG', 152, 94, 28, 10);
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(25, 113, 160, 12, 'F');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7.5);
  doc.text(template?.footerNote || 'Non-transferable institutional identity card.', 31, 120);

  doc.save(`Student-ID-${student.studentId.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`);
}

export async function downloadAdmitCardPdf(params: {
  admitCard: AdmitCardRecord;
  branding?: BrandingConfig;
  template?: DocumentTemplateConfig;
  qrSvg?: SVGSVGElement | null;
}) {
  const { admitCard, branding, template, qrSvg } = params;
  const primary = hexToRgb(template?.primaryColor || '#0B1E3D');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setDrawColor(...primary);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, 186, 273);
  if (template?.borderStyle === 'double') {
    doc.setLineWidth(0.3);
    doc.rect(14.5, 14.5, 181, 268);
  }
  if (admitCard.isSample) drawSampleWatermark(doc, 210, 297);

  const logoPng = await urlToPngDataUrl(branding?.admitCardLogoUrl || branding?.websiteLogoUrl, 120);
  if (logoPng && template?.showLogo !== false) {
    doc.addImage(logoPng, 'PNG', 18, 18, 16, 16);
  }

  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SUCCESS POINT EDUCATIONAL INSTITUTE', 105, 25, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(template?.headerNote || 'EXAMINATION CELL · DHUBRI HEAD OFFICE, ASSAM', 105, 31, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('OFFICIAL EXAMINATION ADMIT CARD', 105, 40, { align: 'center' });

  doc.line(18, 45, 192, 45);

  const rows: [string, string][] = [
    ['Admit Card No.', admitCard.admitCardNo],
    ['Student ID', admitCard.studentId],
    ['Registration No.', admitCard.registrationNumber],
    ['Candidate Name', admitCard.studentName],
    ["Father's Name", admitCard.fatherName],
    ['Course & Code', `${admitCard.courseName} (${admitCard.courseCode})`],
    ['Examination', `${admitCard.examName} (${admitCard.examSession})`],
    ['Exam Centre', admitCard.examCentre],
    ['Exam Date & Time', `${admitCard.examDate} · ${admitCard.examTiming}`],
    ['Approval Status', `${admitCard.status}${admitCard.approvedBy ? ` by ${admitCard.approvedBy}` : ''}`],
  ];

  let y = 55;
  doc.setFontSize(9.5);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v).slice(0, 68), 64, y);
    y += 8;
  }

  const photoPng = await urlToPngDataUrl(admitCard.photoUrl, 160);
  if (photoPng) {
    doc.addImage(photoPng, 'PNG', 162, 52, 26, 32);
  } else {
    doc.rect(162, 52, 26, 32);
    doc.setFontSize(8);
    doc.text('PHOTO', 175, 69, { align: 'center' });
  }

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Scheduled Papers / Subjects', 20, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const sub of admitCard.subjects) {
    doc.text(`• ${sub}`, 24, y);
    y += 6.5;
  }

  const qrPng = await qrSvgToPngDataUrl(qrSvg || null);
  if (qrPng && template?.showQr !== false) {
    doc.addImage(qrPng, 'PNG', 20, 232, 24, 24);
  }
  const sealPng = await urlToPngDataUrl(branding?.officialSealUrl, 140);
  if (sealPng && template?.showSeal !== false) {
    doc.addImage(sealPng, 'PNG', 112, 228, 22, 22);
  }
  const sigPng = await urlToPngDataUrl(branding?.authorizedSignatureUrl, 150);
  if (sigPng && template?.showSignature !== false) {
    doc.addImage(sigPng, 'PNG', 148, 230, 36, 12);
  }
  doc.setFontSize(8.5);
  doc.text(branding?.signatoryTitle || 'Controller of Examinations', 166, 250, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(template?.footerNote || 'Bring printed Admit Card and Student ID Card to the examination hall.', 105, 275, { align: 'center' });
  doc.save(`Admit-Card-${admitCard.admitCardNo}.pdf`);
}

export async function downloadMarksheetPdf(params: {
  marksheet: MarksheetRecord;
  branding?: BrandingConfig;
  template?: DocumentTemplateConfig;
  qrSvg?: SVGSVGElement | null;
}) {
  const { marksheet, branding, template, qrSvg } = params;
  const primary = hexToRgb(template?.primaryColor || '#0B1E3D');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setDrawColor(...primary);
  doc.setLineWidth(0.9);
  doc.rect(12, 12, 186, 273);
  doc.setLineWidth(0.3);
  doc.rect(15, 15, 180, 267);
  if (marksheet.isSample) drawSampleWatermark(doc, 210, 297);

  const logoPng = await urlToPngDataUrl(branding?.marksheetLogoUrl || branding?.websiteLogoUrl, 120);
  if (logoPng && template?.showLogo !== false) {
    doc.addImage(logoPng, 'PNG', 20, 19, 16, 16);
  }

  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SUCCESS POINT EDUCATIONAL INSTITUTE', 105, 26, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(template?.headerNote || 'STATEMENT OF MARKS · INSTITUTIONAL EVALUATION', 105, 32, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ACADEMIC MARKSHEET', 105, 41, { align: 'center' });

  doc.line(20, 46, 190, 46);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Marksheet No: ${marksheet.marksheetNo}`, 20, 54);
  doc.text(`Student ID: ${marksheet.studentId}`, 130, 54);
  doc.text(`Student Name: ${marksheet.studentName}`, 20, 61);
  doc.text(`Reg No: ${marksheet.registrationNumber}`, 130, 61);
  doc.text(`Father's Name: ${marksheet.fatherName}`, 20, 68);
  doc.text(`Session: ${marksheet.academicSession}`, 130, 68);
  doc.text(`Program: ${marksheet.courseName.slice(0, 72)}`, 20, 75);
  doc.text(`Examination: ${marksheet.examName}`, 20, 82);

  // Table header
  let y = 92;
  doc.setFillColor(...primary);
  doc.rect(20, y, 170, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Code', 23, y + 5.5);
  doc.text('Subject Title', 45, y + 5.5);
  doc.text('Max', 132, y + 5.5, { align: 'right' });
  doc.text('Pass', 152, y + 5.5, { align: 'right' });
  doc.text('Obtained', 184, y + 5.5, { align: 'right' });

  y += 8;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  for (const s of marksheet.subjects) {
    doc.rect(20, y, 170, 8);
    doc.text(s.subjectCode, 23, y + 5.5);
    doc.text(s.subjectName.slice(0, 46), 45, y + 5.5);
    doc.text(String(s.maxMarks), 132, y + 5.5, { align: 'right' });
    doc.text(String(s.passingMarks), 152, y + 5.5, { align: 'right' });
    doc.text(String(s.obtainedMarks), 184, y + 5.5, { align: 'right' });
    y += 8;
  }

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `Total Marks: ${marksheet.totalObtainedMarks} / ${marksheet.totalMaxMarks}   |   Percentage: ${marksheet.percentage}%   |   Grade: ${marksheet.grade}   |   Result: ${marksheet.resultStatus}`,
    20,
    y
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Issue Date: ${marksheet.issueDate} | Status: ${marksheet.status}`, 20, y + 7);

  const qrPng = await qrSvgToPngDataUrl(qrSvg || null);
  if (qrPng && template?.showQr !== false) {
    doc.addImage(qrPng, 'PNG', 20, 232, 24, 24);
  }
  const sealPng = await urlToPngDataUrl(branding?.officialSealUrl, 140);
  if (sealPng && template?.showSeal !== false) {
    doc.addImage(sealPng, 'PNG', 112, 228, 22, 22);
  }
  const sigPng = await urlToPngDataUrl(branding?.authorizedSignatureUrl, 150);
  if (sigPng && template?.showSignature !== false) {
    doc.addImage(sigPng, 'PNG', 148, 230, 36, 12);
  }
  doc.setFontSize(8.5);
  doc.text(branding?.signatoryTitle || 'Director & Controller', 166, 250, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(template?.footerNote || 'Verify authenticity at /verify.', 105, 275, { align: 'center' });

  doc.save(`Marksheet-${marksheet.marksheetNo}.pdf`);
}

export async function downloadMigrationPdf(params: {
  migration: MigrationRecord;
  branding?: BrandingConfig;
  template?: DocumentTemplateConfig;
  qrSvg?: SVGSVGElement | null;
}) {
  const { migration, branding, template, qrSvg } = params;
  const primary = hexToRgb(template?.primaryColor || '#0B1E3D');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setDrawColor(...primary);
  doc.setLineWidth(1);
  doc.rect(14, 14, 182, 269);
  if (migration.isSample) drawSampleWatermark(doc, 210, 297);

  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SUCCESS POINT EDUCATIONAL INSTITUTE', 105, 28, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('GTB Road, Ward No. 12, Dhubri, Assam 783301', 105, 34, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(migration.authorizationType.toUpperCase(), 105, 45, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Migration Ref No: ${migration.migrationNo}`, 22, 58);
  doc.text(`Issue Date: ${migration.issueDate || 'Pending Approval'}`, 188, 58, { align: 'right' });

  const body = `This is to certify that ${migration.studentName}, S/O or D/O ${migration.fatherName}, bearing Student ID ${migration.studentId} (Registration No: ${migration.registrationNumber}), was enrolled in "${migration.courseName}" during Academic Session ${migration.academicSession}.\n\nLast Examination / Assessment Details: ${migration.lastExamDetails}.\n\nThe institution has verified academic documents (${migration.documentVerified ? 'Verified' : 'Pending'}) and fee clearance (${migration.feeVerified ? 'Cleared' : 'Pending'}). This ${migration.authorizationType} is issued upon request for academic progression toward ${migration.targetInstitution}.\n\nNote: This document reflects Success Point Educational Institute's authorized institutional record only and does not claim statutory university degree-granting authority.`;
  const lines = doc.splitTextToSize(body, 164);
  doc.setFontSize(10.5);
  doc.text(lines, 22, 74);

  const qrPng = await qrSvgToPngDataUrl(qrSvg || null);
  if (qrPng && template?.showQr !== false) {
    doc.addImage(qrPng, 'PNG', 22, 228, 25, 25);
  }
  const sealPng = await urlToPngDataUrl(branding?.officialSealUrl, 140);
  if (sealPng && template?.showSeal !== false) {
    doc.addImage(sealPng, 'PNG', 112, 225, 24, 24);
  }
  const sigPng = await urlToPngDataUrl(branding?.authorizedSignatureUrl, 150);
  if (sigPng && template?.showSignature !== false) {
    doc.addImage(sigPng, 'PNG', 148, 228, 36, 12);
  }
  doc.setFontSize(9);
  doc.text(branding?.signatoryTitle || 'Director & Registrar', 166, 248, { align: 'center' });

  doc.save(`Migration-${migration.migrationNo}.pdf`);
}

export async function downloadCertificatePdf(params: {
  cert: CertificateRecord;
  branding?: BrandingConfig;
  template?: DocumentTemplateConfig;
  qrSvg?: SVGSVGElement | null;
}) {
  const { cert, branding, template, qrSvg } = params;
  const primary = hexToRgb(template?.primaryColor || '#0B1E3D');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setDrawColor(...primary);
  doc.setLineWidth(1.2);
  doc.rect(12, 12, 273, 186);
  doc.setLineWidth(0.4);
  doc.rect(15.5, 15.5, 266, 179);
  if (cert.isSample) drawSampleWatermark(doc, 297, 210);

  const logoPng = await urlToPngDataUrl(branding?.certificateLogoUrl || branding?.websiteLogoUrl, 120);
  if (logoPng && template?.showLogo !== false) {
    doc.addImage(logoPng, 'PNG', 24, 22, 18, 18);
  }

  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SUCCESS POINT EDUCATIONAL INSTITUTE', 148.5, 30, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(template?.headerNote || 'GTB Road, Ward No. 12, Dhubri, Assam 783301', 148.5, 37, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(cert.documentType.toUpperCase(), 148.5, 55, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Certificate No: ${cert.certificateNo}`, 24, 68);
  doc.text(`Issue Date: ${cert.issueDate}`, 273, 68, { align: 'right' });

  const body = `This is to certify that ${cert.studentName}, S/O or D/O ${cert.fatherName}${cert.studentCode ? ` (Student ID: ${cert.studentCode})` : ''}, has successfully fulfilled the institutional requirements for ${cert.courseName} at ${cert.centreName} (${cert.district}), achieving ${cert.grade}.`;
  const lines = doc.splitTextToSize(body, 236);
  doc.setFontSize(12.5);
  doc.text(lines, 148.5, 90, { align: 'center' });

  if (cert.status !== 'Issued') {
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`REGISTRY STATUS: ${cert.status.toUpperCase()}${cert.correctionNote ? ` (${cert.correctionNote})` : ''}`, 148.5, 130, { align: 'center' });
  }

  const qrPng = await qrSvgToPngDataUrl(qrSvg || null);
  if (qrPng && template?.showQr !== false) {
    doc.addImage(qrPng, 'PNG', 24, 152, 28, 28);
  }
  const sealPng = await urlToPngDataUrl(branding?.officialSealUrl, 140);
  if (sealPng && template?.showSeal !== false) {
    doc.addImage(sealPng, 'PNG', 180, 148, 26, 26);
  }
  const sigPng = await urlToPngDataUrl(branding?.authorizedSignatureUrl, 150);
  if (sigPng && template?.showSignature !== false) {
    doc.addImage(sigPng, 'PNG', 226, 150, 42, 14);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(branding?.signatoryTitle || 'Director & Controller of Examinations', 247, 173, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(template?.footerNote || 'Institutional certificate. Verify authenticity at /verify.', 148.5, 186, { align: 'center' });

  doc.save(`${cert.documentType.replace(/\s+/g, '-')}-${cert.certificateNo}.pdf`);
}
