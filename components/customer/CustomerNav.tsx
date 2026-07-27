'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Store from 'lucide-react/dist/esm/icons/store';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import ShoppingCart from 'lucide-react/dist/esm/icons/shopping-cart';
import UserIcon from 'lucide-react/dist/esm/icons/user';
import Search from 'lucide-react/dist/esm/icons/search';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Bell from 'lucide-react/dist/esm/icons/bell';
import { useCart } from '@/lib/cart-store';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationsBellSafe } from '@/components/notifications/NotificationsBellSafe';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

export function CustomerNav() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const itemCount = useCart((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  const LINKS = [
    { href: '/search',      icon: Search,      getLabel: () => t.common.search },
    { href: '/restaurants', icon: Store,       getLabel: () => t.nav.restaurants },
    { href: '/favorites',   icon: Heart,       getLabel: () => t.nav.favorites },
    { href: '/orders',      icon: ShoppingBag, getLabel: () => t.nav.orders },
    { href: '/cart',        icon: ShoppingCart, getLabel: () => t.nav.cart, badge: true },
    { href: '/profile',     icon: UserIcon,    getLabel: () => t.nav.profile },
  ];

  return (
    <>
      {/* ═══════ DESKTOP TOP NAV ═══════ */}
      <nav className="hidden md:block sticky top-0 z-sticky bg-bg/85 backdrop-blur-2xl border-b border-edge">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo — fixed size, never crops, scales on hover */}
            <Link
              href="/search"
              aria-label="BlinkGo home"
              className="flex items-center transition-transform hover:scale-105 active:scale-95 shrink-0"
              style={{ width: '140px', height: '48px' }}
            >
              <BlinkLogo size="md" variant="horizontal" className="w-full h-full" />
            </Link>

            {/* Nav Links */}
            <div className="flex items-center gap-1">
              {LINKS.map((l) => {
                const Icon = l.icon;
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                const isCartEmptyHighlight = l.href === '/cart' && itemCount === 0;
                const label = l.getLabel();

                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-all relative',
                      active && !isCartEmptyHighlight
                        ? 'bg-brand-red/15 text-brand-red'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-light',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                    {l.badge && itemCount > 0 && (
                      <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-extrabold flex items-center justify-center">
                        {itemCount > 9 ? '9+' : itemCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <NotificationsBellSafe locale={locale} />
              <LanguageSwitcher />
              <ThemeToggle />
              <LogoutButton email="" role="customer" />
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════ MOBILE TOP HEADER ═══════ */}
      <header className="md:hidden sticky top-0 z-sticky bg-bg/95 backdrop-blur-2xl border-b border-edge">
        <div className="px-4 py-3 flex items-center justify-between min-h-[56px]">
          <Link
            href="/search"
            aria-label="BlinkGo home"
            className="flex items-center gap-2 shrink-0"
            style={{ height: '40px' }}
          >
            <div style={{ width: '40px', height: '40px' }} className="shrink-0">
              <BlinkLogo size="sm" variant="mark" className="w-full h-full" />
            </div>
            <span className="font-black italic text-text-primary text-lg tracking-tighter whitespace-nowrap">
              Blink<span className="text-brand-red">Go</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher />
            <NotificationsBellSafe locale={locale} />
            <LogoutButton variant="icon" email="" role="customer" />
          </div>
        </div>
      </header>

      {/* ═══════ MOBILE BOTTOM TAB BAR ═══════ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-sticky bg-surface/85 backdrop-blur-2xl border-t border-edge pb-[env(safe-area-inset-bottom,0px)]">
        <div className="grid grid-cols-5 max-w-screen-sm mx-auto">
          {LINKS.slice(0, 5).map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            const label = l.getLabel();
            const isCartEmptyHighlight = l.href === '/cart' && itemCount === 0;
            const showActive = active && !isCartEmptyHighlight;

            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={showActive ? 'page' : undefined}
                aria-label={label}
                className={cn(
                  'group relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] transition-colors',
                  'active:scale-95 touch-manipulation',
                  showActive ? 'text-brand-red' : 'text-text-secondary',
                )}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {l.badge && itemCount > 0 && (
                    <span className="absolute -top-1.5 -end-2 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-red text-white text-[9px] font-extrabold flex items-center justify-center">
                      {itemCount > 9 ? '9+' : itemCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold leading-none">{label}</span>
                {showActive && (
                  <span className="absolute top-0 inset-x-3 h-0.5 bg-brand-red rounded-b-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
