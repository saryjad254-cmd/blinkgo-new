'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Megaphone from 'lucide-react/dist/esm/icons/megaphone';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface Promotion {
  id: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  restaurant_id: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  current_uses: number;
}

function promotionWindow(days: number): { startsAt: string; endsAt: string } {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

export function AdminPromotionsClient({
  initialPromotions,
  restaurants,
  user,
  locale,
}: {
  initialPromotions: Promotion[];
  restaurants: Array<{ id: string; name: string }>;
  user: AdminUser;
  locale?: Locale;
}) {
  const t = useT();
  const isAr = locale === 'ar';
  const [promos, setPromos] = useState(initialPromotions);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 20,
    restaurant_id: '',
    days: 7,
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();
  const copy = isAr
    ? { title: 'عنوان العرض', description: 'الوصف', percentage: 'نسبة مئوية', fixed: 'مبلغ ثابت', value: 'قيمة الخصم', days: 'عدد الأيام', empty: 'لا توجد عروض حاليًا', createFailed: 'تعذر إنشاء العرض', deleteFailed: 'تعذر حذف العرض', created: 'تم إنشاء العرض', deleted: 'تم حذف العرض', confirmDelete: 'هل تريد حذف هذا العرض؟', deleteLabel: 'حذف العرض' }
    : locale === 'en'
      ? { title: 'Promotion title', description: 'Description', percentage: 'Percentage', fixed: 'Fixed amount', value: 'Discount value', days: 'Days valid', empty: 'No promotions available', createFailed: 'Could not create promotion', deleteFailed: 'Could not delete promotion', created: 'Promotion created', deleted: 'Promotion deleted', confirmDelete: 'Delete this promotion?', deleteLabel: 'Delete promotion' }
      : { title: 'Titel der Aktion', description: 'Beschreibung', percentage: 'Prozent', fixed: 'Fester Betrag', value: 'Rabattwert', days: 'Gültigkeit in Tagen', empty: 'Keine Aktionen vorhanden', createFailed: 'Aktion konnte nicht erstellt werden', deleteFailed: 'Aktion konnte nicht gelöscht werden', created: 'Aktion erstellt', deleted: 'Aktion gelöscht', confirmDelete: 'Diese Aktion löschen?', deleteLabel: 'Aktion löschen' };

  const create = async () => {
    setSaving(true);
    try {
      const window = promotionWindow(form.days);
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, restaurant_id: form.restaurant_id || null, starts_at: window.startsAt, ends_at: window.endsAt }),
      });
      const data: unknown = await res.json().catch(() => null);
      const createdPromotion = data && typeof data === 'object' && 'data' in data && data.data && typeof data.data === 'object' && 'promotion' in data.data
        ? (data.data as { promotion: Promotion }).promotion
        : null;
      if (!res.ok || !createdPromotion) return toast.error(extractErrorMessage(data, copy.createFailed));
      setPromos((current) => [createdPromotion, ...current]);
      setShowForm(false);
      setForm({ title: '', description: '', discount_type: 'percentage', discount_value: 20, restaurant_id: '', days: 7 });
      toast.success(copy.created);
    } catch (error) {
      toast.error(extractErrorMessage(error, copy.createFailed));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(copy.confirmDelete)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/promotions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) return toast.error(extractErrorMessage(data, copy.deleteFailed));
      setPromos((current) => current.filter((promotion) => promotion.id !== id));
      toast.success(copy.deleted);
    } catch (error) {
      toast.error(extractErrorMessage(error, copy.deleteFailed));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">
          {t.admin.promotions}
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-xl bg-racing-red px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {t.admin.createPromo}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-bold text-ink-1 dark:text-zinc-100">{t.admin.createPromo}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={copy.title}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={copy.description}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={form.discount_type}
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="percentage">{copy.percentage}</option>
              <option value="fixed">{copy.fixed}</option>
            </select>
            <input
              type="number"
              value={form.discount_value}
              onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
              placeholder={copy.value}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={form.restaurant_id}
              onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">{t.promo.siteWide}</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={form.days}
              onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
              placeholder={copy.days}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void create()} disabled={saving || !form.title.trim() || form.days < 1 || form.discount_value <= 0} className="rounded-xl bg-racing-red px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {t.common.save}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold dark:border-zinc-700">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {promos.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <Megaphone className="mx-auto h-12 w-12 opacity-30" />
            <div className="mt-3">{copy.empty}</div>
          </div>
        ) : (
          promos.map((p) => (
            <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-bold text-ink-1 dark:text-zinc-100">{p.title}</h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{p.description}</p>
                </div>
                <div className="rounded-full bg-gradient-to-r from-racing-red to-golden-yellow px-3 py-1 text-sm font-bold text-white">
                  {p.discount_type === 'percentage' ? `${p.discount_value}%` : `${p.discount_value}€`}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Calendar className="h-3 w-3" />
                {new Date(p.starts_at).toLocaleDateString()} - {new Date(p.ends_at).toLocaleDateString()}
              </div>
              <div className="mt-2 text-xs">
                {p.restaurant_id ? restaurants.find((r) => r.id === p.restaurant_id)?.name : t.promo.siteWide}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">{p.current_uses} {t.admin.usageCount.toLowerCase()}</span>
                <button disabled={deletingId === p.id} onClick={() => void remove(p.id)} aria-label={copy.deleteLabel} className="rounded-full p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    </AdminLayout>
  );
}
