/**
 * Draft banner — displayed on every legal page until the operator
 * has set LEGAL_REVIEW_STATUS=APPROVED in the environment.
 *
 * This banner is REQUIRED on every legal page during the draft
 * phase to ensure the operator cannot accidentally treat
 * machine-generated legal text as attorney-approved.
 *
 * Translations are read from the i18n locale files via useT()
 * (which returns the translations object, NOT a function).
 */
'use client';

import { useT } from '@/lib/i18n/I18nProvider';

const FALLBACK = {
  de: {
    title: 'Entwurf — Prüfung durch Rechtsanwalt ausstehend',
    body: 'Dieser Text wurde automatisch auf Grundlage der in BlinkGo hinterlegten Datenstruktur erstellt. Er ist kein Ersatz für eine Rechtsberatung. Vor der kommerziellen Inbetriebnahme muss dieser Text von einem auf deutsches IT-/E-Commerce-Recht spezialisierten Rechtsanwalt geprüft und freigegeben werden.',
  },
  en: {
    title: 'Draft — Lawyer review pending',
    body: 'This text was auto-generated based on BlinkGo data structures. It is not a substitute for legal advice. Before commercial launch, this text must be reviewed and approved by a German attorney specialized in IT/e-commerce law.',
  },
  ar: {
    title: 'مسودة — بانتظار مراجعة المحامي',
    body: 'تم إنشاء هذا النص تلقائياً بناءً على هياكل بيانات BlinkGo. وهو ليس بديلاً عن المشورة القانونية. قبل الإطلاق التجاري، يجب مراجعة هذا النص والموافقة عليه من قبل محامٍ متخصص في القانون الألماني.',
  },
};

export function LegalBanner() {
  const tr = useT() as any;
  // useT() returns the translations object. New keys are optional
  // and may not exist yet, so we always fall back to FALLBACK.
  const locale: 'de' | 'ar' | 'en' = (tr?.common?.locale === 'ar' || tr?.common?.locale === 'en') ? tr.common.locale : 'de';
  const fb = FALLBACK[locale] || FALLBACK.de;
  const title = (tr as any)?.legal?.banner?.title || fb.title;
  const body = (tr as any)?.legal?.banner?.body || fb.body;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 my-6 text-sm"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl" aria-hidden>⚠️</div>
        <div>
          <p className="font-bold text-amber-900 dark:text-amber-200">{title}</p>
          <p className="text-amber-800 dark:text-amber-300 mt-1">{body}</p>
        </div>
      </div>
    </div>
  );
}
