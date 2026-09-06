'use client';

import { useCallback, useEffect, useState } from 'react';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Pencil from 'lucide-react/dist/esm/icons/pencil';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Star from 'lucide-react/dist/esm/icons/star';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { PageHeader } from '@/components/shared/PageHeader';
import { AddressInput } from '@/components/maps/AddressInput';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';

type Address = {
  id: string;
  label?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  postal_code?: string | null;
  details?: string | null;
  is_default?: boolean;
};

type Draft = {
  id?: string;
  label?: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  postal_code?: string | null;
  details?: string | null;
  is_default?: boolean;
};
const EMPTY_DRAFT: Draft = { label: '', address: '', latitude: null, longitude: null, postal_code: '', details: '', is_default: false };

export function AddressesClient({ startNew = false }: { startNew?: boolean }) {
  const { locale } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(startNew);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const c = locale === 'ar'
    ? { title: 'العناوين', subtitle: 'إدارة عناوين التوصيل', add: 'إضافة عنوان', empty: 'لا توجد عناوين محفوظة', emptyDesc: 'أضف عنوانًا لتسريع عملية الطلب.', label: 'اسم العنوان', labelHint: 'المنزل، العمل…', address: 'العنوان', details: 'تفاصيل إضافية', detailsHint: 'الطابق، رقم الباب…', postal: 'الرمز البريدي', primary: 'افتراضي', makePrimary: 'تعيين كافتراضي', edit: 'تعديل', remove: 'حذف', cancel: 'إلغاء', save: 'حفظ العنوان', failed: 'تعذّر تحميل العناوين.', retry: 'إعادة المحاولة', confirm: 'هل تريد حذف هذا العنوان؟', saved: 'تم حفظ العنوان.', deleted: 'تم حذف العنوان.', invalid: 'اختر عنوانًا صحيحًا من الاقتراحات أو أكمل تحديده.' }
    : locale === 'en'
      ? { title: 'Addresses', subtitle: 'Manage your delivery addresses', add: 'Add address', empty: 'No saved addresses', emptyDesc: 'Add an address to make checkout faster.', label: 'Address label', labelHint: 'Home, work…', address: 'Address', details: 'Additional details', detailsHint: 'Floor, door number…', postal: 'Postal code', primary: 'Default', makePrimary: 'Make default', edit: 'Edit', remove: 'Delete', cancel: 'Cancel', save: 'Save address', failed: 'Addresses could not be loaded.', retry: 'Try again', confirm: 'Delete this address?', saved: 'Address saved.', deleted: 'Address deleted.', invalid: 'Choose a valid address from the suggestions or finish resolving it.' }
      : { title: 'Adressen', subtitle: 'Lieferadressen verwalten', add: 'Adresse hinzufügen', empty: 'Keine gespeicherten Adressen', emptyDesc: 'Füge eine Adresse hinzu, um schneller zu bestellen.', label: 'Bezeichnung', labelHint: 'Zuhause, Arbeit…', address: 'Adresse', details: 'Zusätzliche Angaben', detailsHint: 'Etage, Türnummer…', postal: 'Postleitzahl', primary: 'Standard', makePrimary: 'Als Standard', edit: 'Bearbeiten', remove: 'Löschen', cancel: 'Abbrechen', save: 'Adresse speichern', failed: 'Adressen konnten nicht geladen werden.', retry: 'Erneut versuchen', confirm: 'Diese Adresse löschen?', saved: 'Adresse gespeichert.', deleted: 'Adresse gelöscht.', invalid: 'Wähle eine gültige Adresse aus den Vorschlägen oder schließe die Auflösung ab.' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/addresses', { cache: 'no-store' });
      if (!response.ok) throw new Error('load failed');
      const payload = await response.json();
      setItems(payload?.data?.addresses ?? payload?.addresses ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };

  const openEdit = (item: Address) => {
    setDraft({ ...item });
    setFormOpen(true);
  };

  const save = async () => {
    if (!draft.address.trim() || draft.latitude == null || draft.longitude == null || saving) {
      toast.warning(c.invalid);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/addresses', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || c.failed);
      toast.success(c.saved);
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : c.failed);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const response = await fetch(`/api/addresses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(c.failed);
      setItems((current) => current.filter((item) => item.id !== id));
      setConfirmDelete(null);
      toast.success(c.deleted);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : c.failed);
    }
  };

  const makeDefault = async (item: Address) => {
    const response = await fetch('/api/addresses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_default: true }),
    });
    if (response.ok) setItems((current) => current.map((entry) => ({ ...entry, is_default: entry.id === item.id })));
    else toast.error(c.failed);
  };

  return (
    <>
      <PageHeader title={c.title} subtitle={c.subtitle} back backHref="/profile" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex justify-end">
          <button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-speed-gradient px-4 text-sm font-extrabold text-white shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Plus className="h-4 w-4" aria-hidden="true" />{c.add}
          </button>
        </div>

        {formOpen && (
          <section className="space-y-4 rounded-3xl border border-brand-red-500/25 bg-bg-card p-4 shadow-speed-lg sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5"><span className="text-xs font-bold text-text-secondary">{c.label}</span><input value={draft.label || ''} onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} placeholder={c.labelHint} className="min-h-11 w-full rounded-xl border border-edge bg-bg-elevated px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-text-secondary">{c.postal}</span><input value={draft.postal_code || ''} onChange={(event) => setDraft((value) => ({ ...value, postal_code: event.target.value }))} inputMode="numeric" autoComplete="postal-code" className="min-h-11 w-full rounded-xl border border-edge bg-bg-elevated px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" /></label>
            </div>
            <div className="space-y-1.5"><span className="text-xs font-bold text-text-secondary">{c.address}</span><AddressInput value={draft.address} lat={draft.latitude} lng={draft.longitude} allowCustom showCurrentLocation onInputChange={(address) => setDraft((value) => ({ ...value, address, latitude: null, longitude: null }))} onChange={(selection) => setDraft((value) => ({ ...value, address: selection.address, latitude: selection.lat, longitude: selection.lng }))} /></div>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-text-secondary">{c.details}</span><textarea value={draft.details || ''} onChange={(event) => setDraft((value) => ({ ...value, details: event.target.value }))} placeholder={c.detailsHint} rows={2} className="w-full rounded-xl border border-edge bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" /></label>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={Boolean(draft.is_default)} onChange={(event) => setDraft((value) => ({ ...value, is_default: event.target.checked }))} className="h-5 w-5 accent-brand-red-500" /><span className="text-sm font-bold text-text">{c.primary}</span></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="min-h-11 rounded-xl border border-edge px-4 text-sm font-bold text-text-secondary">{c.cancel}</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-speed-gradient px-5 text-sm font-extrabold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{c.save}</button></div>
          </section>
        )}

        {loading ? <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">{[0,1,2,3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-bg-card" />)}</div>
          : error ? <div className="rounded-2xl border border-danger/25 bg-danger/5 p-6 text-center" role="alert"><p className="font-bold text-danger">{c.failed}</p><button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-danger/30 px-4 font-bold text-danger"><RefreshCw className="h-4 w-4" />{c.retry}</button></div>
          : items.length === 0 ? <div className="rounded-3xl border border-edge bg-bg-card p-10 text-center"><MapPin className="mx-auto mb-3 h-10 w-10 text-brand-red-500" /><h2 className="font-extrabold text-text">{c.empty}</h2><p className="mt-1 text-sm text-text-secondary">{c.emptyDesc}</p></div>
          : <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-edge bg-bg-card p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-500/10 text-brand-red-500"><MapPin className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-extrabold text-text">{item.label || c.address}</h2>{item.is_default && <span className="rounded-full bg-brand-yellow-500/15 px-2 py-0.5 text-[10px] font-extrabold text-brand-yellow-500">{c.primary}</span>}</div><p className="mt-1 text-sm text-text-secondary">{item.address}</p>{item.details && <p className="mt-1 text-xs text-text-muted">{item.details}</p>}</div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-edge pt-3">{!item.is_default && <button type="button" onClick={() => void makeDefault(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-edge px-3 text-xs font-bold text-text-secondary"><Star className="h-3.5 w-3.5" />{c.makePrimary}</button>}<button type="button" onClick={() => openEdit(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-edge px-3 text-xs font-bold text-text-secondary"><Pencil className="h-3.5 w-3.5" />{c.edit}</button>{confirmDelete === item.id ? <><button type="button" onClick={() => void remove(item.id)} className="min-h-11 rounded-xl bg-danger px-3 text-xs font-extrabold text-white">{c.confirm}</button><button type="button" onClick={() => setConfirmDelete(null)} className="min-h-11 rounded-xl border border-edge px-3 text-xs font-bold text-text-secondary">{c.cancel}</button></> : <button type="button" onClick={() => setConfirmDelete(item.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-danger/25 px-3 text-xs font-bold text-danger"><Trash2 className="h-3.5 w-3.5" />{c.remove}</button>}</div></article>)}</div>}
      </main>
    </>
  );
}
