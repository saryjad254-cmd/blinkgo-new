'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Plus from 'lucide-react/dist/esm/icons/plus';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

interface RestaurantSummary {
  id: string;
  name: string;
  address: string | null;
  cuisine?: string[] | null;
  rating?: number | null;
  is_active: boolean;
}

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
  const router = useRouter();
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/restaurants', window.location.origin);
      url.searchParams.set('limit', '100');
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      const data = await res.json() as { ok?: boolean; restaurants?: RestaurantSummary[] };
      if (res.ok && data.ok && Array.isArray(data.restaurants)) setRestaurants(data.restaurants);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void fetchRestaurants(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchRestaurants, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleActive = async (r: RestaurantSummary) => {
    // Disabling a restaurant hides it from all customers and stops new
    // orders. Always confirm before doing so.
    const willDisable = r.is_active;
    const confirmMsg = willDisable
      ? (locale === 'ar'
        ? `هل تريد تعطيل ${r.name}؟ سيختفي من تطبيق العملاء.`
        : locale === 'en'
        ? `Disable ${r.name}? It will disappear from the customer app.`
        : `${r.name} wirklich deaktivieren? Das Restaurant wird im Kunden-App ausgeblendet.`)
      : (locale === 'ar'
        ? `تفعيل ${r.name}؟`
        : locale === 'en'
        ? `Enable ${r.name}?`
        : `${r.name} aktivieren?`);
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;
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
            onClick={() => router.push('/admin/onboarding?type=restaurant')}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-extrabold hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {t.newRestaurant}
          </button>
        </header>

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
