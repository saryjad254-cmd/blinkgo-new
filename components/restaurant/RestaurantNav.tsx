'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Settings, Flame, ChefHat } from 'lucide-react';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

const T = {
  de: { brand: 'BlinkGo', subtitle: 'Restaurant-Panel', dashboard: 'Dashboard', orders: 'Bestellungen', menu: 'Menü', settings: 'Einstellungen' },
  ar: { brand: 'BlinkGo', subtitle: 'لوحة المطعم', dashboard: 'الرئيسية', orders: 'الطلبات', menu: 'القائمة', settings: 'الإعدادات' },
  en: { brand: 'BlinkGo', subtitle: 'Restaurant Panel', dashboard: 'Dashboard', orders: 'Orders', menu: 'Menu', settings: 'Settings' },
};

function detectLocale(): 'de' | 'ar' | 'en' {
  if (typeof window === 'undefined') return 'de';
  const cookie = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
  if (!cookie) return 'de';
  const value = cookie.split('=')[1]?.trim();
  if (value === 'ar') return 'ar';
  if (value === 'en') return 'en';
  return 'de';
}

const NAV_KEYS = {
  '/restaurant/dashboard': 'dashboard',
  '/restaurant/orders': 'orders',
  '/restaurant/menu': 'menu',
  '/restaurant/settings': 'settings',
};

export function RestaurantNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');

  useEffect(() => {
    setLocale(detectLocale());
    const sb = createBrowserClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: u } = await sb.from('users').select('email, role').eq('id', data.user.id).single();
        setUser(u as any);
      }
    });
  }, []);

  const t = T[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const links = [
    { href: '/restaurant/dashboard', label: t.dashboard, icon: LayoutDashboard },
    { href: '/restaurant/orders', label: t.orders, icon: ShoppingBag },
    { href: '/restaurant/kitchen', label: 'Kitchen', icon: ChefHat },
    { href: '/restaurant/menu', label: t.menu, icon: UtensilsCrossed },
    { href: '/restaurant/settings', label: t.settings, icon: Settings },
  ];

  return (
    <>
      {/* DESKTOP TOP NAV */}
      <nav className="hidden md:block sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-edge-light" dir={dir}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/restaurant/dashboard" className="flex items-center gap-3 transition-transform hover:scale-105">
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(245,184,25,0.5)] overflow-hidden">
                <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
                <div className="absolute top-1/2 start-0 w-full h-0.5 bg-brand-red/30" />
                <span className="font-black italic text-brand-black text-sm">B</span>
              </div>
              <div className="leading-tight">
                <span className="font-extrabold text-white block">{t.brand}</span>
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
              <LanguageSwitcher />
              {user && <LogoutButton email={user.email} role={user.role} />}
            </div>
          </div>
        </div>
      </nav>

      {/* MOBILE TOP HEADER */}
      <header className="md:hidden sticky top-0 z-30 bg-bg/95 backdrop-blur-xl border-b border-edge-light">
        <div className="px-4 py-3 flex items-center justify-between min-h-[56px]">
          <Link href="/restaurant/dashboard" className="flex items-center gap-2">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center overflow-hidden">
              <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
              <span className="font-black italic text-brand-black text-sm">B</span>
            </div>
            <span className="font-extrabold text-white">{t.brand}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {user && <LogoutButton variant="icon" email={user.email} role={user.role} />}
          </div>
        </div>
      </header>

      {/* MOBILE BOTTOM TAB BAR — premium, unified iconography */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-sticky bg-bg-elevated/85 backdrop-blur-2xl border-t border-edge pb-safe-bottom">
        <div className="grid grid-cols-4 max-w-screen-sm mx-auto">
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
