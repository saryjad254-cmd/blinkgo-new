'use client';

import { useEffect, useMemo, useState } from 'react';
import Megaphone from 'lucide-react/dist/esm/icons/megaphone';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Pencil from 'lucide-react/dist/esm/icons/pencil';
import Power from 'lucide-react/dist/esm/icons/power';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import X from 'lucide-react/dist/esm/icons/x';
import CalendarClock from 'lucide-react/dist/esm/icons/calendar-clock';
import Users from 'lucide-react/dist/esm/icons/users';
import LinkIcon from 'lucide-react/dist/esm/icons/link';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

type Locale = 'de' | 'ar' | 'en';
export type Announcement = {
  id: string; title: string; message: string;
  type: 'info' | 'warning' | 'success' | 'maintenance' | 'promo';
  audience: 'all' | 'customers' | 'drivers' | 'restaurants' | 'admins';
  link_url: string | null; link_label: string | null; is_active: boolean;
  starts_at: string; ends_at: string | null; created_at: string;
};
type FormState = Omit<Announcement, 'id' | 'created_at' | 'starts_at' | 'ends_at'> & { starts_at: string; ends_at: string };

const C = {
  de: { title: 'Systemankündigungen', subtitle: 'Hinweise planen, veröffentlichen und vollständig verwalten.', create: 'Ankündigung erstellen', total: 'Gesamt', live: 'Live', scheduled: 'Geplant', inactive: 'Inaktiv', empty: 'Keine Ankündigungen in dieser Ansicht.', edit: 'Bearbeiten', activate: 'Aktivieren', deactivate: 'Deaktivieren', remove: 'Löschen', confirm: 'Diese Ankündigung endgültig löschen?', titleField: 'Titel', message: 'Nachricht', type: 'Typ', audience: 'Zielgruppe', starts: 'Start', ends: 'Ende (optional)', link: 'Interner Link (optional)', linkLabel: 'Linktext (optional)', active: 'Ankündigung aktivieren', save: 'Speichern', cancel: 'Abbrechen', created: 'Ankündigung erstellt.', updated: 'Ankündigung aktualisiert.', deleted: 'Ankündigung gelöscht.', error: 'Aktion fehlgeschlagen.', close: 'Dialog schließen', activeNow: 'Aktiv', future: 'Geplant', expired: 'Abgelaufen', disabled: 'Inaktiv' },
  ar: { title: 'إعلانات النظام', subtitle: 'جدولة الإعلانات ونشرها وإدارتها بالكامل.', create: 'إنشاء إعلان', total: 'الإجمالي', live: 'مباشر', scheduled: 'مجدول', inactive: 'غير نشط', empty: 'لا توجد إعلانات ضمن هذا العرض.', edit: 'تعديل', activate: 'تفعيل', deactivate: 'إيقاف', remove: 'حذف', confirm: 'هل تريد حذف هذا الإعلان نهائيًا؟', titleField: 'العنوان', message: 'الرسالة', type: 'النوع', audience: 'الجمهور', starts: 'وقت البدء', ends: 'وقت الانتهاء (اختياري)', link: 'رابط داخلي (اختياري)', linkLabel: 'نص الرابط (اختياري)', active: 'تفعيل الإعلان', save: 'حفظ', cancel: 'إلغاء', created: 'تم إنشاء الإعلان.', updated: 'تم تحديث الإعلان.', deleted: 'تم حذف الإعلان.', error: 'تعذر تنفيذ العملية.', close: 'إغلاق النافذة', activeNow: 'نشط', future: 'مجدول', expired: 'منتهي', disabled: 'متوقف' },
  en: { title: 'System announcements', subtitle: 'Schedule, publish, and fully manage platform notices.', create: 'Create announcement', total: 'Total', live: 'Live', scheduled: 'Scheduled', inactive: 'Inactive', empty: 'No announcements in this view.', edit: 'Edit', activate: 'Activate', deactivate: 'Deactivate', remove: 'Delete', confirm: 'Permanently delete this announcement?', titleField: 'Title', message: 'Message', type: 'Type', audience: 'Audience', starts: 'Starts', ends: 'Ends (optional)', link: 'Internal link (optional)', linkLabel: 'Link label (optional)', active: 'Activate announcement', save: 'Save', cancel: 'Cancel', created: 'Announcement created.', updated: 'Announcement updated.', deleted: 'Announcement deleted.', error: 'The action could not be completed.', close: 'Close dialog', activeNow: 'Active', future: 'Scheduled', expired: 'Expired', disabled: 'Inactive' },
} as const;
const AUDIENCES = {
  de: { all: 'Alle', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', admins: 'Administratoren' },
  ar: { all: 'الجميع', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', admins: 'الإدارة' },
  en: { all: 'Everyone', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', admins: 'Administrators' },
} as const;
const TYPES = {
  de: { info: 'Information', warning: 'Warnung', success: 'Erfolg', maintenance: 'Wartung', promo: 'Aktion' },
  ar: { info: 'معلومة', warning: 'تحذير', success: 'نجاح', maintenance: 'صيانة', promo: 'عرض' },
  en: { info: 'Information', warning: 'Warning', success: 'Success', maintenance: 'Maintenance', promo: 'Promotion' },
} as const;

function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function makeForm(item?: Announcement): FormState {
  return { title: item?.title ?? '', message: item?.message ?? '', type: item?.type ?? 'info', audience: item?.audience ?? 'all', link_url: item?.link_url ?? '', link_label: item?.link_label ?? '', is_active: item?.is_active ?? true, starts_at: localDateTime(item?.starts_at ?? new Date().toISOString()), ends_at: localDateTime(item?.ends_at ?? null) };
}
function stateOf(item: Announcement): 'live' | 'scheduled' | 'expired' | 'inactive' {
  if (!item.is_active) return 'inactive';
  if (new Date(item.starts_at).getTime() > Date.now()) return 'scheduled';
  if (item.ends_at && new Date(item.ends_at).getTime() <= Date.now()) return 'expired';
  return 'live';
}

export function AdminAnnouncementsClient({ user, locale, initialAnnouncements }: { user: AdminUser; locale: Locale; initialAnnouncements: Announcement[] }) {
  const t = C[locale];
  const [items, setItems] = useState(initialAnnouncements);
  const [filter, setFilter] = useState<'all' | 'live' | 'scheduled' | 'inactive'>('all');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => makeForm());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  const counts = useMemo(() => ({ all: items.length, live: items.filter((item) => stateOf(item) === 'live').length, scheduled: items.filter((item) => stateOf(item) === 'scheduled').length, inactive: items.filter((item) => ['inactive', 'expired'].includes(stateOf(item))).length }), [items]);
  const visible = items.filter((item) => filter === 'all' || (filter === 'inactive' ? ['inactive', 'expired'].includes(stateOf(item)) : stateOf(item) === filter));
  const showCreate = () => { setEditing(null); setForm(makeForm()); setOpen(true); setNotice(null); };
  const showEdit = (item: Announcement) => { setEditing(item); setForm(makeForm(item)); setOpen(true); setNotice(null); };

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const response = await fetch(editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, link_url: form.link_url || null, link_label: form.link_label || null, ends_at: form.ends_at || null }) });
      const data = await response.json();
      if (!response.ok || !data.announcement) throw new Error(extractErrorMessage(data, t.error));
      const next = data.announcement as Announcement;
      setItems((current) => editing ? current.map((item) => item.id === next.id ? next : item) : [next, ...current]);
      setOpen(false); setNotice({ ok: true, text: editing ? t.updated : t.created });
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : t.error }); }
    finally { setBusy(false); }
  }
  async function toggle(item: Announcement) {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/announcements/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !item.is_active }) });
      const data = await response.json();
      if (!response.ok || !data.announcement) throw new Error(extractErrorMessage(data, t.error));
      setItems((current) => current.map((entry) => entry.id === item.id ? data.announcement as Announcement : entry)); setNotice({ ok: true, text: t.updated });
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : t.error }); }
    finally { setBusy(false); }
  }
  async function remove(item: Announcement) {
    if (!window.confirm(t.confirm)) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/announcements/${item.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(extractErrorMessage(data, t.error));
      setItems((current) => current.filter((entry) => entry.id !== item.id)); setNotice({ ok: true, text: t.deleted });
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : t.error }); }
    finally { setBusy(false); }
  }
  const statusText = (item: Announcement) => ({ live: t.activeNow, scheduled: t.future, expired: t.expired, inactive: t.disabled })[stateOf(item)];
  const dateLocale = locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-GB' : 'de-DE';

  return <AdminLayout user={user} locale={locale}><main className="space-y-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-[#FFC107]"><Megaphone className="size-4" />BlinkGo Broadcast</p><h1 className="text-2xl font-black text-white sm:text-3xl">{t.title}</h1><p className="mt-1 text-sm text-text-secondary">{t.subtitle}</p></div><button type="button" onClick={showCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#E10600] px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(225,6,0,.25)] hover:bg-[#ff1710] focus:outline-none focus:ring-2 focus:ring-[#FFC107]"><Plus className="size-4" />{t.create}</button></header>
    {notice && <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm font-bold', notice.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300')}>{notice.text}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{(['all', 'live', 'scheduled', 'inactive'] as const).map((key) => <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} className={cn('min-h-20 rounded-2xl border p-4 text-start transition focus:outline-none focus:ring-2 focus:ring-[#FFC107]', filter === key ? 'border-[#E10600] bg-[#E10600]/10' : 'border-white/10 bg-[#111315] hover:border-white/20')}><span className="block text-2xl font-black text-white">{counts[key]}</span><span className="text-xs font-bold text-text-secondary">{key === 'all' ? t.total : key === 'live' ? t.live : key === 'scheduled' ? t.scheduled : t.inactive}</span></button>)}</section>
    {visible.length === 0 ? <section className="rounded-3xl border border-dashed border-white/15 bg-[#101214] px-6 py-16 text-center"><Megaphone className="mx-auto mb-3 size-10 text-white/20" /><p className="text-sm font-bold text-text-muted">{t.empty}</p></section> : <section className="grid min-w-0 gap-4 xl:grid-cols-2">{visible.map((item) => <AnnouncementCard key={item.id} item={item} locale={locale} dateLocale={dateLocale} status={statusText(item)} busy={busy} onEdit={() => showEdit(item)} onToggle={() => void toggle(item)} onRemove={() => void remove(item)} labels={{ edit: t.edit, toggle: item.is_active ? t.deactivate : t.activate, remove: t.remove }} />)}</section>}
    {open && <AnnouncementDialog locale={locale} form={form} setForm={setForm} busy={busy} editing={Boolean(editing)} onClose={() => setOpen(false)} onSave={save} />}
  </main></AdminLayout>;
}

