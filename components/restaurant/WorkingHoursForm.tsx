'use client';

import { useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CalendarClock from 'lucide-react/dist/esm/icons/calendar-clock';
import Check from 'lucide-react/dist/esm/icons/check';
import Copy from 'lucide-react/dist/esm/icons/copy';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Save from 'lucide-react/dist/esm/icons/save';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { restaurantHoursToRows, rowsToRestaurantHours, type RestaurantHourRow } from '@/lib/restaurant-hours';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

const COPY = {
  de: { title: 'Öffnungszeiten', sub: 'Diese Zeiten steuern die Verfügbarkeit im Shop und beim Checkout.', open: 'Geöffnet', closed: 'Geschlossen', from: 'Von', to: 'Bis', copy: 'Montag auf Werktage', openAll: 'Alle öffnen', closeAll: 'Alle schließen', save: 'Zeiten speichern', saving: 'Wird gespeichert…', saved: 'Öffnungszeiten gespeichert', error: 'Die Öffnungszeiten konnten nicht gespeichert werden.', offline: 'Offline: Änderungen können erst nach der Verbindung gespeichert werden.', overnight: 'über Mitternacht', unsaved: 'Nicht gespeicherte Änderungen', days: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] },
  en: { title: 'Opening hours', sub: 'These hours control storefront and checkout availability.', open: 'Open', closed: 'Closed', from: 'From', to: 'To', copy: 'Copy Monday to weekdays', openAll: 'Open all', closeAll: 'Close all', save: 'Save hours', saving: 'Saving…', saved: 'Opening hours saved', error: 'Could not save opening hours.', offline: 'Offline: reconnect before saving changes.', overnight: 'overnight', unsaved: 'Unsaved changes', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  ar: { title: 'ساعات العمل', sub: 'هذه الأوقات تتحكم بظهور المطعم وإمكانية إكمال الدفع.', open: 'مفتوح', closed: 'مغلق', from: 'من', to: 'إلى', copy: 'نسخ الاثنين لأيام الأسبوع', openAll: 'فتح كل الأيام', closeAll: 'إغلاق كل الأيام', save: 'حفظ الساعات', saving: 'جارٍ الحفظ…', saved: 'تم حفظ ساعات العمل', error: 'تعذر حفظ ساعات العمل.', offline: 'أنت غير متصل: أعد الاتصال قبل الحفظ.', overnight: 'يمتد بعد منتصف الليل', unsaved: 'تغييرات غير محفوظة', days: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] },
} as const;

export function WorkingHoursForm({ initial }: { initial?: unknown }) {
  const { locale } = useI18n(); const t = COPY[locale]; const network = useOnlineStatus(); const { success, error: toastError } = useToast();
  const [hours, setHours] = useState<RestaurantHourRow[]>(() => restaurantHoursToRows(initial));
  const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [error, setError] = useState<string | null>(null);
  function change(day: RestaurantHourRow['day'], patch: Partial<RestaurantHourRow>) { setHours((current) => current.map((row) => row.day === day ? { ...row, ...patch } : row)); setDirty(true); setError(null); }
  function setAll(is_open: boolean) { setHours((current) => current.map((row) => ({ ...row, is_open }))); setDirty(true); }
  function copyMonday() { const monday = hours[0]; setHours((current) => current.map((row, index) => index < 5 ? { ...row, is_open: monday.is_open, open_time: monday.open_time, close_time: monday.close_time } : row)); setDirty(true); }
  async function save() {
    if (!network.isOnline || saving) return setError(t.offline);
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/restaurant/working-hours', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: rowsToRestaurantHours(hours) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(extractErrorMessage(payload, t.error));
      setDirty(false); success(t.saved);
    } catch (reason: unknown) { const message = extractErrorMessage(reason, t.error); setError(message); toastError(message); }
    finally { setSaving(false); }
  }
  return <section data-testid="restaurant-working-hours" className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><CalendarClock className="size-5" /></span><div><h2 className="text-lg font-black text-white">{t.title}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500">{t.sub}</p></div></div>{dirty && <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">{t.unsaved}</span>}</div>
    {!network.isOnline && <p data-testid="restaurant-hours-offline" role="alert" className="mt-4 flex items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4" />{t.offline}</p>}
    {error && <p role="alert" className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Action onClick={copyMonday} icon={<Copy className="size-4" />} label={t.copy} /><Action onClick={() => setAll(true)} icon={<Check className="size-4" />} label={t.openAll} /><Action onClick={() => setAll(false)} label={t.closeAll} /></div>
    <div className="mt-4 space-y-2">{hours.map((row, index) => {
      const overnight = row.is_open && row.close_time <= row.open_time;
      return <div data-testid="restaurant-hours-row" data-day={row.day} key={row.day} className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid sm:grid-cols-[minmax(110px,1fr)_auto_minmax(250px,1.4fr)] sm:items-center sm:gap-4">
        <strong className="text-sm text-white">{t.days[index]}</strong>
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 sm:mt-0"><input data-testid="restaurant-hours-open" type="checkbox" checked={row.is_open} onChange={(event) => change(row.day, { is_open: event.target.checked })} className="peer sr-only" /><span aria-hidden="true" className="relative h-7 w-12 rounded-full bg-zinc-700 transition peer-checked:bg-emerald-500"><span className="absolute left-1 top-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" /></span><span className={`text-xs font-bold ${row.is_open ? 'text-emerald-300' : 'text-zinc-500'}`}>{row.is_open ? t.open : t.closed}</span></label>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0"><Time label={t.from} value={row.open_time} disabled={!row.is_open} onChange={(value) => change(row.day, { open_time: value })} /><Time label={t.to} value={row.close_time} disabled={!row.is_open} onChange={(value) => change(row.day, { close_time: value })} />{overnight && <span className="col-span-2 text-end text-[11px] font-bold text-amber-300">{t.overnight}</span>}</div>
      </div>;
    })}</div>
    <button data-testid="restaurant-hours-save" type="button" onClick={() => void save()} disabled={saving || !network.isOnline || !dirty} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 font-extrabold text-white shadow-lg shadow-red-950/30 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? t.saving : t.save}</button>
  </section>;
}

function Time({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <label className="text-xs font-bold text-zinc-500">{label}<input data-testid="restaurant-hours-time" type="time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-red-500 disabled:opacity-35" /></label>; }
function Action({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-300 hover:bg-white/10">{icon}{label}</button>; }
