'use client';

/**
 * AppHeader — EXACT VISUAL (v4)
 *
 * Top header matching the reference image exactly:
 * - Hamburger menu (left) → opens side drawer
 * - BlinkGoRider SVG + "BlinkGo" wordmark (center, dominant)
 * - Notification bell with red badge (right)
 *
 * Sticky, top-0, on dark canvas.
 */

import Link from 'next/link';
import Bell from 'lucide-react/dist/esm/icons/bell.js';
import Menu from 'lucide-react/dist/esm/icons/menu.js';
import MapPin from 'lucide-react/dist/esm/icons/map-pin.js';
import { useI18n, useT } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

interface AppHeaderProps {
  onOpenDrawer: () => void;
  unreadCount?: number;
  deliveryLocation?: string | null;
}

export function AppHeader({ onOpenDrawer, unreadCount = 0, deliveryLocation }: AppHeaderProps) {
  const t = useT();
  const { locale } = useI18n();
  const locationLabel = deliveryLocation || (locale === 'de'
    ? 'Lieferadresse wählen'
    : locale === 'ar'
      ? 'اختر عنوان التوصيل'
      : 'Choose delivery address');
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-canvas/90 backdrop-blur-xl">
      <div className="flex h-[76px] items-center justify-between px-3">
        {/* Hamburger */}
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={t.drawer?.openMenu || 'Open menu'}
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-xl text-ink-primary transition-colors hover:bg-surface-1 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <Menu className="w-6 h-6" strokeWidth={2} aria-hidden />
        </button>

        {/* Canonical product lockup. Campaign rider art stays out of navigation. */}
        <div className="flex flex-col items-center gap-0.5">
          <Link href="/home" className="flex min-h-11 select-none items-center rounded-xl" aria-label="BlinkGo home">
            <BlinkLogo variant="horizontal" size="lg" priority />
          </Link>
          <Link href="/addresses" title={locationLabel} className="-mt-1 inline-flex min-h-5 max-w-[210px] items-center gap-1 text-[10px] font-medium text-text-secondary hover:text-white sm:max-w-[300px]">
            <MapPin className="h-3 w-3 text-brand" aria-hidden />
            <span className="truncate">{locationLabel}</span>
          </Link>
        </div>

        {/* Bell + badge */}
        <Link
          href="/notifications"
          aria-label={t.notifications?.title || 'Notifications'}
          className="relative -mr-1 flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-surface-1 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <Bell className="w-6 h-6 text-ink-primary" strokeWidth={1.8} aria-hidden />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1',
                'flex items-center justify-center rounded-full',
                'bg-brand text-white text-[10px] font-bold tabular-nums leading-none',
                'shadow-[0_0_0_2px_var(--canvas)]'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