function AnnouncementCard({ item, locale, dateLocale, status, busy, onEdit, onToggle, onRemove, labels }: { item: Announcement; locale: Locale; dateLocale: string; status: string; busy: boolean; onEdit: () => void; onToggle: () => void; onRemove: () => void; labels: { edit: string; toggle: string; remove: string } }) {
  const state = stateOf(item);
  return <article className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#151719,#0d0e10)] p-5 shadow-xl"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-black uppercase', state === 'live' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : state === 'scheduled' ? 'border-[#FFC107]/30 bg-[#FFC107]/10 text-[#FFC107]' : 'border-white/10 bg-white/5 text-text-muted')}>{status}</span><span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-text-secondary">{TYPES[locale][item.type]}</span></div><h2 className="truncate text-lg font-black text-white">{item.title}</h2></div><Megaphone className="size-6 shrink-0 text-[#E10600]" /></div><p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-text-secondary">{item.message}</p><div className="mt-4 grid min-w-0 gap-2 text-xs text-text-muted sm:grid-cols-2"><span className="flex min-w-0 items-center gap-2"><Users className="size-4 shrink-0 text-[#FFC107]" />{AUDIENCES[locale][item.audience]}</span><span className="flex min-w-0 items-center gap-2"><CalendarClock className="size-4 shrink-0 text-[#FFC107]" />{new Date(item.starts_at).toLocaleString(dateLocale)}</span>{item.ends_at && <span className="flex min-w-0 items-center gap-2"><CalendarClock className="size-4 shrink-0" />{new Date(item.ends_at).toLocaleString(dateLocale)}</span>}{item.link_url && <span className="flex min-w-0 items-center gap-2 truncate"><LinkIcon className="size-4 shrink-0" />{item.link_url}</span>}</div><div className="mt-5 grid min-w-0 grid-cols-3 gap-2 border-t border-white/10 pt-4"><Action icon={<Pencil className="size-4" />} onClick={onEdit}>{labels.edit}</Action><Action disabled={busy} className="bg-[#FFC107]/10 text-[#FFC107]" icon={<Power className="size-4" />} onClick={onToggle}>{labels.toggle}</Action><Action disabled={busy} className="bg-[#E10600]/10 text-red-300" icon={<Trash2 className="size-4" />} onClick={onRemove}>{labels.remove}</Action></div></article>;
}
function Action({ children, icon, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode }) { return <button type="button" {...props} className={cn('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white/5 px-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50', className)}>{icon}{children}</button>; }

