'use client';

/**
 * PremiumRestaurantCard — world-class restaurant card.
 *
 * Inspired by Uber Eats / Wolt / DoorDash best practices:
 *   - Large hero image with lazy loading + blur placeholder
 *   - Floating status badge (open/closed/busy)
 *   - Delivery fee + ETA grouped together
 *   - Favorite button on hover (always on touch)
 *   - Distance from user (if location available)
 *   - Smooth hover lift
 *   - Subtle gradient overlay for legibility
 *   - Rating + reviews count
 *   - "Featured" / "Promoted" / "Free delivery" badges
 *   - Cuisine chips
 *   - Carbon footprint (BlinkGo signature)
 */

import { memo } from 'react';
import Link from 'next/link';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import BadgeCheck from 'lucide-react/dist/esm/icons/badge-check';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Flame from 'lucide-react/dist/esm/icons/flame';
import { useTranslations as useT } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CatalogImage } from '@/components/customer/CatalogImage';

export interface PremiumRestaurantCardProps {
  id: string;
  name: string;
  cuisine?: string[];
  rating: number;
  reviewCount?: number;
  deliveryFee: number;
  estimatedDeliveryTime: number; // minutes
  coverUrl?: string;
  distance?: number; // km from user
  isPromoted?: boolean;
  isFeatured?: boolean;
  isOpen?: boolean;
  busyMode?: 'low' | 'medium' | 'high' | null;
  hasFreeDelivery?: boolean;
  carbonScore?: number; // 1-5, lower is greener
  href?: string;
  /** Layout variant */
  variant?: 'default' | 'compact' | 'wide';
  priority?: boolean;
  onFavoriteToggle?: () => void;
  isFavorite?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<'low' | 'medium' | 'high', { color: string; key: string }> = {
  low: { color: 'text-emerald-400 bg-emerald-500/15', key: 'status.busy.low' },
  medium: { color: 'text-amber-400 bg-amber-500/15', key: 'status.busy.medium' },
  high: { color: 'text-red-400 bg-red-500/15', key: 'status.busy.high' },
};

function PremiumRestaurantCardImpl({
  id,
  name,
  cuisine = [],
  rating,
  reviewCount = 0,
  deliveryFee,
  estimatedDeliveryTime,
  coverUrl,
  distance,
  isPromoted = false,
  isFeatured = false,
  isOpen = true,
  busyMode = null,
  hasFreeDelivery = false,
  carbonScore,
  href,
  variant = 'default',
  priority = false,
  onFavoriteToggle,
  isFavorite = false,
  className,
}: PremiumRestaurantCardProps) {
  const t = useT();
  const linkHref = href || `/restaurants/${id}`;

  // Compact variant (used in horizontal carousels)
  if (variant === 'compact') {
    return (
      <Link
        href={linkHref}
        className={cn(
          'group block relative w-[180px] flex-shrink-0 overflow-hidden rounded-2xl',
          'bg-bg-card border border-white/[0.06]',
          'transition-all duration-300 ease-out',
          'hover:-translate-y-1 hover:border-white/[0.12] hover:shadow-premium',
          !isOpen && 'opacity-60',
          className,
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-bg-elevated">
          <CatalogImage src={coverUrl} alt={name} name={name} kind="restaurant" priority={priority} sizes="180px" className="group-hover:scale-[1.045]" />
          {/* Top gradient for badges */}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
          {/* Bottom gradient for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {isPromoted && <Badge tone="brand" icon={<Sparkles className="h-3 w-3" />}>{t('badge.promoted')}</Badge>}
            {hasFreeDelivery && <Badge tone="success">{t('badge.free')}</Badge>}
            {isFeatured && <Badge tone="violet" icon={<Flame className="h-3 w-3" />}>{t('badge.featured')}</Badge>}
          </div>
          {/* Favorite */}
          {onFavoriteToggle && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onFavoriteToggle(); }}
              className={cn(
                'absolute top-2 right-2 h-8 w-8 rounded-full grid place-items-center',
                'bg-black/40 backdrop-blur-md transition-all duration-200',
                'hover:bg-black/60 active:scale-95',
                isFavorite && 'text-red-500',
              )}
              aria-label={t(isFavorite ? 'action.unfavorite' : 'action.favorite')}
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
            </button>
          )}
          {/* Closed overlay */}
          {!isOpen && (
            <div className="absolute inset-0 grid place-items-center bg-black/50">
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-black/70 text-white">
                {t('status.closed')}
              </span>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-sm text-text-primary line-clamp-1 group-hover:text-brand-400 transition-colors">
            {name}
          </h3>
          {cuisine.length > 0 && (
            <p className="text-xs text-text-muted line-clamp-1 mt-0.5">
              {cuisine.slice(0, 2).join(' · ')}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-text-secondary">
              <Star className="h-3 w-3 fill-current text-amber-400" />
              <span className="font-medium">{rating.toFixed(1)}</span>
              {reviewCount > 0 && <span className="text-text-muted">({reviewCount})</span>}
            </div>
            <div className="flex items-center gap-2 text-text-muted">
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {estimatedDeliveryTime}
              </span>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Truck className="h-3 w-3" />
                {hasFreeDelivery ? t('price.free') : formatEUR(deliveryFee)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Wide variant (used in lists)
  return (
    <Link
      href={linkHref}
      className={cn(
        'group block relative overflow-hidden rounded-2xl',
        'bg-bg-card border border-white/[0.06]',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-premium',
        !isOpen && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-stretch">
        <div className="relative w-32 sm:w-40 flex-shrink-0 overflow-hidden bg-bg-elevated">
          <CatalogImage src={coverUrl} alt={name} name={name} kind="restaurant" priority={priority} sizes="(max-width: 640px) 128px, 160px" className="group-hover:scale-[1.045]" />
        </div>
        <div className="flex-1 p-3 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-base text-text-primary line-clamp-1 group-hover:text-brand-400 transition-colors">
              {name}
            </h3>
            {onFavoriteToggle && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onFavoriteToggle(); }}
                className={cn(
                  'h-7 w-7 rounded-full grid place-items-center flex-shrink-0',
                  'hover:bg-white/[0.08] active:scale-95 transition-all',
                  isFavorite && 'text-red-500',
                )}
                aria-label={t(isFavorite ? 'action.unfavorite' : 'action.favorite')}
              >
                <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
              </button>
            )}
          </div>
          {cuisine.length > 0 && (
            <p className="text-sm text-text-muted line-clamp-1 mt-0.5">
              {cuisine.slice(0, 3).join(' · ')}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-text-secondary">
              <Star className="h-3.5 w-3.5 fill-current text-amber-400" />
              <span className="font-semibold">{rating.toFixed(1)}</span>
              {reviewCount > 0 && <span className="text-text-muted">({reviewCount})</span>}
            </div>
            <div className="flex items-center gap-1 text-text-muted">
              <Clock className="h-3.5 w-3.5" />
              {estimatedDeliveryTime} {t('time.min')}
            </div>
            <div className="flex items-center gap-1 text-text-muted">
              <Truck className="h-3.5 w-3.5" />
              {hasFreeDelivery ? <span className="text-emerald-400 font-medium">{t('price.free')}</span> : formatEUR(deliveryFee)}
            </div>
            {distance !== undefined && (
              <div className="text-text-muted hidden sm:block">
                · {distance.toFixed(1)} {t('unit.km')}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {isPromoted && <Badge tone="brand" icon={<Sparkles className="h-3 w-3" />} small>{t('badge.promoted')}</Badge>}
            {hasFreeDelivery && <Badge tone="success" small>{t('badge.free')}</Badge>}
            {isFeatured && <Badge tone="violet" icon={<Flame className="h-3 w-3" />} small>{t('badge.featured')}</Badge>}
            {busyMode && <Badge tone={busyMode === 'high' ? 'error' : busyMode === 'medium' ? 'warning' : 'success'} small>
              {t(STATUS_LABEL[busyMode].key)}
            </Badge>}
            {carbonScore !== undefined && carbonScore <= 2 && (
              <Badge tone="success" small icon={<BadgeCheck className="h-3 w-3" />}>
                {t('badge.eco')}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'violet';
  icon?: React.ReactNode;
  small?: boolean;
  className?: string;
}

const toneMap = {
  brand: 'bg-red-500/15 text-red-300 border-red-500/20',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  error: 'bg-red-500/15 text-red-300 border-red-500/20',
  info: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
};

function Badge({ children, tone = 'brand', icon, small = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full',
        'border backdrop-blur-md',
        small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        toneMap[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export const PremiumRestaurantCard = memo(PremiumRestaurantCardImpl);
