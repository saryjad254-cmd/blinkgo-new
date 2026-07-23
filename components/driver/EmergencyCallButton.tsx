'use client';

import { useState, useEffect } from 'react';
import { Phone, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';

const EMERGENCY_NUMBER = '112'; // EU emergency
const SUPPORT_NUMBER = '+49 1577 1234567';

interface EmergencyContact {
  name: string;
  phone: string;
}

interface Props {
  /** Driver's saved emergency contact (from settings) */
  emergencyContact?: string | null;
}

/**
 * EmergencyCallButton
 * ───────────────────
 * Floating shortcut for emergency calls while delivering.
 * Tapping it shows a quick dialer with 112 (police/medical), the
 * driver's saved emergency contact, and BlinkGo support.
 *
 * Intentionally NOT a real modal that requires precise aiming —
 * the target is 64px+ so it can be hit while distracted.
 */
export function EmergencyCallButton({ emergencyContact }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);

  // Allow closing with Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const emergencyLabel = t.driver?.emergencyCall || 'Emergency call';
  const policeLabel = locale === 'ar' ? 'الشرطة / إسعاف' : locale === 'en' ? 'Police / Ambulance' : 'Polizei / Rettungsdienst';
  const supportLabel = locale === 'ar' ? 'دعم BlinkGo' : locale === 'en' ? 'BlinkGo support' : 'BlinkGo Support';
  const myContactLabel = locale === 'ar' ? 'جهة الاتصال الخاصة بي' : locale === 'en' ? 'My emergency contact' : 'Mein Notfallkontakt';
  const cancelLabel = locale === 'ar' ? 'إلغاء' : locale === 'en' ? 'Cancel' : 'Abbrechen';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-20 end-4 z-modal',
          'w-14 h-14 sm:w-16 sm:h-16 rounded-full',
          'bg-red-500 hover:bg-red-600 text-white',
          'flex items-center justify-center',
          'shadow-2xl shadow-red-500/40',
          'border-4 border-bg',
          'transition-all active:scale-95',
          'touch-manipulation'
        )}
        aria-label={emergencyLabel}
        title={emergencyLabel}
      >
        <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7" />
        <span className="sr-only">{emergencyLabel}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-bg-elevated border-t-2 sm:border-2 border-red-500 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                {emergencyLabel}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-10 h-10 rounded-full bg-ink-700 text-text-secondary flex items-center justify-center"
                aria-label={cancelLabel}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <a
              href={`tel:${EMERGENCY_NUMBER}`}
              className="w-full h-16 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-extrabold text-lg flex items-center justify-center gap-3 mb-3 touch-manipulation"
            >
              <Phone className="w-6 h-6" />
              <span dir="ltr">{EMERGENCY_NUMBER}</span>
              <span className="font-normal text-sm">— {policeLabel}</span>
            </a>

            {emergencyContact && (
              <a
                href={`tel:${emergencyContact}`}
                className="w-full h-14 rounded-2xl bg-ink-700 hover:bg-ink-600 text-white font-extrabold text-base flex items-center justify-center gap-3 mb-3 touch-manipulation border border-edge"
              >
                <Phone className="w-5 h-5" />
                <span dir="ltr">{emergencyContact}</span>
                <span className="font-normal text-xs text-text-muted">{myContactLabel}</span>
              </a>
            )}

            <a
              href={`tel:${SUPPORT_NUMBER.replace(/\s/g, '')}`}
              className="w-full h-12 rounded-2xl bg-ink-700 hover:bg-ink-600 text-text-secondary font-bold text-sm flex items-center justify-center gap-2 touch-manipulation"
            >
              <Phone className="w-4 h-4" />
              {supportLabel} · <span dir="ltr">{SUPPORT_NUMBER}</span>
            </a>

            <p className="text-[10px] text-text-muted text-center mt-4">
              {locale === 'ar'
                ? 'هذا الزر متاح دائماً للسلامة. استخدمه فقط في حالات الطوارئ.'
                : locale === 'en'
                ? 'This button is always available for safety. Use only in real emergencies.'
                : 'Dieser Button ist immer für die Sicherheit verfügbar. Nur in echten Notfällen verwenden.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
