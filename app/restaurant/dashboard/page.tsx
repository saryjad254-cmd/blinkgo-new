import Link from 'next/link';
import { ShoppingBag, ChevronRight, Star, Bell, AlertTriangle } from 'lucide-react';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { ToggleOnlineButton } from '@/components/restaurant/ToggleOnlineButton';
import { RestaurantLiveDashboardV2 } from '@/components/restaurant/RestaurantLiveDashboardV2';
import { isUserDemo } from '@/lib/demo-guard';
import { cookies } from 'next/headers';
import de from '@/lib/i18n/locales/de';
import ar from '@/lib/i18n/locales/ar';
import en from '@/lib/i18n/locales/en';
import type { Locale } from '@/lib/i18n/server-translations';

const T: Record<Locale, typeof de> = { de, ar: ar as unknown as typeof de, en: en as unknown as typeof de };

function detectLocale(): Locale {
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

// Cache for 30s to reduce Supabase load
export const revalidate = 30;
export const dynamic = 'force-dynamic';

async function getDashboardData(restaurantId: string) {
  const supabase = createServerClient();
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  const [restaurantRes, activeOrdersRes, todayOrdersRes] = await Promise.all([
    supabase
      .from('restaurants')
      .select('id, name, is_active, is_paused, busy_mode, busy_mode_until, address, phone, rating, review_count')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, order_number, status, created_at, delivery_address, total, accepted_at, prepared_at, customer_id')
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('orders')
      .select('id, total, status, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startOfDay.toISOString()),
  ]);

  const todayOrders = todayOrdersRes.data ?? [];
  const todayCount = todayOrders.length;
  const todayRevenue = todayOrders
    .filter((o: any) => o.status === 'delivered')
    .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
  const activeNow = (activeOrdersRes.data ?? []).length;
  const pendingCount = (activeOrdersRes.data ?? []).filter((o: any) => o.status === 'pending').length;

  const customerIds = Array.from(
    new Set((activeOrdersRes.data ?? []).map((o: any) => o.customer_id).filter(Boolean))
  );
  let customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('users')
      .select('id, name')
      .in('id', customerIds);
    for (const c of customers ?? []) {
      customerMap.set(c.id, c.name ?? '');
    }
  }

  const activeOrders = (activeOrdersRes.data ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number ?? o.id.slice(0, 8),
    status: o.status,
    total: Number(o.total ?? 0),
    created_at: o.created_at,
    delivery_address: o.delivery_address,
    accepted_at: o.accepted_at,
    prepared_at: o.prepared_at,
    customer_name: customerMap.get(o.customer_id) ?? '',
    estimated_prep_minutes: 20,
  }));

  const r = restaurantRes.data as any;
  return {
    restaurantId,
    restaurant: r,
    restaurantName: r?.name ?? 'Restaurant',
    isOnline: !!r?.is_active,
    isPaused: !!r?.is_paused,
    busyMode: !!r?.busy_mode,
    avgPrepMin: 15,
    maxConcurrentOrders: 8,
    activeOrders,
    todayCount,
    todayRevenue,
    activeNow,
    pendingCount,
  };
}

