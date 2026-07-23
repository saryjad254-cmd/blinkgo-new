/**
 * Data Subject Request Form (DSGVO Art. 15-21)
 * ──────────────────────────────────────────────
 *
 * Public, no-auth-required form to submit a DSAR. The request
 * is stored in the `data_subject_requests` table (created via
 * a future migration if needed). For now, the form sends
 * an email to the configured legal contact and writes a
 * pending record via a service-role API.
 *
 * Authenticated users get a faster path: a "Download my data"
 * button generates a JSON export from the server.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

const T = {
  de: {
    title: 'Datenschutz-Anfrage (Art. 15-21 DSGVO)',
    intro: 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Füllen Sie das Formular aus — wir antworten innerhalb von 30 Tagen.',
    types: {
      access: 'Auskunft (Art. 15)',
      rectification: 'Berichtigung (Art. 16)',
      erasure: 'Löschung (Art. 17)',
      restriction: 'Einschränkung (Art. 18)',
      portability: 'Datenübertragbarkeit (Art. 20)',
      objection: 'Widerspruch (Art. 21)',
      consent_withdrawal: 'Einwilligungs-Widerruf (Art. 7(3))',
    },
    name: 'Vollständiger Name',
    email: 'E-Mail-Adresse',
    accountEmail: 'E-Mail-Adresse Ihres BlinkGo-Kontos (falls abweichend)',
    details: 'Beschreibung Ihrer Anfrage',
    submit: 'Anfrage absenden',
    success: 'Vielen Dank. Wir haben Ihre Anfrage erhalten und melden uns innerhalb von 30 Tagen.',
    error: 'Fehler beim Senden. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt an: ',
    back: 'Zurück zur Startseite',
    loginNote: 'Wenn Sie eingeloggt sind, können Sie auch direkt Ihre Daten exportieren:',
    exportNow: 'Meine Daten jetzt exportieren',
  },
  en: {
    title: 'Data Subject Request (Art. 15-21 GDPR)',
    intro: 'You have the right to access, rectification, erasure, restriction, portability, and objection. Fill out the form — we will respond within 30 days.',
    types: {
      access: 'Access (Art. 15)',
      rectification: 'Rectification (Art. 16)',
      erasure: 'Erasure (Art. 17)',
      restriction: 'Restriction (Art. 18)',
      portability: 'Portability (Art. 20)',
      objection: 'Objection (Art. 21)',
      consent_withdrawal: 'Consent withdrawal (Art. 7(3))',
    },
    name: 'Full name',
    email: 'E-mail address',
    accountEmail: 'E-mail of your BlinkGo account (if different)',
    details: 'Description of your request',
    submit: 'Submit request',
    success: 'Thank you. We received your request and will respond within 30 days.',
    error: 'Error sending. Please try again or write to us directly: ',
    back: 'Back to home',
    loginNote: 'If you are logged in, you can also export your data directly:',
    exportNow: 'Export my data now',
  },
  ar: {
    title: 'طلب خصوصية البيانات (المواد 15-21 DSGVO)',
    intro: 'يحق لك الوصول والتصحيح والمحو والتقييد وقابلية النقل والاعتراض. املأ النموذج — سنرد خلال 30 يوماً.',
    types: {
      access: 'الوصول (المادة 15)',
      rectification: 'التصحيح (المادة 16)',
      erasure: 'المحو (المادة 17)',
      restriction: 'التقييد (المادة 18)',
      portability: 'القابلية للنقل (المادة 20)',
      objection: 'الاعتراض (المادة 21)',
      consent_withdrawal: 'سحب الموافقة (المادة 7(3))',
    },
    name: 'الاسم الكامل',
    email: 'عنوان البريد الإلكتروني',
    accountEmail: 'البريد الإلكتروني لحسابك في BlinkGo (إن كان مختلفاً)',
    details: 'وصف طلبك',
    submit: 'إرسال الطلب',
    success: 'شكراً لك. تلقينا طلبك وسنرد خلال 30 يوماً.',
    error: 'خطأ في الإرسال. حاول مرة أخرى أو راسلنا مباشرة: ',
    back: 'العودة إلى الصفحة الرئيسية',
    loginNote: 'إذا كنت مسجلاً، يمكنك تصدير بياناتك مباشرة:',
    exportNow: 'تصدير بياناتي الآن',
  },
} as const;

type Locale = 'de' | 'ar' | 'en';
type RequestType = keyof typeof T.de.types;

export default function DataRequestPage() {
  const [locale] = useState<Locale>('de');
  const [type, setType] = useState<RequestType>('access');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const t = T[locale];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrMsg('');
    try {
      const res = await fetch('/api/legal/data-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, email, account_email: accountEmail, details }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus('success');
        setName('');
        setEmail('');
        setAccountEmail('');
        setDetails('');
      } else {
        setStatus('error');
        setErrMsg(json.error?.message || 'Unknown error');
      }
    } catch (err: any) {
      setStatus('error');
      setErrMsg(err.message || 'Network error');
    }
  };

  return (
    <article>
      <h1 className="text-3xl font-bold mb-4">{t.title}</h1>
      <p className="text-sm mb-6">{t.intro}</p>

      <p className="text-sm mb-4">
        {t.loginNote}{' '}
        <Link href="/account/export" className="text-brand-red underline">
          {t.exportNow}
        </Link>
      </p>

      <form onSubmit={submit} className="space-y-4 max-w-xl">
        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1">Type</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as RequestType)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
            required
          >
            {Object.entries(t.types).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">{t.name}</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
            required
            minLength={2}
            maxLength={200}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">{t.email}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
            required
          />
        </div>

        <div>
          <label htmlFor="accountEmail" className="block text-sm font-medium mb-1">{t.accountEmail}</label>
          <input
            id="accountEmail"
            type="email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
          />
        </div>

        <div>
          <label htmlFor="details" className="block text-sm font-medium mb-1">{t.details}</label>
          <textarea
            id="details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
            maxLength={2000}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'sending'}
          className="bg-brand-red text-white px-6 py-2 rounded font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {status === 'sending' ? '…' : t.submit}
        </button>

        {status === 'success' && (
          <p role="status" className="text-green-700 text-sm">{t.success}</p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-red-700 text-sm">{t.error}{errMsg}</p>
        )}
      </form>

      <div className="mt-8">
        <Link href="/" className="text-sm text-brand-red underline">{t.back}</Link>
      </div>
    </article>
  );
}
