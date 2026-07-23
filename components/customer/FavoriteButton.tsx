'use client';

import { Heart } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  restaurantId: string;
  initialFavorited?: boolean;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  onChange?: (favorited: boolean) => void;
  className?: string;
}

export function FavoriteButton({
  restaurantId,
  initialFavorited = false,
  size = 'md',
  showLabel = false,
  onChange,
  className,
}: Props) {
  const { t } = useI18n();
  const [favorite, setFavorite] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      const data = await res.json();
      if (data.ok) {
        setFavorite(data.favorited);
        onChange?.(data.favorited);
      }
    } catch (err) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  const ariaLabel = favorite
    ? (t.nav.removeFavorite || 'Aus Favoriten entfernen')
    : (t.nav.addFavorite || 'Zu Favoriten hinzufügen');

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full transition-all",
        favorite
          ? "bg-danger/20 text-danger hover:bg-danger/30"
          : "bg-surface-elevated/80 backdrop-blur text-text-secondary hover:text-danger",
        size === 'sm' ? "w-7 h-7" : "w-9 h-9",
        loading && "opacity-50"
      )}
    >
      <Heart
        className={cn(
          size === 'sm' ? "w-3.5 h-3.5" : "w-4 h-4",
          favorite && "fill-current"
        )}
      />
      {showLabel && (
        <span className="text-xs font-semibold pe-1">
          {favorite ? (t.nav.favorited || 'Favorit') : (t.nav.addFavorite || 'Zu Favoriten')}
        </span>
      )}
    </button>
  );
}
