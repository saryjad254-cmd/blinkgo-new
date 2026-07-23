'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Store, Truck, BarChart3, LogOut,
  ClipboardList, RefreshCw, Clock, Languages,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import type { CurrentUser } from '@/lib/rbac';
import { cn } from '@/lib/cn';

const T = {
  de: {
    brand: 'BlinkGo · Admin',
    nav: {
      dashboard: 'Dashboard', orders: 'Bestellungen', users: 'Benutzer',
      restaurants: 'Restaurants', drivers: 'Fahrer', analytics: 'Analytics',
      reset: 'Täglicher Reset', hours: 'Arbeitszeiten',
    },
    logout: 'Abmelden',
  },
  ar: {
    brand: 'BlinkGo · مدير',
    nav: {
      dashboard: 'لوحة التحكم', orders: 'الطلبات', users: 'المستخدمون',
      restaurants: 'المطاعم', drivers: 'السائقون', analytics: 'التحليلات',
      reset: 'إعادة التعيين', hours: 'ساعات العمل',
    },
    logout: 'تسجيل الخروج',
  },
  en: {
    brand: 'BlinkGo · Admin',
    nav: {
      dashboard: 'Dashboard', orders: 'Orders', users: 'Users',
      restaurants: 'Restaurants', drivers: 'Drivers', analytics: 'Analytics',
      reset: 'Daily Reset', hours: 'Driver hours',
    },
    logout: 'Logout',
  },
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

const NAV_ITEMS = [
  { href: '/admin/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { href: '/admin/orders', icon: ClipboardList, key: 'orders' },
  { href: '/admin/users', icon: Users, key: 'users' },
  { href: '/admin/restaurants', icon: Store, key: 'restaurants' },
  { href: '/admin/drivers', icon: Truck, key: 'drivers' },
  { href: '/admin/driver-hours', icon: Clock, key: 'hours' },
  { href: '/admin/analytics', icon: BarChart3, key: 'analytics' },
  { href: '/admin/reset', icon: RefreshCw, key: 'reset' },
];

export function AdminLayout({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const t = T[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  async function handleLogout() {
    // Call server route to clear httpOnly auth cookies
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API failed:', e);
    }
    try {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen flex bg-bg text-text" dir={dir}>
      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-bg-card backdrop-blur-xl border-e border-edge-light flex-col">
        <div className="p-6 border-b border-edge-light">
          <Link href="/admin/dashboard" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(245,184,25,0.5)] group-hover:scale-105 transition-transform overflow-hidden">
              <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
              <div className="absolute top-1/2 start-0 w-full h-0.5 bg-brand-red/30" />
              <span className="font-black italic text-brand-black text-sm">B</span>
            </div>
            <span className="font-extrabold text-white">{t.brand}</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ease-silk',
                  active
                    ? 'bg-gradient-to-r from-brand-red-500/20 to-brand-red-500/5 text-brand border border-brand-red-500/20'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text border border-transparent'
                )}
              >
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  strokeWidth={active ? 2.5 : 2}
                  aria-hidden
                />
                <span>{(t.nav as any)[item.key]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-edge-light">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-brand-red-hover flex items-center justify-center text-white font-bold">
              {(user.email || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.email}</p>
              <p className="text-xs text-text-secondary">Admin</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated hover:bg-surface-light text-white text-sm font-bold transition-all active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* MOBILE TOP HEADER */}
      <header className="lg:hidden sticky top-0 z-30 bg-bg/95 backdrop-blur-xl border-b border-edge-light w-full">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center overflow-hidden">
              <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
              <span className="font-black italic text-brand-black text-sm">B</span>
            </div>
            <span className="font-extrabold text-white">{t.brand}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-light text-white transition-all active:scale-95 inline-flex items-center justify-center"
            title={t.logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MOBILE HORIZONTAL NAV */}
      <nav className="lg:hidden sticky top-[57px] z-20 bg-bg/95 backdrop-blur-xl border-b border-edge-light w-full overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 p-2 min-w-max">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all',
                  active ? 'bg-brand-red-500/15 text-brand-red-500' : 'text-text-secondary hover:bg-surface-elevated'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {(t.nav as any)[item.key]}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
