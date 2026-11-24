import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { WhatsAppSettings } from '../types/institute';

export function WhatsAppWidget({ settings }: { settings?: WhatsAppSettings }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!settings?.enabled || !settings.popupEnabled) return;
    const dismissedKey = 'spei_wa_dismissed_session';
    if (sessionStorage.getItem(dismissedKey)) return;

    const delayMs = Math.max(10, settings.popupDelaySeconds || 12) * 1000;
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [settings?.enabled, settings?.popupEnabled, settings?.popupDelaySeconds]);

  if (!settings?.enabled || !settings.number) return null;

  const cleanNum = settings.number.replace(/\D/g, '');
  const quickLinks = [
    { label: 'Admission Enquiry', msg: settings.admissionMessage },
    { label: 'Course Details & Fees', msg: settings.courseMessage },
    { label: 'Franchise Opportunity', msg: settings.franchiseMessage },
    { label: 'Student Support Desk', msg: settings.supportMessage },
  ];

  function dismiss() {
    sessionStorage.setItem('spei_wa_dismissed_session', '1');
    setOpen(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 no-print">
      {open && (
        <div className="w-80 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="bg-emerald-700 px-4 py-3 text-white flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{settings.welcomeHeading}</p>
              <p className="text-[11px] text-emerald-100">{settings.workingHoursNote}</p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close WhatsApp popup"
              className="rounded p-1 text-emerald-100 hover:bg-emerald-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-600 leading-relaxed">{settings.popupText}</p>
            <div className="space-y-1.5">
              {quickLinks.map((item) => (
                <a
                  key={item.label}
                  href={`https://wa.me/${cleanNum}?text=${encodeURIComponent(item.msg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:border-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <span>{item.label}</span>
                  <span className="text-emerald-700">Chat &rarr;</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? dismiss() : setOpen(true))}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-xs font-semibold text-white shadow-lg hover:bg-emerald-800 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        <span>WhatsApp Desk</span>
      </button>
    </div>
  );
}
