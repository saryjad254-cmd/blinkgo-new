'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UtensilsCrossed from 'lucide-react/dist/esm/icons/utensils-crossed';
import ShoppingBasket from 'lucide-react/dist/esm/icons/shopping-basket';
import PackageSearch from 'lucide-react/dist/esm/icons/package-search';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const LABELS = {
  de: {
    label: 'BlinkGo Bereiche',
    restaurants: 'Restaurants',
    market: 'Markt',
    shop: 'Shop',
  },
  en: {
    label: 'BlinkGo sections',
    restaurants: 'Restaurants',
    market: 'Market',
    shop: 'Shop',
  },
  ar: {
    label: 'أقسام بلينك جو',
    restaurants: 'مطاعم',
    market: 'ماركت',
    shop: 'تسوّق',
  },
} as const;

const SECTIONS = [
  { key: 'restaurants', href: '/restaurants', Icon: UtensilsCrossed, matches: (path: string) => path === '/home' || path.startsWith('/restaurants') },
  { key: 'market', href: '/market', Icon: ShoppingBasket, matches: (path: string) => path.startsWith('/market') },
  { key: 'shop', href: '/shop', Icon: PackageSearch, matches: (path: string) => path.startsWith('/shop') },
] as const;

export function CustomerMarketplaceNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/home';
  const { locale } = useI18n();
  const copy = LABELS[locale];

  return (
    <nav aria-label={copy.label} className={cn('px-4', className)} data-testid="customer-marketplace-nav">
      <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1.5 rounded-2xl border border-[var(--border)] bg-surface-1 p-1.5 shadow-sm">
        {SECTIONS.map(({ key, href, Icon, matches }) => {
          const active = matches(pathname);
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? 'page' : undefined}
              data-testid={`customer-section-${key}`}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                active
                  ? 'bg-speed-gradient text-white shadow-[0_8px_24px_rgba(225,6,0,.24)]'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-ink-primary',
              )}
            >
              <Icon className="size-4.5 shrink-0" aria-hidden />
              <span>{copy[key]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

