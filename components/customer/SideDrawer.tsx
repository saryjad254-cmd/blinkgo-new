'use client';

/**
 * SideDrawer — EXACT VISUAL (v4)
 *
 * Side drawer matching the reference exactly:
 * - Red-black gradient banner with rider + BlinkGo wordmark + bell badge
 * - Real user avatar + name + "Hi, [Name] 👋" + "Good to see you!"
 * - 8 nav items: Home / Search / Orders / Favorites / Addresses / Support / Settings / Logout
 * - Active item: large red selected state
 * - Divider before Logout
 * - "Deliver with BlinkGo" promo at bottom with red delivery bag + speed lines + "Join Now" CTA
 *
 * - Opens from hamburger
 * - Closes on backdrop click
 * - Closes on ESC
 * - Traps focus
 * - Works in DE/EN/AR (RTL-aware)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import Home from 'lucide-react/dist/esm/icons/home.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import Receipt from 'lucide-react/dist/esm/icons/receipt.js';
import Heart from 'lucide-react/dist/esm/icons/heart.js';
import MapPin from 'lucide-react/dist/esm/icons/map-pin.js';
import Headphones from 'lucide-react/dist/esm/icons/headphones.js';
import Settings from 'lucide-react/dist/esm/icons/settings.js';
import WalletCards from 'lucide-react/dist/esm/icons/wallet-cards.js';
import Store from 'lucide-react/dist/esm/icons/store.js';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag.js';
import ShoppingBasket from 'lucide-react/dist/esm/icons/shopping-basket.js';
import PackageSearch from 'lucide-react/dist/esm/icons/package-search.js';
import UserRound from 'lucide-react/dist/esm/icons/user-round.js';
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js';
import LogOut from 'lucide-react/dist/esm/icons/log-out.js';
import Bell from 'lucide-react/dist/esm/icons/bell.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { DeliveryBag } from '@/components/brand/DeliveryBag';
import { UserAvatar } from './UserAvatar';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  user?: {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  unreadCount?: number;
}

interface NavItem {
  key: string;
  href?: string;
  label: string;
  icon: typeof Home;
  onClick?: () => void;
}

export function SideDrawer({ open, onClose, user, unreadCount = 0 }: SideDrawerProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const drawerRef = useRef<HTMLElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      onClose();
      router.replace('/login');
      router.refresh();
    } catch {
      router.replace('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }, [onClose, router, signingOut]);

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navItems: NavItem[] = [
    { key: 'home',      href: '/home',       label: t.drawer?.item?.home      || t.nav?.home      || 'Home',        icon: Home },
    { key: 'search',    href: '/search',     label: t.drawer?.item?.search    || t.common?.search || 'Search',      icon: Search },
    { key: 'restaurants', href: '/restaurants', label: t.nav?.restaurants || (locale === 'ar' ? 'المطاعم' : 'Restaurants'), icon: Store },
    { key: 'market', href: '/market', label: locale === 'ar' ? 'الماركت' : locale === 'de' ? 'Markt' : 'Market', icon: ShoppingBasket },
    { key: 'shop', href: '/shop', label: locale === 'ar' ? 'التسوّق' : 'Shop', icon: PackageSearch },
    { key: 'cart',      href: '/cart',       label: t.nav?.cart || (locale === 'ar' ? 'سلة التسوق' : locale === 'de' ? 'Warenkorb' : 'Cart'), icon: ShoppingBag },
    { key: 'orders',    href: '/orders',     label: t.drawer?.item?.orders    || t.nav?.orders    || 'Orders',      icon: Receipt },
    { key: 'favorites', href: '/favorites',  label: t.drawer?.item?.favorites || t.nav?.favorites || 'Favorites',   icon: Heart },
    { key: 'notifications', href: '/notifications', label: t.notifications?.title || (locale === 'ar' ? 'الإشعارات' : locale === 'de' ? 'Benachrichtigungen' : 'Notifications'), icon: Bell },
    { key: 'wallet',    href: '/payment-history', label: locale === 'ar' ? 'المحفظة' : locale === 'de' ? 'Wallet' : 'Wallet', icon: WalletCards },
    { key: 'profile',   href: '/profile', label: t.nav?.profile || (locale === 'ar' ? 'الحساب' : locale === 'de' ? 'Konto' : 'Account'), icon: UserRound },
    { key: 'addresses', href: '/profile#addresses', label: t.drawer?.item?.addresses || 'Addresses',                           icon: MapPin },
    { key: 'support',   href: '/help',       label: t.drawer?.item?.support   || 'Support',                                     icon: Headphones },
    { key: 'settings',  href: '/profile#settings', label: t.drawer?.item?.settings || 'Settings',                               icon: Settings },
    { key: 'logout',                       label: t.drawer?.item?.logout    || 'Logout',                                      icon: LogOut,     onClick: handleSignOut },
  ];

  // ESC + focus trap
  useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        // Simple focus trap
        const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // Focus the close button
    setTimeout(() => firstFocusableRef.current?.focus(), 50);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  // Display name
  const displayName =
    user?.full_name ||
    user?.email?.split('@')[0] ||
    t.drawer?.guest ||
    'Guest';

  // Render at document level so a transformed/centred parent can never alter
  // the drawer's fixed positioning. When closed it is removed from the DOM,
  // preventing an invisible layer from intercepting clicks.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
        data-testid="drawer-backdrop"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.drawer?.title || 'Main menu'}
        tabIndex={-1}
        className={cn(
          'fixed inset-y-0 z-[110] h-[100dvh] w-[88vw] max-w-[360px]',
          'bg-canvas border-[var(--border)] shadow-2xl',
          'flex flex-col overflow-hidden',
          locale === 'ar' ? 'right-0 border-l' : 'left-0 border-r'
        )}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        data-testid="side-drawer"
      >
        {/* Red gradient header with rider + bell */}
        <div className="relative shrink-0 bg-gradient-to-br from-[#E10600] via-[#7A0300] to-[#1A0100] overflow-hidden">
          {/* Close button */}
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label={t.drawer?.close || 'Close menu'}
            className="absolute end-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X className="w-5 h-5" strokeWidth={2} aria-hidden />
          </button>

          {/* Bell badge */}
          <Link
            href="/notifications"
            onClick={onClose}
            className="absolute end-16 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label={t.notifications?.title || 'Notifications'}
          >
            <Bell className="w-5 h-5" strokeWidth={1.8} aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-white text-brand text-[10px] font-bold tabular-nums leading-none shadow-[0_0_0_2px_rgba(0,0,0,0.4)]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          {/* Official compact lockup — one canonical logo across the app. */}
          <div className="pointer-events-none relative z-10 px-5 pb-3 pt-14">
            <div className="inline-flex rounded-2xl border border-white/10 bg-black/35 px-3 py-2 shadow-xl backdrop-blur-md">
              <BlinkLogo variant="horizontal" size="lg" priority />
            </div>
          </div>
        </div>

        {/* User profile section */}
        <div className="px-5 pt-4 pb-4 flex items-center gap-3">
          <UserAvatar
            name={user?.full_name}
            email={user?.email}
            avatarUrl={user?.avatar_url}
            size={56}
            className="shrink-0 ring-2 ring-[var(--border)]"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-ink-primary font-extrabold text-[18px] leading-tight">
              {t.drawer?.hi || 'Hi'}, {displayName} <span aria-hidden>👋</span>
            </h3>
            <p className="text-text-secondary text-[13px] mt-0.5">
              {t.drawer?.greeting?.fallback || 'Good to see you!'}
            </p>
          </div>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Drawer navigation">
          <ul role="list" className="space-y-1">
            {navItems.slice(0, -1).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href || '#'}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 h-12 px-4 rounded-xl text-[15px] font-semibold transition-colors',
                      active
                        ? 'bg-brand text-white shadow-[0_4px_12px_rgba(225,6,0,0.35)]'
                        : 'text-ink-primary hover:bg-surface-1'
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <label className="mx-1 mt-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-ink-primary transition-colors hover:bg-surface-1">
            <Globe2 className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="flex-1">{locale === 'ar' ? 'اللغة' : locale === 'de' ? 'Sprache' : 'Language'}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className="min-h-11 rounded-lg border border-white/10 bg-surface-2 px-2 text-xs text-ink-primary outline-none focus:border-brand">
              <option value="de">DE</option>
              <option value="ar">AR</option>
              <option value="en">EN</option>
            </select>
          </label>

          {/* Divider before logout */}
          <div className="my-2 mx-3 border-t border-[var(--border)]" aria-hidden />

          {/* Logout (full width, not selected) */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-3 h-12 px-4 rounded-xl text-[15px] font-semibold text-ink-primary hover:bg-surface-1 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.8} aria-hidden />
            <span>{navItems[navItems.length - 1].label}</span>
          </button>

          {/* Keep the promo inside the scroll area so it can never hide menu items
              on short phones or landscape screens. */}
          <div className="mt-3 pb-4">
          <div className="relative rounded-2xl bg-surface-1 border border-[var(--border)] p-4 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-ink-primary font-extrabold text-[15px] leading-tight">
                  {t.drawer?.item?.becomeDriverTitle || 'Deliver with'}
                  <br />
                  {t.drawer?.item?.becomeDriverBrand || 'BlinkGo'}
                </h4>
                <p className="text-text-secondary text-[12px] mt-1.5 leading-tight">
                  {t.drawer?.item?.becomeDriverSub || 'Earn on your schedule'}
                </p>
                <Link
                  href="/register?role=driver"
                  onClick={onClose}
                  className="mt-3 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-4 text-[13px] font-bold text-white transition-all hover:bg-brand-hover active:scale-95"
                >
                  {t.drawer?.item?.joinNow || 'Join Now'}
                </Link>
              </div>
              <div className="shrink-0 w-20 h-24 -my-2 -me-1">
                <DeliveryBag className="w-full h-full" />
              </div>
            </div>
          </div>
          </div>
        </nav>
      </aside>
    </>,
    document.body
  );
}