function AnnouncementDialog({ locale, form, setForm, busy, editing, onClose, onSave }: { locale: Locale; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; busy: boolean; editing: boolean; onClose: () => void; onSave: (event: React.FormEvent) => Promise<void> }) {
  const t = C[locale];
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title" onSubmit={(event) => void onSave(event)} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/15 bg-[#111315] p-5 shadow-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><h2 id="announcement-dialog-title" className="text-xl font-black text-white">{editing ? t.edit : t.create}</h2><button type="button" aria-label={t.close} onClick={onClose} className="grid size-11 place-items-center rounded-xl bg-white/5 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FFC107]"><X className="size-5" /></button></div><div className="grid gap-4 sm:grid-cols-2">
    <Field label={t.titleField} wide><input autoFocus required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="control" /></Field><Field label={t.message} wide><textarea required maxLength={2000} rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="control py-3" /></Field>
    <Field label={t.type}><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })} className="control">{Object.entries(TYPES[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={t.audience}><select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as FormState['audience'] })} className="control">{Object.entries(AUDIENCES[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label={t.starts}><input type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="control" /></Field><Field label={t.ends}><input type="datetime-local" min={form.starts_at} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="control" /></Field>
    <Field label={t.link}><input type="text" pattern="/(?!/).*" placeholder="/orders" value={form.link_url ?? ''} onChange={(e) => setForm({ ...form, link_url: e.target.value })} className="control" /></Field><Field label={t.linkLabel}><input type="text" maxLength={100} value={form.link_label ?? ''} onChange={(e) => setForm({ ...form, link_label: e.target.value })} className="control" /></Field>
    <label className="sm:col-span-2 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-4 text-sm font-bold text-white"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="size-5 accent-[#E10600]" />{t.active}</label>
  </div><div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-white/5 text-sm font-bold text-white hover:bg-white/10">{t.cancel}</button><button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-[#E10600] text-sm font-black text-white hover:bg-[#ff1710] disabled:opacity-50">{busy ? '…' : t.save}</button></div></form></div>;
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={cn('text-xs font-bold text-text-secondary [&_.control]:mt-1.5 [&_.control]:min-h-11 [&_.control]:w-full [&_.control]:rounded-xl [&_.control]:border [&_.control]:border-white/10 [&_.control]:bg-black/30 [&_.control]:px-4 [&_.control]:text-sm [&_.control]:text-white [&_.control]:outline-none focus-within:[&_.control]:border-[#E10600] focus-within:[&_.control]:ring-2 focus-within:[&_.control]:ring-[#E10600]/20', wide && 'sm:col-span-2')}>{label}{children}</label>; }
