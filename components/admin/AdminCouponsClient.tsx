'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import { Plus, Trash2, Ticket } from 'lucide-react';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';

interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  value: number;
  min_order_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export function AdminCouponsClient({
  initialCoupons,
  user,
  locale,
}: {
  initialCoupons: Coupon[];
  user: AdminUser;
  locale?: Locale;
}) {
  const t = useT();
  const isAr = locale === 'ar';
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed' | 'free_delivery',
    value: 10,
    min_order_amount: 0,
    max_discount: '',
    usage_limit: '',
    ends_in_days: 30,
  });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          value: form.value,
          min_order_amount: form.min_order_amount,
          max_discount: form.max_discount ? Number(form.max_discount) : null,
          usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + form.ends_in_days * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCoupons([data.data.coupon, ...coupons]);
        setShowForm(false);
        setForm({ code: '', type: 'percentage', value: 10, min_order_amount: 0, max_discount: '', usage_limit: '', ends_in_days: 30 });
      } else {
        alert(data.error?.message ?? 'Failed to create');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    const res = await fetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE' });
    if (res.ok) setCoupons(coupons.filter((c) => c.id !== id));
  };

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">
          {t.admin.coupons}
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-xl bg-racing-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-racing-red/90"
        >
          <Plus className="h-4 w-4" />
          {t.admin.createCoupon}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-bold text-ink-1 dark:text-zinc-100">{t.admin.createCoupon}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder={t.admin.code}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-mono uppercase dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="percentage">{t.coupon.percentage}</option>
              <option value="fixed">{t.coupon.fixed}</option>
              <option value="free_delivery">{t.coupon.freeDelivery}</option>
            </select>
            <input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              placeholder={t.admin.discountValue}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="number"
              value={form.min_order_amount}
              onChange={(e) => setForm({ ...form, min_order_amount: Number(e.target.value) })}
              placeholder={t.coupon.minOrder}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="number"
              value={form.max_discount}
              onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
              placeholder="Max discount"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="number"
              value={form.usage_limit}
              onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
              placeholder={t.admin.usageLimit}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="number"
              value={form.ends_in_days}
              onChange={(e) => setForm({ ...form, ends_in_days: Number(e.target.value) })}
              placeholder="Days valid"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={create}
              disabled={saving || !form.code}
              className="rounded-xl bg-racing-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-racing-red/90 disabled:opacity-50"
            >
              {saving ? '...' : t.common.save}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold dark:border-zinc-700"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-start dark:border-zinc-800">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">{t.admin.code}</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">{t.admin.discountValue}</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">{t.admin.usageCount}</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">{t.admin.validUntil}</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Status</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">{t.coupon.noCoupons}</td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="p-4">
                    <div className="font-mono font-bold text-racing-red">{c.code}</div>
                  </td>
                  <td className="p-4">
                    {c.type === 'percentage' && `${c.value}%`}
                    {c.type === 'fixed' && `${c.value} €`}
                    {c.type === 'free_delivery' && t.coupon.freeDelivery}
                    {c.max_discount && c.max_discount < 999 && (
                      <div className="text-xs text-zinc-500">max {c.max_discount}€</div>
                    )}
                  </td>
                  <td className="p-4">{c.usage_count} / {c.usage_limit ?? '∞'}</td>
                  <td className="p-4 text-xs">{new Date(c.end_date).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                      {c.is_active ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="p-4">
                    <button onClick={() => remove(c.id)} className="rounded-full p-2 text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </AdminLayout>
  );
}
