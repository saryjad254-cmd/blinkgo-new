import { requireRole } from '@/lib/rbac';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard, Card } from '@/components/ui/Card';
import nextDynamic from 'next/dynamic';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import {
  Users, Truck, Store, ShoppingBag, Clock, Package, DollarSign, Activity, Flame,
  ArrowRight, BarChart3, Settings, MapPin, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

// Lazy-load heavy client tool — only when admin opens this section
const GeocodeTool = nextDynamic(
  () => import('@/components/admin/GeocodeTool').then((m) => m.GeocodeTool),
  { ssr: false, loading: () => <Card><div className="h-32 animate-pulse" /></Card> },
);

// Cache for 30s to reduce Supabase load
export const revalidate = 30;
export const dynamic = 'force-dynamic';

const T = {
  de: {
    title: 'Dashboard',
    subtitle: 'Vollständige Systemübersicht',
    users: 'Benutzer',
    orders: 'Bestellungen',
    revenue: 'Umsatz & Aktivität',
    quickLinks: 'Schnellzugriff',
    totalUsers: 'Benutzer gesamt',
    customers: 'Kunden',
    drivers: 'Fahrer',
    activeRestaurants: 'Aktive Restaurants',
    totalOrders: 'Bestellungen gesamt',
    ordersToday: 'Heute',
    pending: 'In Vorbereitung',
    delivering: 'In Lieferung',
    revenueToday: 'Umsatz heute',
    totalRevenue: 'Gesamtumsatz',
    onlineDrivers: 'Fahrer online',
    manageOrders: 'Bestellungen verwalten',
    manageUsers: 'Benutzer verwalten',
    manageRestaurants: 'Restaurants verwalten',
    manageDrivers: 'Fahrer verwalten',
    driverHours: 'Arbeitszeiten',
    analytics: 'Analytics',
    fixRls: 'RLS reparieren',
    statsError: 'Statistiken konnten nicht geladen werden',
    statsErrorDesc: 'Stelle sicher, dass get_admin_stats() in der Datenbank läuft',
    geocodeRun: 'Geocode alle Bestellungen ausführen',
    geocodeRunning: 'Geocodierung läuft…',
    geocodeDone: 'Geocodierung abgeschlossen',
    geocodeUpdated: 'Aktualisiert: {n}',
    geocodeFailed: 'Fehler: {n}',
  },
  ar: {
    title: 'لوحة التحكم',
    subtitle: 'نظرة عامة على النظام بالكامل',
    users: 'المستخدمون',
    orders: 'الطلبات',
    revenue: 'الإيرادات والنشاط',
    quickLinks: 'روابط سريعة',
    totalUsers: 'إجمالي المستخدمين',
    customers: 'العملاء',
    drivers: 'السائقون',
    activeRestaurants: 'المطاعم النشطة',
    totalOrders: 'إجمالي الطلبات',
    ordersToday: 'طلبات اليوم',
    pending: 'قيد التجهيز',
    delivering: 'قيد التوصيل',
    revenueToday: 'إيرادات اليوم',
    totalRevenue: 'إجمالي الإيرادات',
    onlineDrivers: 'السائقون المتصلون',
    manageOrders: 'إدارة الطلبات',
    manageUsers: 'إدارة المستخدمين',
    manageRestaurants: 'إدارة المطاعم',
    manageDrivers: 'إدارة السائقين',
    driverHours: 'ساعات عمل السائقين',
    analytics: 'التحليلات',
    fixRls: 'إصلاح RLS',
    statsError: 'تعذّر تحميل الإحصائيات',
    statsErrorDesc: 'تأكد من تشغيل دالة get_admin_stats() على قاعدة البيانات',
    geocodeRun: 'شفّر عناوين كل الطلبات',
    geocodeRunning: 'جاري الترميز الجغرافي…',
    geocodeDone: 'انتهى الترميز',
    geocodeUpdated: 'تم تحديث: {n}',
    geocodeFailed: 'فشل: {n}',
  },
  en: {
    title: 'Dashboard',
    subtitle: 'Complete system overview',
    users: 'Users',
    orders: 'Orders',
    revenue: 'Revenue & Activity',
    quickLinks: 'Quick links',
    totalUsers: 'Total users',
    customers: 'Customers',
    drivers: 'Drivers',
    activeRestaurants: 'Active restaurants',
    totalOrders: 'Total orders',
    ordersToday: 'Today',
    pending: 'Preparing',
    delivering: 'Delivering',
    revenueToday: 'Revenue today',
    totalRevenue: 'Total revenue',
    onlineDrivers: 'Drivers online',
    manageOrders: 'Manage orders',
    manageUsers: 'Manage users',
    manageRestaurants: 'Manage restaurants',
    manageDrivers: 'Manage drivers',
    driverHours: 'Driver hours',
    analytics: 'Analytics',
    fixRls: 'Fix RLS',
    statsError: 'Could not load statistics',
    statsErrorDesc: 'Make sure get_admin_stats() is running on the database',
    geocodeRun: 'Run geocoder for all orders',
    geocodeRunning: 'Geocoding…',
    geocodeDone: 'Geocoding complete',
    geocodeUpdated: 'Updated: {n}',
    geocodeFailed: 'Failed: {n}',
  },
};

function detectLocale(): 'de' | 'ar' | 'en' {
  // Read the dedicated locale cookie only — never scan the whole cookie header
  // for substrings (Supabase auth tokens can contain 'ar'/'en' by accident).
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

async function getStats() {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('get_admin_stats');
  if (error) {
    console.error('get_admin_stats failed:', error);
    return null;
  }
  return data;
}

export default async function DashboardPage() {
  const user = await requireRole('admin');
  const stats = await getStats();
  const locale = detectLocale();
  const t = T[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <AdminLayout user={user}>
      <div className="space-y-6" dir={dir}>
        {/* HEADER */}
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-1">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(245,184,25,0.5)] overflow-hidden">
              <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
              <div className="absolute top-1/2 start-0 w-full h-0.5 bg-brand-red/30" />
              <span className="font-black italic text-brand-black text-sm">B</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{t.title}</h1>
          </div>
          <p className="text-sm text-text-secondary">{t.subtitle}</p>
        </div>

        {stats ? (
          <>
            {/* GEOCODER TOOL */}
            <div className="animate-slide-up">
              <GeocodeTool />
            </div>
            {/* USERS */}
            <section className="animate-slide-up" style={{ animationDelay: '60ms' }}>
              <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                {t.users}
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label={t.totalUsers} value={stats.total_users ?? 0} icon={<Users className="w-5 h-5" />} color="info" />
                <StatCard label={t.customers} value={stats.total_customers ?? 0} icon={<Users className="w-5 h-5" />} color="primary" />
                <StatCard label={t.drivers} value={stats.total_drivers ?? 0} icon={<Truck className="w-5 h-5" />} color="success" />
                <StatCard label={t.activeRestaurants} value={stats.active_restaurants ?? 0} icon={<Store className="w-5 h-5" />} color="purple" />
              </div>
            </section>

            {/* ORDERS */}
            <section className="animate-slide-up" style={{ animationDelay: '120ms' }}>
              <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                {t.orders}
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label={t.totalOrders} value={stats.total_orders ?? 0} icon={<ShoppingBag className="w-5 h-5" />} color="info" />
                <StatCard label={t.ordersToday} value={stats.orders_today ?? 0} icon={<Clock className="w-5 h-5" />} color="primary" />
                <StatCard label={t.pending} value={stats.orders_pending ?? 0} icon={<Package className="w-5 h-5" />} color="warning" />
                <StatCard label={t.delivering} value={stats.orders_delivering ?? 0} icon={<Truck className="w-5 h-5" />} color="purple" />
              </div>
            </section>

            {/* REVENUE */}
            <section className="animate-slide-up" style={{ animationDelay: '180ms' }}>
              <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                {t.revenue}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <RevenueCard title={t.revenueToday} value={stats.revenue_today ?? 0} icon={<DollarSign className="w-5 h-5" />} color="primary" />
                <RevenueCard title={t.totalRevenue} value={stats.revenue_total ?? 0} icon={<DollarSign className="w-5 h-5" />} color="success" />
                <StatCard label={t.onlineDrivers} value={stats.online_drivers ?? 0} icon={<Activity className="w-5 h-5" />} color="purple" />
              </div>
            </section>

            {/* QUICK LINKS */}
            <section className="animate-slide-up" style={{ animationDelay: '240ms' }}>
              <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                {t.quickLinks}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <QuickLink href="/admin/orders" label={t.manageOrders} icon={<ShoppingBag className="w-4 h-4" />} />
                <QuickLink href="/admin/users" label={t.manageUsers} icon={<Users className="w-4 h-4" />} />
                <QuickLink href="/admin/restaurants" label={t.manageRestaurants} icon={<Store className="w-4 h-4" />} />
                <QuickLink href="/admin/drivers" label={t.manageDrivers} icon={<Truck className="w-4 h-4" />} />
                <QuickLink href="/admin/driver-hours" label={t.driverHours} icon={<Clock className="w-4 h-4" />} />
                <QuickLink href="/admin/analytics" label={t.analytics} icon={<BarChart3 className="w-4 h-4" />} />
              </div>
            </section>
          </>
        ) : (
          <Card className="text-center py-12 animate-slide-up">
            <div className="w-16 h-16 mx-auto rounded-full bg-brand-yellow-500/10 border border-brand-yellow-500/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-brand-yellow-500" />
            </div>
            <p className="font-extrabold text-white text-lg mb-1">{t.statsError}</p>
            <p className="text-sm text-text-secondary">{t.statsErrorDesc}</p>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function RevenueCard({
  title, value, icon, color,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'purple';
}) {
  const colorMap = {
    primary: 'from-brand-500/20 to-brand-500/5 text-brand-500 border-brand-500/30',
    success: 'from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/30',
    purple: 'from-purple-600/20 to-purple-600/5 text-purple-500 border-purple-500/30',
  } as const;
  return (
    <Card className={`bg-gradient-to-br ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-white">{title}</p>
        <div className={`w-10 h-10 rounded-xl bg-current/15 flex items-center justify-center opacity-80`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-extrabold text-white tabular-nums">
        {typeof value === 'number' ? value.toFixed(2) : value}
        <span className="text-base text-text-muted ms-1">€</span>
      </p>
    </Card>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card hover className="group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              {icon}
            </div>
            <span className="text-sm font-bold text-white">{label}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
        </div>
      </Card>
    </Link>
  );
}