export default async function RestaurantDashboardPage() {
  const { user, restaurantId } = await requireRestaurantId();
  const data = await getDashboardData(restaurantId);
  const isDemo = await isUserDemo(user.email);
  const locale = detectLocale();
  const t = T[locale];
  const tOps = (t as any).restaurantOps;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const labels = {
    statusHeader: locale === 'ar' ? 'حالة المطعم' : locale === 'de' ? 'Restaurant-Status' : 'Restaurant status',
    online: (t as any).common?.online ?? 'Online',
    offline: (t as any).common?.offline ?? 'Offline',
    onlineDesc: (t as any).common?.onlineDesc ?? (locale === 'ar' ? 'يستقبل طلبات' : locale === 'de' ? 'Empfängt Bestellungen' : 'Accepting orders'),
    offlineDesc: (t as any).common?.offlineDesc ?? (locale === 'ar' ? 'لا يستقبل طلبات' : locale === 'de' ? 'Empfängt keine Bestellungen' : 'Not accepting orders'),
    activeTitle: tOps?.liveOrders ?? (locale === 'ar' ? 'طلبات نشطة' : locale === 'de' ? 'Aktive Bestellungen' : 'Active orders'),
    pendingApproval: tOps?.pendingApproval ?? (locale === 'ar' ? 'في انتظار الموافقة' : locale === 'de' ? 'Wartet auf Bestätigung' : 'Pending approval'),
    settingsLink: tOps?.settingsLink ?? (locale === 'ar' ? 'الإعدادات' : locale === 'de' ? 'Einstellungen' : 'Settings'),
    demoNote: (t as any).common?.demoNote ?? (locale === 'ar' ? 'حساب تجريبي' : locale === 'de' ? 'Demo-Konto' : 'Demo account'),
    rating: (t as any).common?.rating ?? (locale === 'ar' ? 'التقييم' : locale === 'de' ? 'Bewertung' : 'Rating'),
  };

  return (
    <>
      <PageHeader title={data.restaurant?.name ?? t.restaurant.dashboard} subtitle={data.restaurant?.address ?? ''} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" dir={dir}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                data.restaurant?.is_active
                  ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                  : 'bg-surface-elevated'
              }`}>
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">{labels.statusHeader}</p>
                <p className={`text-base font-extrabold ${data.restaurant?.is_active ? 'text-emerald-500' : 'text-text-secondary'}`}>
                  ● {data.restaurant?.is_active ? labels.online : labels.offline}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {data.restaurant?.is_active ? labels.onlineDesc : labels.offlineDesc}
                </p>
              </div>
            </div>
            <ToggleOnlineButton
              restaurantId={restaurantId}
              initialActive={data.restaurant?.is_active ?? false}
            />
          </Card>

          <Card className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">
                <Star className="w-4 h-4 inline-block me-1 text-brand-yellow-400" />
                {Number(data.restaurant?.rating ?? 0).toFixed(1)} · {data.restaurant?.review_count ?? 0} {labels.rating}
              </p>
              <Link href="/restaurant/settings" className="text-xs text-text-muted hover:text-white">
                {labels.settingsLink}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/restaurant/orders" className="rounded-xl bg-surface-tertiary p-3 text-center hover:bg-surface-elevated transition">
                <p className="text-2xl font-extrabold text-white tabular-nums">{data.activeNow}</p>
                <p className="text-[10px] text-text-muted mt-1">{labels.activeTitle}</p>
              </Link>
              <Link href="/restaurant/orders?status=pending" className="rounded-xl bg-surface-tertiary p-3 text-center hover:bg-surface-elevated transition">
                <p className={`text-2xl font-extrabold tabular-nums ${data.pendingCount > 0 ? 'text-brand-500' : 'text-white'}`}>{data.pendingCount}</p>
                <p className="text-[10px] text-text-muted mt-1">{labels.pendingApproval}</p>
              </Link>
            </div>
            {isDemo && (
              <p className="text-[10px] text-text-muted mt-3 flex items-center gap-1">
                <span>🛡️</span>
                <span>{labels.demoNote}</span>
              </p>
            )}
          </Card>
        </div>

        <RestaurantLiveDashboardV2
        restaurantId={data.restaurantId}
        restaurantName={data.restaurantName}
        initialActiveOrders={data.activeOrders as any}
        initialTodayCount={data.todayCount}
        initialTodayRevenue={data.todayRevenue}
        initialAvgPrepMin={data.avgPrepMin}
        isOnline={data.isOnline}
        isPaused={data.isPaused}
        busyMode={data.busyMode}
        maxConcurrentOrders={data.maxConcurrentOrders ?? 8}
      />
      </div>
    </>
  );
}
