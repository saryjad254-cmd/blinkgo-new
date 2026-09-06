'use client';

/**
 * BottomNavigation — EXACT VISUAL (v4)
 *
 * 5-tab bottom navigation matching the reference:
 * - Home (house icon, red active state)
 * - Search
 * - Orders
 * - Favorites
 * - Profile
 *
 * Sticky to bottom of viewport (above safe-area on mobile).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/I18nProvider';
import House from 'lucide-react/dist/esm/icons/house.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import Receipt from 'lucide-react/dist/esm/icons/receipt.js';
import Heart from 'lucide-react/dist/esm/icons/heart.js';
import User from 'lucide-react/dist/esm/icons/user.js';

type Tab = {
  key: string;
  href: string;
  icon: typeof House;
  match: (pathname: string) => boolean;
  labelKey: string;
  labelFallback: string;
};

const TABS: Tab[] = [
  { key: 'home',      href: '/home',       icon: House,   match: (p) => p === '/home' || p === '/', labelKey: 'home',      labelFallback: 'Home' },
  { key: 'search',    href: '/search',     icon: Search,   match: (p) => p.startsWith('/search'),    labelKey: 'search',    labelFallback: 'Search' },
  { key: 'orders',    href: '/orders',     icon: Receipt,  match: (p) => p.startsWith('/orders'),    labelKey: 'orders',    labelFallback: 'Orders' },
  { key: 'favorites', href: '/favorites',  icon: Heart,    match: (p) => p.startsWith('/favorites'), labelKey: 'favorites', labelFallback: 'Favorites' },
  { key: 'profile',   href: '/profile',    icon: User,     match: (p) => p.startsWith('/profile') || p.startsWith('/account'), labelKey: 'profile', labelFallback: 'Profile' },
];

export function BottomNavigation() {
  const pathname = usePathname() || '/';
  const t = useT();

  // Map tab key to a label resolver that handles t.nav.* vs t.common.search
  const labelFor = (tab: Tab): string => {
    if (tab.key === 'search') {
      return t.common?.search || tab.labelFallback;
    }
    return t.nav?.[tab.labelKey as keyof typeof t.nav] || tab.labelFallback;
  };

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        'fixed bottom-0 inset-x-0 z-30',
        'bg-canvas/95 backdrop-blur-md',
        'border-t border-[var(--border)]',
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <ul className="mx-auto grid max-w-[820px] grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const label = labelFor(tab);
          const Icon = tab.icon;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 h-14',
                  'transition-colors',
                  active ? 'text-brand' : 'text-text-secondary hover:text-ink-primary'
                )}
              >
                <Icon
                  className={cn('w-[22px] h-[22px]', active && 'fill-brand/15')}
                  strokeWidth={active ? 2.2 : 1.6}
                  aria-hidden
                />
                <span className={cn('text-[11px] font-semibold leading-none', active && 'font-bold')}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
