'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles, MapPin, Send, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, Mail, User
} from 'lucide-react';

const COPY = {
  de: {
    title: '✨ Bald auch in deiner Gegend',
    subtitle: 'Entschuldigung — wir haben deine Adresse noch nicht erreicht.',
    body: 'BlinkGo wächst ständig. Wir freuen uns darauf, bald auch deine Gegend zu bedienen.',
    where: 'Sag uns, wo du BlinkGo haben möchtest.',
    address: 'Adresse',
    addressPh: 'Straße und Hausnummer',
    postal: 'Postleitzahl',
    postalPh: 'PLZ',
    city: 'Stadt',
    cityPh: 'Stadt',
    name: 'Name (optional)',
    namePh: 'Dein Name',
    email: 'E-Mail (optional)',
    emailPh: 'deine@email.de',
    notes: 'Anmerkungen (optional)',
    notesPh: 'Etwas, das wir wissen sollten?',
    submit: 'Anfrage senden',
    submitting: 'Wird gesendet…',
    success: 'Danke! Wir haben deine Anfrage erhalten.',
    successDesc: 'Wir benachrichtigen dich, sobald wir deine Gegend beliefern.',
    distance: 'Entfernung',
    away: 'Du bist ca. {km} km außerhalb unserer aktuellen Lieferzone.',
    back: '← Zurück zur Startseite',
    notProvided: 'Optional',
  },
  ar: {
    title: '✨ قريباً في منطقتك',
    subtitle: 'عذراً — لم نصل إلى عنوانك بعد.',
    body: 'BlinkGo في توسع مستمر. نتطلع لخدمتك قريباً.',
    where: 'أخبرنا أين تريد BlinkGo.',
    address: 'العنوان',
    addressPh: 'الشارع ورقم المنزل',
    postal: 'الرمز البريدي',
    postalPh: 'الرمز البريدي',
    city: 'المدينة',
    cityPh: 'المدينة',
    name: 'الاسم (اختياري)',
    namePh: 'اسمك',
    email: 'البريد الإلكتروني (اختياري)',
    emailPh: 'بريدك@email.com',
    notes: 'ملاحظات (اختيارية)',
    notesPh: 'شيء يجب أن نعرفه؟',
    submit: 'إرسال الطلب',
    submitting: 'جاري الإرسال…',
    success: 'شكراً! استلمنا طلبك.',
    successDesc: 'سنخبرك عندما نبدأ بالتوصيل إلى منطقتك.',
    distance: 'المسافة',
    away: 'أنت على بعد {km} كم تقريباً من منطقة التوصيل الحالية.',
    back: '→ العودة إلى الرئيسية',
    notProvided: 'اختياري',
  },
  en: {
    title: '✨ Coming Soon to Your Area',
    subtitle: "Sorry, we haven't reached your address yet.",
    body: 'BlinkGo is continuously expanding and we look forward to serving your area soon.',
    where: 'Tell us where you want BlinkGo.',
    address: 'Address',
    addressPh: 'Street and number',
    postal: 'Postal code',
    postalPh: 'Postal code',
    city: 'City',
    cityPh: 'City',
    name: 'Name (optional)',
    namePh: 'Your name',
    email: 'Email (optional)',
    emailPh: 'your@email.com',
    notes: 'Notes (optional)',
    notesPh: 'Anything we should know?',
    submit: 'Send request',
    submitting: 'Sending…',
    success: 'Thanks! We got your request.',
    successDesc: 'We will notify you as soon as we start delivering to your area.',
    distance: 'Distance',
    away: 'You are about {km} km outside our current delivery zone.',
    back: '← Back to home',
    notProvided: 'Optional',
  },
};

interface ComingSoonProps {
  distanceKm?: number;
}

