'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  active: boolean;
}

export function FavoritesToggle({ active }: Props) {
  const { t } = useI18n();
  const params = useSearchParams();

  function buildHref() {
    const sp = new URLSearchParams(params?.toString() || '');
    if (sp.get('favorites') === '1') sp.delete('favorites');
    else sp.set('favorites', '1');
    return `?${sp.toString()}`;
  }

  return (
    <Link
      href={buildHref()}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-all",
        active
          ? "bg-danger text-white shadow-speed"
          : "bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white"
      )}
    >
      <Heart className={cn("w-3.5 h-3.5", active && "fill-current")} />
      {t.nav.favorites || 'Favoriten'}
    </Link>
  );
}
