'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Settings2 from 'lucide-react/dist/esm/icons/settings-2';
import X from 'lucide-react/dist/esm/icons/x';
import { useI18n } from '@/lib/i18n/I18nProvider';
import {
  ACCEPT_ALL,
  CONSENT_VERSION,
  REJECT_NON_ESSENTIAL,
  readConsent,
  writeConsent,
  type ConsentCategories,
  type ConsentState,
} from '@/lib/privacy/consent';

const COPY = {
  de: {
    title: 'Deine Privatsphäre, deine Wahl',
    body: 'Notwendige Technologien halten BlinkGo sicher. Analyse und Marketing bleiben aus, bis du ausdrücklich zustimmst.',
    necessary: 'Notwendig', preferences: 'Präferenzen', analytics: 'Analyse', marketing: 'Marketing', always: 'Immer aktiv',
    reject: 'Nur notwendige', accept: 'Alle akzeptieren', save: 'Auswahl speichern', settings: 'Einstellungen', close: 'Einstellungen schließen',
    policy: 'Cookie-Details',
  },
  en: {
    title: 'Your privacy, your choice',
    body: 'Necessary technology keeps BlinkGo secure. Analytics and marketing stay off until you explicitly opt in.',
    necessary: 'Necessary', preferences: 'Preferences', analytics: 'Analytics', marketing: 'Marketing', always: 'Always on',
    reject: 'Necessary only', accept: 'Accept all', save: 'Save selection', settings: 'Settings', close: 'Close settings',
    policy: 'Cookie details',
  },
  ar: {
    title: 'خصوصيتك، اختيارك',
    body: 'التقنيات الضرورية تحافظ على أمان BlinkGo. تبقى التحليلات والتسويق متوقفة حتى توافق عليها صراحةً.',
    necessary: 'ضروري', preferences: 'التفضيلات', analytics: 'التحليلات', marketing: 'التسويق', always: 'مفعّل دائمًا',
    reject: 'الضروري فقط', accept: 'قبول الكل', save: 'حفظ الاختيار', settings: 'الإعدادات', close: 'إغلاق الإعدادات',
    policy: 'تفاصيل ملفات الارتباط',
  },
} as const;

export function CookieConsentBanner() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const copy = COPY[locale] || COPY.de;
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ConsentCategories>(REJECT_NON_ESSENTIAL);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const current = readConsent();
      setVisible(!current);
      if (current) setCategories(current.categories);
    });
    const openSettings = () => {
      const saved = readConsent();
      if (saved) setCategories(saved.categories);
      setExpanded(true);
      setVisible(true);
    };
    window.addEventListener('blinkgo:open-consent', openSettings);
    return () => {
      cancelled = true;
      window.removeEventListener('blinkgo:open-consent', openSettings);
    };
  }, []);

  async function persist(next: ConsentCategories, action: 'accept_all' | 'reject_non_essential' | 'custom') {
    setSaving(true);
    const state: ConsentState = {
      id: crypto.randomUUID(),
      version: CONSENT_VERSION,
      categories: next,
      updatedAt: new Date().toISOString(),
    };
    writeConsent(state);
    setCategories(next);
    setVisible(false);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentId: state.id, version: state.version, categories: next, action, source: 'global_banner' }),
      });
      if (!response.ok) throw new Error('consent audit failed');
    } catch (auditError) {
      // The visitor's local privacy choice remains authoritative even if the
      // append-only server audit is temporarily unavailable. The API logs the
      // failure for operators; never trap the visitor behind a recurring UI.
      console.warn('Consent audit unavailable; local privacy choice remains active.', auditError);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const isDriverRoute = pathname.startsWith('/driver');

  if (isDriverRoute && !expanded) {
    return (
      <section
        className="fixed start-3 top-1/2 z-[120] -translate-y-1/2 rounded-2xl border border-white/15 bg-[#0d0d0f]/95 p-1.5 text-white shadow-2xl backdrop-blur-xl"
        role="region"
        aria-label={copy.title}
        data-testid="cookie-consent-banner"
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="cookie-open-settings"
          className="flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-xs font-bold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc107]"
          aria-label={`${copy.title}: ${copy.settings}`}
        >
          <ShieldCheck className="h-5 w-5 text-[#ffc107]" />
          <span className="hidden sm:inline">{copy.settings}</span>
        </button>
      </section>
    );
  }

  const placement = isDriverRoute ? 'top-1/2 -translate-y-1/2' : 'bottom-3';

  return (
    <section className={`fixed inset-x-3 ${placement} z-[120] mx-auto max-h-[calc(100dvh-1.5rem)] max-w-3xl overflow-y-auto rounded-3xl border border-white/15 bg-[#0d0d0f]/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,.65)] backdrop-blur-xl sm:p-5`} role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title" data-testid="cookie-consent-banner">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#e10600] to-[#ffc107] text-black"><ShieldCheck className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="cookie-consent-title" className="text-lg font-black">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-300">{copy.body}</p>
        </div>
        {expanded && <button type="button" onClick={() => setExpanded(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc107]" aria-label={copy.close}><X className="h-5 w-5" /></button>}
      </div>

      {expanded && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="cookie-consent-settings">
          <ConsentToggle label={copy.necessary} checked disabled note={copy.always} />
          <ConsentToggle label={copy.preferences} checked={categories.preferences} onChange={(value) => setCategories((old) => ({ ...old, preferences: value }))} />
          <ConsentToggle label={copy.analytics} checked={categories.analytics} onChange={(value) => setCategories((old) => ({ ...old, analytics: value }))} />
          <ConsentToggle label={copy.marketing} checked={categories.marketing} onChange={(value) => setCategories((old) => ({ ...old, marketing: value }))} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" disabled={saving} onClick={() => persist(REJECT_NON_ESSENTIAL, 'reject_non_essential')} data-testid="cookie-reject-non-essential" className="min-h-11 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold hover:bg-white/10 disabled:opacity-60">{copy.reject}</button>
        {!expanded ? (
          <button type="button" onClick={() => setExpanded(true)} className="min-h-11 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold hover:bg-white/10"><Settings2 className="me-2 inline h-4 w-4" />{copy.settings}</button>
        ) : (
          <button type="button" disabled={saving} onClick={() => persist(categories, 'custom')} className="min-h-11 rounded-xl border border-[#ffc107]/60 px-4 py-2.5 text-sm font-bold text-[#ffc107] hover:bg-[#ffc107]/10 disabled:opacity-60">{copy.save}</button>
        )}
        <button type="button" disabled={saving} onClick={() => persist(ACCEPT_ALL, 'accept_all')} data-testid="cookie-accept-all" className="min-h-11 rounded-xl bg-[#e10600] px-5 py-2.5 text-sm font-black hover:bg-red-500 disabled:opacity-60 sm:ms-auto">{copy.accept}</button>
        <Link href="/legal/cookies" className="flex min-h-11 items-center justify-center px-2 text-sm font-semibold text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-white">{copy.policy}</Link>
      </div>
    </section>
  );
}

function ConsentToggle({ label, checked, disabled = false, note, onChange }: { label: string; checked: boolean; disabled?: boolean; note?: string; onChange?: (value: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3">
      <span className="text-sm font-bold">{label}{note && <small className="ms-2 font-normal text-zinc-400">{note}</small>}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} className="h-5 w-5 accent-[#e10600]" />
    </label>
  );
}