export function ComingSoon({ distanceKm }: ComingSoonProps) {
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');
  const [form, setForm] = useState({ address: '', postal_code: '', city: '', name: '', email: '', notes: '' });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const m = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
      const v = m?.split('=')[1]?.trim();
      if (v === 'ar' || v === 'en' || v === 'de') setLocale(v);
    }
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const ArrowBack = dir === 'rtl' ? ArrowRight : ArrowLeft;

  async function geocodeAndSubmit() {
    setError(null);
    if (!form.address || !form.city) {
      setError(locale === 'ar' ? 'يرجى إدخال العنوان والمدينة' : locale === 'de' ? 'Bitte Adresse und Stadt eingeben' : 'Please enter address and city');
      return;
    }

    setSubmitting(true);
    try {
      // Try to geocode the address to capture coordinates
      let lat = coords?.lat;
      let lng = coords?.lng;
      try {
        const q = `${form.address}, ${form.postal_code} ${form.city}, Germany`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'BlinkGo/1.0 (contact@blinkgo.de)' },
        });
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr) && arr[0]) {
            lat = parseFloat(arr[0].lat);
            lng = parseFloat(arr[0].lon);
            setCoords({ lat, lng });
          }
        }
      } catch {
        // geocoding is best-effort
      }

      const res = await fetch('/api/expansion-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          postal_code: form.postal_code,
          lat: lat ?? 50.8233, // fallback: Wesseling center
          lng: lng ?? 6.9772,
          name: form.name || null,
          email: form.email || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data?.error?.message || 'Failed to submit');
        return;
      }
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir={dir} className="min-h-screen bg-bg relative overflow-hidden flex items-center justify-center px-4 py-8">
      {/* Premium background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-red-500/15 blur-[140px]" />
        <div className="absolute bottom-0 end-0 w-[500px] h-[500px] rounded-full bg-brand-yellow-500/15 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-brand-red-500/8 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><path d='M0 40 L80 40 M40 0 L40 80' stroke='%23F5B819' stroke-width='0.5'/></svg>")`,
        }} />
      </div>
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-red-600 via-accent-500 to-brand-red-600 z-50" />

      <div className="relative w-full max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-text-muted hover:text-text mb-6 transition-colors">
          <ArrowBack className="w-4 h-4" />
          {t.back}
        </Link>

        {success ? (
          <div className="card-glass p-8 sm:p-10 text-center animate-fade-in">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-success/20 blur-xl" />
              <div className="relative w-full h-full rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-success" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-text mb-2">{t.success}</h1>
            <p className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
              {t.successDesc}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-3xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong transition-all"
            >
              {t.back}
              <Arrow className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-6 sm:mb-8">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-red-500/30 to-brand-yellow-500/20 blur-2xl" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-brand-red-500/20 to-brand-yellow-500/10 border-2 border-brand-red-500/30 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-brand-red-500" strokeWidth={2} />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-text mb-2">{t.title}</h1>
              <p className="text-base sm:text-lg text-text-secondary max-w-md mx-auto leading-relaxed">
                {t.subtitle}
              </p>
              <p className="text-sm text-text-muted max-w-md mx-auto mt-2">
                {t.body}
              </p>
              {distanceKm != null && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-elevated border border-edge">
                  <MapPin className="w-3.5 h-3.5 text-brand-red-500" />
                  <span className="text-xs font-bold text-text-secondary">
                    {t.away.replace('{km}', distanceKm.toFixed(1))}
                  </span>
                </div>
              )}
            </div>

            <div className="card-glass p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-brand-red-500" strokeWidth={2} />
                </div>
                <h2 className="text-sm font-extrabold text-text">{t.where}</h2>
              </div>

              {error && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-danger font-semibold flex-1">{error}</p>
                </div>
              )}

              <form
                onSubmit={(e) => { e.preventDefault(); geocodeAndSubmit(); }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                    {t.address}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      required
                      placeholder={t.addressPh}
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                      {t.postal}
                    </label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                      placeholder={t.postalPh}
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full px-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                      {t.city}
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      required
                      placeholder={t.cityPh}
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full px-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                      {t.name}
                    </label>
                    <div className="relative">
                      <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={t.namePh}
                        style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                        className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                      {t.email}
                    </label>
                    <div className="relative">
                      <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        type="email"
                        inputMode="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder={t.emailPh}
                        style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                        className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                    {t.notes}
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t.notesPh}
                    style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    className="w-full px-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="relative w-full h-12 rounded-3xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="opacity-80">{t.submitting}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 rtl:rotate-180" />
                      {t.submit}
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
