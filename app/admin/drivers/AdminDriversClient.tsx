'use client';

import { useState, useEffect } from 'react';
import { Truck, Mail, Phone, CheckCircle2, XCircle, MapPin, TrendingUp, Plus, X, Star, Activity } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { formatCurrency } from '@/lib/i18n/format';

const T = {
  de: {
    title: 'Fahrer-Verwaltung',
    subtitle: 'Fahrer erstellen, verwalten und überwachen',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    deliveries: 'Lieferungen',
    earnings: 'Verdienst',
    status: 'Status',
    location: 'Standort',
    actions: 'Aktionen',
    search: 'Fahrer suchen...',
    online: 'Online',
    offline: 'Offline',
    block: 'Sperren',
    unblock: 'Entsperren',
    newDriver: 'Neuer Fahrer',
    createDriver: 'Neuen Fahrer erstellen',
    name2: 'Name',
    email2: 'E-Mail',
    phone2: 'Telefon',
    password: 'Passwort',
    cancel: 'Abbrechen',
    create: 'Erstellen',
    lastSeen: 'Zuletzt online',
    noDrivers: 'Keine Fahrer gefunden',
  },
  ar: {
    title: 'إدارة السائقين',
    subtitle: 'إنشاء السائقين وإدارتهم ومراقبتهم',
    name: 'الاسم',
    email: 'البريد',
    phone: 'الهاتف',
    deliveries: 'التوصيلات',
    earnings: 'الأرباح',
    status: 'الحالة',
    location: 'الموقع',
    actions: 'الإجراءات',
    search: 'ابحث عن سائق...',
    online: 'متصل',
    offline: 'غير متصل',
    block: 'حظر',
    unblock: 'إلغاء الحظر',
    newDriver: 'سائق جديد',
    createDriver: 'إنشاء سائق جديد',
    name2: 'الاسم',
    email2: 'البريد',
    phone2: 'الهاتف',
    password: 'كلمة المرور',
    cancel: 'إلغاء',
    create: 'إنشاء',
    lastSeen: 'آخر ظهور',
    noDrivers: 'لا يوجد سائقون',
  },
  en: {
    title: 'Driver Management',
    subtitle: 'Create, manage and monitor drivers',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    deliveries: 'Deliveries',
    earnings: 'Earnings',
    status: 'Status',
    location: 'Location',
    actions: 'Actions',
    search: 'Search driver...',
    online: 'Online',
    offline: 'Offline',
    block: 'Block',
    unblock: 'Unblock',
    newDriver: 'New driver',
    createDriver: 'Create new driver',
    name2: 'Name',
    email2: 'Email',
    phone2: 'Phone',
    password: 'Password',
    cancel: 'Cancel',
    create: 'Create',
    lastSeen: 'Last seen',
    noDrivers: 'No drivers found',
  },
};

export function AdminDriversClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [drivers, setDrivers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // form
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/drivers', window.location.origin);
      url.searchParams.set('limit', '100');
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.ok) setDrivers(data.drivers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchDrivers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed');
        return;
      }
      setForm({ name: '', email: '', phone: '', password: '' });
      setShowCreate(false);
      fetchDrivers();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (d: any) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, is_active: !d.is_active }),
    });
    if (res.ok) {
      setDrivers((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, is_active: !x.is_active } : x)),
      );
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {t.newDriver}
          </button>
        </header>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <form
              onSubmit={handleCreate}
              className="w-full max-w-md bg-surface-elevated rounded-2xl border border-edge p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-white">{t.createDriver}</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-text-secondary hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {createError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                  {createError}
                </div>
              )}
              <input
                type="text"
                placeholder={t.name2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <input
                type="email"
                placeholder={t.email2}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <input
                type="tel"
                placeholder={t.phone2}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <input
                type="password"
                placeholder={t.password}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 h-11 rounded-xl bg-ink-700 text-text-secondary font-bold"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold disabled:opacity-50"
                >
                  {t.create}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.search}
          className="w-full h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
          dir="ltr"
        />

        {/* Table */}
        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : drivers.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">{t.noDrivers}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-700/40">
                  <tr>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.name}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.email}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.phone}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.deliveries}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.earnings}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.status}</th>
                    <th className="px-4 py-3 text-end text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {drivers.map((d) => (
                    <tr key={d.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-sm font-extrabold text-white">{d.name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary" dir="ltr">{d.email}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary" dir="ltr">{d.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-white tabular-nums font-extrabold">
                        {d.completed_deliveries}
                      </td>
                      <td className="px-4 py-3 text-sm text-emerald-400 tabular-nums font-extrabold">
                        {formatCurrency(d.total_earnings, locale)}
                      </td>
                      <td className="px-4 py-3">
                        {d.last_login_at && new Date(d.last_login_at).getTime() > Date.now() - 5 * 60 * 1000 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {t.online}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-ink-700 text-text-muted text-[10px] font-extrabold">
                            {t.offline}
                          </span>
                        )}
                        {!d.is_active && (
                          <span className="ms-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-extrabold">
                            <XCircle className="w-2.5 h-2.5" />
                            {t.block}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => toggleActive(d)}
                          className="h-8 px-3 rounded-lg bg-ink-700 hover:bg-ink-600 text-text-secondary hover:text-white text-[10px] font-extrabold uppercase tracking-wider"
                        >
                          {d.is_active ? t.block : t.unblock}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
