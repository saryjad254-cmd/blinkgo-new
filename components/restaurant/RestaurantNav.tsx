'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import UtensilsCrossed from 'lucide-react/dist/esm/icons/utensils-crossed';
import Settings from 'lucide-react/dist/esm/icons/settings';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Bell from 'lucide-react/dist/esm/icons/bell';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

const T = {
  de: { brand: 'BlinkGo', subtitle: 'Restaurant-Panel', dashboard: 'Dashboard', orders: 'Bestellungen', kitchen: 'Küche', menu: 'Menü', settings: 'Einstellungen', notifications: 'Benachrichtigungen' },
  ar: { brand: 'BlinkGo', subtitle: 'لوحة المطعم', dashboard: 'الرئيسية', orders: 'الطلبات', kitchen: 'المطبخ', menu: 'القائمة', settings: 'الإعدادات', notifications: 'الإشعارات' },
  en: { brand: 'BlinkGo', subtitle: 'Restaurant Panel', dashboard: 'Dashboard', orders: 'Orders', kitchen: 'Kitchen', menu: 'Menu', settings: 'Settings', notifications: 'Notifications' },
};

export function RestaurantNav({ user }: { user: { email: string; role: string } }) {
  const pathname = usePathname();
  const { locale } = useI18n();

  const t = T[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const links = [
    { href: '/restaurant/dashboard', label: t.dashboard, icon: LayoutDashboard },
    { href: '/restaurant/orders', label: t.orders, icon: ShoppingBag },
    { href: '/restaurant/kitchen', label: t.kitchen, icon: ChefHat },
    { href: '/restaurant/menu', label: t.menu, icon: UtensilsCrossed },
    { href: '/restaurant/settings', label: t.settings, icon: Settings },
  ];

  return (
    <>
      {/* DESKTOP TOP NAV */}
      <nav className="hidden md:block sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-edge-light" dir={dir}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/restaurant/dashboard" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc107]/70" aria-label={`${t.brand} · ${t.subtitle}`}>
              <BlinkLogo variant="horizontal" size="sm" priority />
              <div className="leading-tight">
                <span className="text-[10px] text-text-muted">{t.subtitle}</span>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              {links.map((l) => {
                const Icon = l.icon;
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all',
                      active ? 'bg-brand-red-500/15 text-brand-red-400' : 'text-text-secondary hover:text-white hover:bg-surface-elevated'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{l.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/restaurant/notifications" aria-label={t.notifications} aria-current={pathname === '/restaurant/notifications' ? 'page' : undefined} className={cn('grid size-10 place-items-center rounded-xl transition-colors', pathname === '/restaurant/notifications' ? 'bg-brand-red-500/15 text-brand-red-400' : 'text-text-secondary hover:bg-surface-elevated hover:text-white')}>
                <Bell className="size-5" />
              </Link>
              <LanguageSwitcher />
              <LogoutButton email={user.email} role={user.role} />
            </div>
          </div>
        </div>
      </nav>

      {/* MOBILE TOP HEADER */}
      <header className="md:hidden sticky top-0 z-30 bg-bg/95 backdrop-blur-xl border-b border-edge-light">
        <div className="px-4 py-3 flex items-center justify-between min-h-[56px]">
          <Link href="/restaurant/dashboard" className="flex min-h-11 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc107]/70" aria-label={`${t.brand} · ${t.subtitle}`}>
            <BlinkLogo variant="horizontal" size="sm" priority />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/restaurant/notifications" aria-label={t.notifications} aria-current={pathname === '/restaurant/notifications' ? 'page' : undefined} className={cn('grid size-11 place-items-center rounded-xl transition-colors', pathname === '/restaurant/notifications' ? 'bg-brand-red-500/15 text-brand-red-400' : 'text-text-secondary hover:bg-surface-elevated hover:text-white')}>
              <Bell className="size-5" />
            </Link>
            <LanguageSwitcher />
            <LogoutButton variant="icon" email={user.email} role={user.role} />
          </div>
        </div>
      </header>

      {/* MOBILE BOTTOM TAB BAR — premium, unified iconography */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-sticky bg-bg-elevated/85 backdrop-blur-2xl border-t border-edge pb-safe-bottom">
        <div className="mx-auto grid max-w-screen-sm grid-cols-5">
          {links.map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                aria-label={l.label}
                className={cn(
                  'group relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] transition-colors duration-200 ease-silk',
                  'active:scale-95 touch-manipulation',
                  active ? 'text-brand' : 'text-text-secondary hover:text-white',
                )}
              >
                {active && (
                  <span className="absolute top-0 inset-x-0 mx-auto w-10 h-0.5 rounded-full bg-gradient-to-r from-transparent via-brand-red-500 to-transparent" />
                )}
                <Icon
                  className={cn('w-5 h-5 transition-all duration-200 ease-silk', active && 'scale-110')}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className={cn(
                  'text-[10px] truncate max-w-full transition-all duration-200 ease-silk',
                  active ? 'font-extrabold' : 'font-bold',
                )}>
                  {l.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
