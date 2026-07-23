'use client';

import { useState, useEffect } from 'react';
import { Store, MapPin, Phone, Plus, X, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Restaurant-Verwaltung',
    subtitle: 'Restaurants erstellen, genehmigen und verwalten',
    name: 'Name',
    address: 'Adresse',
    phone: 'Telefon',
    cuisine: 'Küche',
    status: 'Status',
    rating: 'Bewertung',
    actions: 'Aktionen',
    search: 'Restaurant suchen...',
    active: 'Aktiv',
    disabled: 'Deaktiviert',
    enable: 'Aktivieren',
    disable: 'Deaktivieren',
    newRestaurant: 'Neues Restaurant',
    createRestaurant: 'Neues Restaurant erstellen',
    name2: 'Name',
    email: 'E-Mail',
    phone2: 'Telefon',
    address2: 'Adresse',
    password: 'Passwort',
    cuisine2: 'Küche (kommagetrennt)',
    cancel: 'Abbrechen',
    create: 'Erstellen',
    noRestaurants: 'Keine Restaurants gefunden',
  },
  ar: {
    title: 'إدارة المطاعم',
    subtitle: 'إنشاء وقبول وإدارة المطاعم',
    name: 'الاسم',
    address: 'العنوان',
    phone: 'الهاتف',
    cuisine: 'المطبخ',
    status: 'الحالة',
    rating: 'التقييم',
    actions: 'الإجراءات',
    search: 'ابحث عن مطعم...',
    active: 'نشط',
    disabled: 'معطل',
    enable: 'تفعيل',
    disable: 'تعطيل',
    newRestaurant: 'مطعم جديد',
    createRestaurant: 'إنشاء مطعم جديد',
    name2: 'الاسم',
    email: 'البريد',
    phone2: 'الهاتف',
    address2: 'العنوان',
    password: 'كلمة المرور',
    cuisine2: 'المطبخ (مفصول بفواصل)',
    cancel: 'إلغاء',
    create: 'إنشاء',
    noRestaurants: 'لا توجد مطاعم',
  },
  en: {
    title: 'Restaurant Management',
    subtitle: 'Create, approve and manage restaurants',
    name: 'Name',
    address: 'Address',
    phone: 'Phone',
    cuisine: 'Cuisine',
    status: 'Status',
    rating: 'Rating',
    actions: 'Actions',
    search: 'Search restaurant...',
    active: 'Active',
    disabled: 'Disabled',
    enable: 'Enable',
    disable: 'Disable',
    newRestaurant: 'New restaurant',
    createRestaurant: 'Create new restaurant',
    name2: 'Name',
    email: 'Email',
    phone2: 'Phone',
    address2: 'Address',
    password: 'Password',
    cuisine2: 'Cuisine (comma separated)',
    cancel: 'Cancel',
    create: 'Create',
    noRestaurants: 'No restaurants found',
  },
};

export function AdminRestaurantsClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    cuisine: '',
    latitude: '',
    longitude: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/restaurants', window.location.origin);
      url.searchParams.set('limit', '100');
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.ok) setRestaurants(data.restaurants);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchRestaurants, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const body = {
        ...form,
        cuisine: form.cuisine.split(',').map((s) => s.trim()).filter(Boolean),
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      };
      const res = await fetch('/api/admin/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed');
        return;
      }
      setForm({ name: '', email: '', phone: '', address: '', password: '', cuisine: '', latitude: '', longitude: '' });
      setShowCreate(false);
      fetchRestaurants();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (r: any) => {
    const res = await fetch('/api/admin/restaurants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active }),
    });
    if (res.ok) {
      setRestaurants((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)),
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
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-extrabold hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {t.newRestaurant}
          </button>
        </header>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <form
              onSubmit={handleCreate}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface-elevated rounded-2xl border border-edge p-6 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-white">{t.createRestaurant}</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-text-secondary hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {createError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                  {createError}
                </div>
              )}
              {[
                { k: 'name', p: t.name2, dir: undefined, type: 'text' },
                { k: 'email', p: t.email, dir: 'ltr' as const, type: 'email' },
                { k: 'phone', p: t.phone2, dir: 'ltr' as const, type: 'tel' },
                { k: 'address', p: t.address2, dir: undefined, type: 'text' },
                { k: 'password', p: t.password, dir: 'ltr' as const, type: 'password' },
                { k: 'cuisine', p: t.cuisine2, dir: undefined, type: 'text' },
                { k: 'latitude', p: 'Lat', dir: 'ltr' as const, type: 'number' },
                { k: 'longitude', p: 'Lng', dir: 'ltr' as const, type: 'number' },
              ].map((field) => (
                <input
                  key={field.k}
                  type={field.type}
                  placeholder={field.p}
                  value={(form as any)[field.k]}
                  onChange={(e) => setForm({ ...form, [field.k]: e.target.value })}
                  required={['name', 'email', 'address', 'password'].includes(field.k)}
                  dir={field.dir}
                  className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
              ))}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 h-11 rounded-xl bg-ink-700 text-text-secondary font-bold">
                  {t.cancel}
                </button>
                <button type="submit" disabled={creating} className="flex-1 h-11 rounded-xl bg-brand-gradient text-white font-extrabold disabled:opacity-50">
                  {t.create}
                </button>
              </div>
            </form>
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.search}
          className="w-full h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          dir="ltr"
        />

        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : restaurants.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">{t.noRestaurants}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-700/40">
                  <tr>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.name}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.address}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.cuisine}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.rating}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.status}</th>
                    <th className="px-4 py-3 text-end text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {restaurants.map((r) => (
                    <tr key={r.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-sm font-extrabold text-white">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[280px] truncate">{r.address}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {Array.isArray(r.cuisine) ? r.cuisine.slice(0, 2).join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-yellow-400 tabular-nums">
                        {r.rating ? `★ ${Number(r.rating).toFixed(1)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_active ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {t.active}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-extrabold">
                            <XCircle className="w-2.5 h-2.5" />
                            {t.disabled}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => toggleActive(r)}
                          className="h-8 px-3 rounded-lg bg-ink-700 hover:bg-ink-600 text-text-secondary hover:text-white text-[10px] font-extrabold uppercase tracking-wider"
                        >
                          {r.is_active ? t.disable : t.enable}
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
