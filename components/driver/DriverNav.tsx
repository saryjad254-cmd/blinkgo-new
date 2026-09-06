'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Truck from 'lucide-react/dist/esm/icons/truck';
import ListChecks from 'lucide-react/dist/esm/icons/list-checks';
import Wallet from 'lucide-react/dist/esm/icons/wallet';
import SettingsIcon from 'lucide-react/dist/esm/icons/settings';
import Wifi from 'lucide-react/dist/esm/icons/wifi';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import Battery from 'lucide-react/dist/esm/icons/battery';
import BatteryLow from 'lucide-react/dist/esm/icons/battery-low';
import Bell from 'lucide-react/dist/esm/icons/bell';
import History from 'lucide-react/dist/esm/icons/history';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

const NAV_LABELS = {
  de: { dashboard: 'Dashboard', orders: 'Bestellungen', history: 'Verlauf', earnings: 'Verdienst', notifications: 'Benachrichtigungen' },
  ar: { dashboard: 'الرئيسية', orders: 'الطلبات', history: 'السجل', earnings: 'الأرباح', notifications: 'الإشعارات' },
  en: { dashboard: 'Dashboard', orders: 'Orders', history: 'History', earnings: 'Earnings', notifications: 'Notifications' },
};

interface NavStatus {
  online: boolean;
  hasNet: boolean;
  battery: number | null;
}

interface BatteryManagerLike {
  level: number;
  addEventListener: (type: 'levelchange', listener: () => void) => void;
  removeEventListener?: (type: 'levelchange', listener: () => void) => void;
}

type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManagerLike> };

export function DriverNav({ user }: { user: { email: string; role: string; name: string } }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<NavStatus>({ online: false, hasNet: true, battery: null });

  const { t, locale } = useI18n();

  useEffect(() => {
    // Detect connection state
    const updateNet = () => setStatus((s) => ({ ...s, hasNet: navigator.onLine }));
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    updateNet();

    // Detect battery (Battery API)
    let batteryManager: BatteryManagerLike | null = null;
    let batteryListener: (() => void) | null = null;
    const handleBattery = (battery: BatteryManagerLike) => {
      batteryManager = battery;
      const update = () => setStatus((s) => ({ ...s, battery: Math.round(battery.level * 100) }));
      batteryListener = update;
      update();
      battery.addEventListener('levelchange', update);
    };
    const navigatorWithBattery = navigator as NavigatorWithBattery;
    navigatorWithBattery.getBattery?.().then(handleBattery).catch(() => undefined);

    // Poll driver online state
    const pollOnline = async () => {
      try {
        const res = await fetch('/api/driver/online', { cache: 'no-store' });
        const data = await res.json();
        if (data?.ok) setStatus((s) => ({ ...s, online: !!data.is_online }));
      } catch {
        // ignore
      }
    };
    void pollOnline();
    const pollTimer: ReturnType<typeof setInterval> = setInterval(() => void pollOnline(), 30_000);
    return () => {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
      clearInterval(pollTimer);
      if (batteryManager && batteryListener) batteryManager.removeEventListener?.('levelchange', batteryListener);
    };
  }, []);

  const t2 = NAV_LABELS[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const links = [
    { href: '/driver/dashboard', label: t2.dashboard, icon: Truck },
    { href: '/driver/orders', label: t2.orders, icon: ListChecks },
    { href: '/driver/history', label: t2.history, icon: History },
    { href: '/driver/earnings', label: t2.earnings, icon: Wallet },
    { href: '/driver/settings', label: t.driver?.settings || 'Settings', icon: SettingsIcon },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  // The dashboard owns a distraction-free, full-screen map cockpit with its
  // own compact navigation controls. Other driver pages keep the shared nav.
  if (pathname === '/driver/dashboard') return null;

  return (
    <>
      {/* Desktop top nav */}
      <nav
        dir={dir}
        className="sticky top-0 z-sticky bg-bg-elevated/95 backdrop-blur-xl border-b border-edge"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Brand */}
          <Link href="/driver/dashboard" aria-label="BlinkGo Driver" className="flex min-h-11 flex-shrink-0 items-center rounded-xl">
            <BlinkLogo variant="horizontal" size="sm" priority />
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
                  aria-current={active ? 'page' : undefined}
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

          <div className="flex items-center gap-2 md:hidden">
            <Link href="/driver/notifications" aria-label={t2.notifications} aria-current={isActive('/driver/notifications') ? 'page' : undefined} className={cn('grid size-11 place-items-center rounded-xl transition-colors', isActive('/driver/notifications') ? 'bg-brand-500/15 text-brand-500' : 'text-text-secondary hover:bg-ink-700 hover:text-white')}>
              <Bell className="size-5" />
            </Link>
            <LanguageSwitcher />
            <LogoutButton variant="icon" email={user.email} role={user.role} />
          </div>

          {/* Status pills (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <NavStatusPill status={status} locale={locale} />
            <Link href="/driver/notifications" aria-label={t2.notifications} aria-current={isActive('/driver/notifications') ? 'page' : undefined} className={cn('grid size-10 place-items-center rounded-xl transition-colors', isActive('/driver/notifications') ? 'bg-brand-500/15 text-brand-500' : 'text-text-secondary hover:bg-ink-700 hover:text-white')}>
              <Bell className="size-5" />
            </Link>
            <LanguageSwitcher />
            <div className="hidden lg:flex items-center gap-2 h-10 px-3 rounded-pill bg-ink-700 text-xs font-bold text-text-secondary">
                <div className="w-6 h-6 rounded-full bg-brand-gradient flex items-center justify-center text-[10px] text-white font-black">
                  {user.name?.[0]?.toUpperCase() || 'D'}
                </div>
                {user.name}
            </div>
            <LogoutButton email={user.email} role={user.role} />
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav
        dir={dir}
        className="md:hidden fixed bottom-0 inset-x-0 z-modal bg-bg-elevated/95 backdrop-blur-xl border-t border-edge pb-[env(safe-area-inset-bottom)]"
        role="navigation"
      >
        <div className="grid grid-cols-5 gap-1 px-1 py-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
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
