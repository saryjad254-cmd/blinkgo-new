'use client';

import Heart from 'lucide-react/dist/esm/icons/heart';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';

let favoriteIdsCache: Set<string> | null = null;
let favoriteIdsRequest: Promise<Set<string>> | null = null;

function loadFavoriteIds(): Promise<Set<string>> {
  if (favoriteIdsCache) return Promise.resolve(favoriteIdsCache);
  if (!favoriteIdsRequest) {
    favoriteIdsRequest = fetch('/api/favorites', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load favorites');
        const payload = await response.json();
        const root = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
        const data = typeof root.data === 'object' && root.data !== null ? root.data as Record<string, unknown> : {};
        const rows = Array.isArray(data.favorites) ? data.favorites : Array.isArray(root.favorites) ? root.favorites : [];
        favoriteIdsCache = new Set(rows.flatMap((row) => {
          if (typeof row !== 'object' || row === null) return [];
          const id = (row as Record<string, unknown>).restaurant_id;
          return typeof id === 'string' ? [id] : [];
        }));
        return favoriteIdsCache;
      })
      .finally(() => {
        favoriteIdsRequest = null;
      });
  }
  return favoriteIdsRequest;
}

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
  const toast = useToast();
  const [favorite, setFavorite] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    loadFavoriteIds()
      .then((ids) => {
        if (active) setFavorite(initialFavorited || ids.has(restaurantId));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialFavorited, restaurantId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);

    try {
      const nextFavorite = !favorite;
      const res = await fetch('/api/favorites', {
        method: nextFavorite ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error?.message || 'Favorite update failed');
      setFavorite(nextFavorite);
      favoriteIdsCache ??= new Set();
      if (nextFavorite) favoriteIdsCache.add(restaurantId);
      else favoriteIdsCache.delete(restaurantId);
      onChange?.(nextFavorite);
    } catch {
      toast.error(t.errors?.generic || 'Aktion fehlgeschlagen');
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
      aria-pressed={favorite}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full transition-all",
        favorite
          ? "bg-danger/20 text-danger hover:bg-danger/30"
          : "bg-surface-elevated/80 backdrop-blur text-text-secondary hover:text-danger",
        "w-11 h-11",
        loading && "opacity-50",
        className,
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
