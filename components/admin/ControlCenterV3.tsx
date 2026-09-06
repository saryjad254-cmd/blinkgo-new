'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import Activity from 'lucide-react/dist/esm/icons/activity';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import BarChart3 from 'lucide-react/dist/esm/icons/bar-chart-3';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Boxes from 'lucide-react/dist/esm/icons/boxes';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import LifeBuoy from 'lucide-react/dist/esm/icons/life-buoy';
import Map from 'lucide-react/dist/esm/icons/map';
import PackagePlus from 'lucide-react/dist/esm/icons/package-plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Store from 'lucide-react/dist/esm/icons/store';
import Tag from 'lucide-react/dist/esm/icons/tag';
import Truck from 'lucide-react/dist/esm/icons/truck';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import Users from 'lucide-react/dist/esm/icons/users';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { PageHeader, PortalCard, SectionTitle } from '@/components/portal/PortalPrimitives';
import { useI18n } from '@/lib/i18n/I18nProvider';

type ControlCopy = {
  title: string; subtitle: string; overview: string; management: string; business: string; system: string;
  dashboard: string; operations: string; orders: string; onboarding: string; customers: string; drivers: string;
  restaurants: string; products: string; zones: string; finance: string; refunds: string; coupons: string;
  promotions: string; analytics: string; integrations: string; notifications: string; support: string;
  configuration: string; create: string; operate: string; grow: string; protect: string;
  driverCreate: string; restaurantCreate: string; productCreate: string; zoneCreate: string;
};

const COPY: Record<'de' | 'ar' | 'en', ControlCopy> = {
  de: { title: 'Kontrollzentrum', subtitle: 'Ein sicherer Einstieg in alle echten BlinkGo-Werkzeuge – ohne doppelte oder simulierte Verwaltung.', overview: 'Übersicht', management: 'Verwaltung', business: 'Geschäft', system: 'System', dashboard: 'Dashboard', operations: 'Live-Betrieb', orders: 'Bestellungen', onboarding: 'Erstellen & einrichten', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', products: 'Produkte', zones: 'Lieferzonen', finance: 'Finanzen', refunds: 'Erstattungen', coupons: 'Gutscheine', promotions: 'Aktionen', analytics: 'Analysen', integrations: 'Integrationen', notifications: 'Benachrichtigungen', support: 'Support', configuration: 'Konfiguration', create: 'Plattform aufbauen', operate: 'Betrieb steuern', grow: 'Wachstum & Finanzen', protect: 'System & Sicherheit', driverCreate: 'Fahrer samt Konto anlegen', restaurantCreate: 'Restaurant samt Betreiber anlegen', productCreate: 'Produkt einem Restaurant hinzufügen', zoneCreate: 'Lieferzone erstellen' },
  ar: { title: 'مركز التحكم', subtitle: 'مدخل آمن لجميع أدوات BlinkGo الحقيقية دون لوحات مكررة أو وظائف محاكاة.', overview: 'نظرة عامة', management: 'الإدارة', business: 'الأعمال', system: 'النظام', dashboard: 'لوحة التحكم', operations: 'العمليات المباشرة', orders: 'الطلبات', onboarding: 'الإنشاء والتجهيز', customers: 'العملاء', drivers: 'السائقون', restaurants: 'المطاعم', products: 'المنتجات', zones: 'مناطق التوصيل', finance: 'المالية', refunds: 'الاستردادات', coupons: 'القسائم', promotions: 'العروض', analytics: 'التحليلات', integrations: 'التكاملات', notifications: 'الإشعارات', support: 'الدعم', configuration: 'الإعدادات', create: 'بناء المنصة', operate: 'إدارة العمليات', grow: 'النمو والمالية', protect: 'النظام والحماية', driverCreate: 'إضافة سائق وإنشاء حسابه', restaurantCreate: 'إضافة مطعم وحساب المالك', productCreate: 'إضافة منتج إلى مطعم', zoneCreate: 'إنشاء منطقة توصيل' },
  en: { title: 'Control center', subtitle: 'One secure entry point for every real BlinkGo tool, without duplicate or simulated administration.', overview: 'Overview', management: 'Management', business: 'Business', system: 'System', dashboard: 'Dashboard', operations: 'Live operations', orders: 'Orders', onboarding: 'Create & onboard', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', products: 'Products', zones: 'Delivery zones', finance: 'Finance', refunds: 'Refunds', coupons: 'Coupons', promotions: 'Promotions', analytics: 'Analytics', integrations: 'Integrations', notifications: 'Notifications', support: 'Support', configuration: 'Configuration', create: 'Build the platform', operate: 'Run operations', grow: 'Growth & finance', protect: 'System & protection', driverCreate: 'Create driver and account', restaurantCreate: 'Create restaurant and owner', productCreate: 'Add product to restaurant', zoneCreate: 'Create delivery zone' },
};

type Action = { href: string; label: string; icon: typeof Activity };

export default function ControlCenterV3({ userName, canViewPaymentOperations }: { userName: string; canViewPaymentOperations: boolean }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const logout = useCallback(async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }, [router]);
  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: BarChart3 }, { href: '/admin/control-center', label: copy.title, icon: Activity, exact: true }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/onboarding', label: copy.onboarding, icon: UserPlus }, { href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/products', label: copy.products, icon: Boxes }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }, { href: '/admin/coupons', label: copy.coupons, icon: Tag }, { href: '/admin/promotions', label: copy.promotions, icon: Tag }] },
    { title: copy.system, items: [{ href: '/admin/integrations', label: copy.integrations, icon: ShieldCheck }, { href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/support', label: copy.support, icon: LifeBuoy }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy]);
  const groups: Array<{ title: string; icon: typeof Activity; actions: Action[] }> = [
    { title: copy.create, icon: PackagePlus, actions: [{ href: '/admin/onboarding?type=driver', label: copy.driverCreate, icon: Truck }, { href: '/admin/onboarding?type=restaurant', label: copy.restaurantCreate, icon: Store }, { href: '/admin/onboarding?type=product', label: copy.productCreate, icon: Boxes }, { href: '/admin/zones', label: copy.zoneCreate, icon: Map }] },
    { title: copy.operate, icon: Activity, actions: [{ href: '/admin/live-ops', label: copy.operations, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }] },
    { title: copy.grow, icon: BarChart3, actions: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, ...(canViewPaymentOperations ? [{ href: '/admin/refunds', label: copy.refunds, icon: CreditCard }] : []), { href: '/admin/coupons', label: copy.coupons, icon: Tag }, { href: '/admin/promotions', label: copy.promotions, icon: Tag }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.protect, icon: ShieldCheck, actions: [{ href: '/admin/integrations', label: copy.integrations, icon: ShieldCheck }, { href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/support', label: copy.support, icon: LifeBuoy }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ];

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.title, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={copy.title} description={copy.subtitle} />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => { const GroupIcon = group.icon; return <PortalCard key={group.title}>
          <SectionTitle><span className="flex items-center gap-2"><GroupIcon className="size-5 text-brand-red" />{group.title}</span></SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">{group.actions.map((action) => { const Icon = action.icon; return <Link key={action.href} href={action.href} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-bg px-4 text-sm font-bold transition hover:border-brand-red/50 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/40"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-red/10 text-brand-red"><Icon className="size-4" /></span><span className="min-w-0 flex-1">{action.label}</span><ArrowRight className="size-4 shrink-0 text-text-muted rtl:-scale-x-100" /></Link>; })}</div>
        </PortalCard>; })}
      </div>
    </div>
  </PortalShell>;
}
