'use client';

import { useMemo, useState } from 'react';
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';
import type { RestaurantSpecialHour } from '@/lib/restaurant-hours';

const COPY = {
  de: { title: 'Sonder- & Feiertagszeiten', sub: 'Ein Eintrag für ein Datum überschreibt die regulären Öffnungszeiten.', date: 'Datum', closed: 'Ganztägig geschlossen', open: 'Besondere Öffnungszeit', from: 'Von', to: 'Bis', reason: 'Grund (optional)', reasonPlaceholder: 'z. B. Feiertag oder Betriebsferien', save: 'Ausnahme speichern', saving: 'Wird gespeichert…', upcoming: 'Kommende Ausnahmen', empty: 'Keine kommenden Ausnahmen.', remove: 'Ausnahme löschen', saved: 'Sonderzeit gespeichert', deleted: 'Sonderzeit gelöscht', error: 'Die Sonderzeit konnte nicht gespeichert werden.', offline: 'Offline: Bitte zuerst wieder verbinden.' },
  en: { title: 'Special & holiday hours', sub: 'An entry for a date overrides the regular weekly opening hours.', date: 'Date', closed: 'Closed all day', open: 'Special opening hours', from: 'From', to: 'To', reason: 'Reason (optional)', reasonPlaceholder: 'e.g. public holiday or staff event', save: 'Save exception', saving: 'Saving…', upcoming: 'Upcoming exceptions', empty: 'No upcoming exceptions.', remove: 'Delete exception', saved: 'Special hours saved', deleted: 'Special hours deleted', error: 'Could not save special hours.', offline: 'Offline: reconnect before saving.' },
  ar: { title: 'ساعات العطل والاستثناءات', sub: 'أي استثناء بهذا التاريخ يتغلب على ساعات العمل الأسبوعية.', date: 'التاريخ', closed: 'مغلق طوال اليوم', open: 'ساعات فتح خاصة', from: 'من', to: 'إلى', reason: 'السبب (اختياري)', reasonPlaceholder: 'مثال: عطلة رسمية أو صيانة', save: 'حفظ الاستثناء', saving: 'جارٍ الحفظ…', upcoming: 'الاستثناءات القادمة', empty: 'لا توجد استثناءات قادمة.', remove: 'حذف الاستثناء', saved: 'تم حفظ ساعات الاستثناء', deleted: 'تم حذف الاستثناء', error: 'تعذر حفظ ساعات الاستثناء.', offline: 'أنت غير متصل. أعد الاتصال أولًا.' },
} as const;

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function SpecialHoursForm({ initial }: { initial: RestaurantSpecialHour[] }) {
  const { locale } = useI18n();
  const t = COPY[locale];
  const network = useOnlineStatus();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [serviceDate, setServiceDate] = useState(tomorrowKey);
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => a.service_date.localeCompare(b.service_date)), [items]);

  async function save() {
    if (!network.isOnline || busy) return setError(t.offline);
    setBusy('save'); setError(null);
    try {
      const response = await fetch('/api/restaurant/special-hours', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_date: serviceDate, is_closed: isClosed, open_time: isClosed ? null : openTime, close_time: isClosed ? null : closeTime, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(extractErrorMessage(payload, t.error));
      const saved = payload?.data?.special_hour ?? payload?.special_hour;
      if (saved) setItems((current) => [...current.filter((item) => item.service_date !== saved.service_date), saved]);
      setReason(''); toast.success(t.saved);
    } catch (cause) { const message = extractErrorMessage(cause, t.error); setError(message); toast.error(message); }
    finally { setBusy(null); }
  }

  async function remove(id?: string) {
    if (!id || !network.isOnline || busy) return;
    setBusy(id); setError(null);
    try {
      const response = await fetch(`/api/restaurant/special-hours?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(extractErrorMessage(payload, t.error));
      setItems((current) => current.filter((item) => item.id !== id)); toast.success(t.deleted);
    } catch (cause) { const message = extractErrorMessage(cause, t.error); setError(message); toast.error(message); }
    finally { setBusy(null); }
  }

  const dateLocale = locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE';
  return <section data-testid="restaurant-special-hours" className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 sm:p-6">
    <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-300"><CalendarDays className="size-5" /></span><div><h2 className="text-lg font-black text-white">{t.title}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500">{t.sub}</p></div></div>
    {error && <p role="alert" className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
      <Field label={t.date}><input data-testid="special-hours-date" type="date" min={new Date().toISOString().slice(0, 10)} value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-red-500" /></Field>
      <Field label={t.reason}><input value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} placeholder={t.reasonPlaceholder} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500" /></Field>
      <div className="flex min-h-12 items-center gap-2 sm:col-span-2"><button data-testid="special-hours-closed" type="button" aria-pressed={isClosed} onClick={() => setIsClosed(true)} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${isClosed ? 'border-red-500 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/5 text-zinc-400'}`}>{t.closed}</button><button type="button" aria-pressed={!isClosed} onClick={() => setIsClosed(false)} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${!isClosed ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-zinc-400'}`}>{t.open}</button></div>
      {!isClosed && <><Field label={t.from}><input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-red-500" /></Field><Field label={t.to}><input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-red-500" /></Field></>}
      <button data-testid="special-hours-save" type="button" onClick={() => void save()} disabled={!serviceDate || Boolean(busy) || !network.isOnline} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 font-extrabold text-white hover:bg-red-500 disabled:opacity-45 sm:col-span-2 sm:justify-self-start">{busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{busy === 'save' ? t.saving : t.save}</button>
    </div>
    <h3 className="mt-5 text-sm font-black text-white">{t.upcoming}</h3>
    <div className="mt-3 space-y-2">{sorted.length === 0 ? <p data-testid="special-hours-empty" className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">{t.empty}</p> : sorted.map((item) => <article key={item.id ?? item.service_date} data-testid="special-hours-row" data-service-date={item.service_date} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"><div><strong className="text-sm text-white">{new Intl.DateTimeFormat(dateLocale, { dateStyle: 'full' }).format(new Date(`${item.service_date}T12:00:00Z`))}</strong><p className={`mt-1 text-xs font-bold ${item.is_closed ? 'text-red-300' : 'text-emerald-300'}`}>{item.is_closed ? t.closed : `${item.open_time?.slice(0, 5)} – ${item.close_time?.slice(0, 5)}`}{item.reason ? ` · ${item.reason}` : ''}</p></div><button type="button" aria-label={t.remove} onClick={() => void remove(item.id)} disabled={Boolean(busy)} className="grid size-11 place-items-center rounded-xl border border-red-500/20 text-red-300 hover:bg-red-500/10 disabled:opacity-40">{busy === item.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button></article>)}</div>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-bold text-zinc-500">{label}{children}</label>; }
