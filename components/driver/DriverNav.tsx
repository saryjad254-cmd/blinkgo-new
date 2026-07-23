'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Truck,
  ListChecks,
  Wallet,
  Settings as SettingsIcon,
  History,
  Wifi,
  WifiOff,
  Battery,
  BatteryLow,
  Signal,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Logo } from '@/components/ui/Logo';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';

const NAV_LABELS = {
  de: { dashboard: 'Dashboard', orders: 'Bestellungen', history: 'Verlauf', earnings: 'Verdienst' },
  ar: { dashboard: 'الرئيسية', orders: 'الطلبات', history: 'السجل', earnings: 'الأرباح' },
  en: { dashboard: 'Dashboard', orders: 'Orders', history: 'History', earnings: 'Earnings' },
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

interface NavStatus {
  online: boolean;
  hasNet: boolean;
  battery: number | null;
}

export function DriverNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; role: string; name: string } | null>(null);
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');
  const [status, setStatus] = useState<NavStatus>({ online: false, hasNet: true, battery: null });

  const { t } = useI18n();

  useEffect(() => {
    setLocale(detectLocale());
    const sb = createBrowserClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: u } = await sb
          .from('users')
          .select('email, role, name')
          .eq('id', data.user.id)
          .single();
        if (u) setUser(u as any);
      }
    });

    // Detect connection state
    const updateNet = () => setStatus((s) => ({ ...s, hasNet: navigator.onLine }));
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    updateNet();

    // Detect battery (Battery API)
    let bat: any = null;
    const handleBat = (b: any) => {
      if (!b || typeof b.addEventListener !== 'function') return;
      const update = () => setStatus((s) => ({ ...s, battery: Math.round(b.level * 100) }));
      update();
      b.addEventListener('levelchange', update);
    };
    if (typeof (navigator as any).getBattery === 'function') {
      (navigator as any).getBattery().then(handleBat).catch(() => {});
    }

    // Poll driver online state
    const pollOnline: ReturnType<typeof setInterval> = setInterval(async () => {
      try {
        const res = await fetch('/api/driver/online', { cache: 'no-store' });
        const data = await res.json();
        if (data?.ok) setStatus((s) => ({ ...s, online: !!data.is_online }));
      } catch {
        // ignore
      }
    }, 30_000);
    pollOnline;

    return () => {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
      clearInterval(pollOnline);
    };
  }, []);

  const t2 = NAV_LABELS[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const links = [
    { href: '/driver/dashboard', label: t2.dashboard, icon: Truck },
    { href: '/driver/orders', label: t2.orders, icon: ListChecks },
    { href: '/driver/earnings', label: t2.earnings, icon: Wallet },
    { href: '/driver/settings', label: t.driver?.settings || 'Settings', icon: SettingsIcon },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <>
      {/* Desktop top nav */}
      <nav
        dir={dir}
        className="sticky top-0 z-sticky bg-bg-elevated/95 backdrop-blur-xl border-b border-edge"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Brand */}
          <Link href="/driver/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-extrabold text-white hidden sm:inline">BlinkGo · Driver</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            {links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'inline-flex items-center gap-2 h-10 px-3.5 rounded-pill text-sm font-bold transition-all',
                    active
                      ? 'bg-brand-gradient text-white shadow-glow'
                      : 'text-text-secondary hover:text-white hover:bg-ink-700'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex-1 md:hidden" />

          {/* Status pills (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <NavStatusPill status={status} locale={locale} />
            <LanguageSwitcher />
            {user && (
              <div className="hidden lg:flex items-center gap-2 h-10 px-3 rounded-pill bg-ink-700 text-xs font-bold text-text-secondary">
                <div className="w-6 h-6 rounded-full bg-brand-gradient flex items-center justify-center text-[10px] text-white font-black">
                  {user.name?.[0]?.toUpperCase() || 'D'}
                </div>
                {user.name}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav
        dir={dir}
        className="md:hidden fixed bottom-0 inset-x-0 z-modal bg-bg-elevated/95 backdrop-blur-xl border-t border-edge pb-[env(safe-area-inset-bottom)]"
        role="navigation"
      >
        <div className="grid grid-cols-4 gap-1 px-1 py-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 rounded-xl transition-all touch-manipulation',
                  active ? 'text-brand-500' : 'text-text-muted active:text-white'
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                    active && 'bg-brand-500/15'
                  )}
                >
                  <Icon className={cn('w-5 h-5', active && 'scale-110')} />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wide">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function NavStatusPill({
  status,
  locale,
}: {
  status: NavStatus;
  locale: 'de' | 'ar' | 'en';
}) {
  const t = (de: string, ar: string, en: string) =>
    locale === 'ar' ? ar : locale === 'en' ? en : de;
  return (
    <div className="hidden xl:flex items-center gap-1.5 h-8 px-2.5 rounded-pill bg-ink-700 text-[11px] font-bold">
      {/* Connection */}
      {status.hasNet ? (
        <span className="flex items-center gap-1 text-emerald-400" title="Online">
          <Wifi className="w-3 h-3" />
        </span>
      ) : (
        <span className="flex items-center gap-1 text-red-400" title="Offline">
          <WifiOff className="w-3 h-3" />
        </span>
      )}
      {/* Online status */}
      {status.online ? (
        <span className="flex items-center gap-1 text-emerald-400" title="Driver online">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {t('Online', 'متصل', 'Online')}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-text-muted" title="Driver offline">
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
          {t('Offline', 'غير متصل', 'Offline')}
        </span>
      )}
      {/* Battery */}
      {status.battery != null && (
        <span
          className={cn(
            'flex items-center gap-1',
            status.battery < 20 ? 'text-red-400' : status.battery < 40 ? 'text-brand-yellow-400' : 'text-text-secondary'
          )}
          title={`${status.battery}%`}
        >
          {status.battery < 20 ? <BatteryLow className="w-3 h-3" /> : <Battery className="w-3 h-3" />}
          {status.battery}%
        </span>
      )}
    </div>
  );
}
