'use client';

/**
 * PremiumProductCard — world-class menu product card.
 *
 * Inspired by Uber Eats / Wolt / DoorDash best practices:
 *   - Large image with subtle hover zoom
 *   - Floating Add to Cart button on hover (always on touch)
 *   - Product badges (popular, spicy, new, vegan, etc.)
 *   - Description with smart line clamp
 *   - Price + discount price with strikethrough
 *   - Quick info (sold count, prep time)
 *   - Premium glassmorphism on the floating CTA
 *   - Smooth, snappy animations
 */

import { memo, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Flame from 'lucide-react/dist/esm/icons/flame';
import Leaf from 'lucide-react/dist/esm/icons/leaf';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Star from 'lucide-react/dist/esm/icons/star';
import { useI18n, useTranslations as useT } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CatalogImage } from '@/components/customer/CatalogImage';

export interface PremiumProductCardProps {
  id: string;
  name: string;
  description?: string;
  price: number;
  discountPrice?: number;
  imageUrls?: string[];
  category?: string;
  badges?: string[]; // e.g. ['popular', 'spicy', 'vegan', 'new']
  soldCount?: number;
  rating?: number;
  prepMinutes?: number;
  href?: string;
  onAddToCart?: () => void;
  /** Layout variant */
  variant?: 'default' | 'wide' | 'minimal';
  priority?: boolean;
  className?: string;
}

const BADGE_MAP: Record<string, { tone: 'success' | 'warning' | 'error' | 'brand' | 'violet' | 'info'; icon?: ComponentType<{ className?: string }>; key: string }> = {
  popular: { tone: 'brand', icon: Flame, key: 'productDetail.popularBadge' },
  spicy: { tone: 'error', icon: Flame, key: 'productDetail.spicyBadge' },
  vegan: { tone: 'success', icon: Leaf, key: 'productDetail.veganBadge' },
  vegetarian: { tone: 'success', icon: Leaf, key: 'productDetail.vegetarianBadge' },
  new: { tone: 'violet', icon: Sparkles, key: 'productDetail.newBadge' },
  bestseller: { tone: 'brand', icon: Star, key: 'productDetail.bestsellerBadge' },
};

function PremiumProductCardImpl({
  name,
  description = '',
  price,
  discountPrice,
  imageUrls = [],
  category,
  badges = [],
  soldCount,
  rating,
  prepMinutes,
  onAddToCart,
  variant = 'default',
  priority = false,
  className,
}: PremiumProductCardProps) {
  const t = useT();
  const { locale } = useI18n();
  const addLabel = t('action.add', locale === 'ar' ? 'إضافة إلى السلة' : locale === 'de' ? 'In den Warenkorb' : 'Add to cart');
  const cover = imageUrls[0];

  // Calculate discount percentage
  const hasDiscount = discountPrice !== undefined && discountPrice < price;
  const discountPercent = hasDiscount
    ? Math.round(((price - discountPrice!) / price) * 100)
    : 0;

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-3 p-3 rounded-xl bg-bg-card border border-white/[0.06]', className)}>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm text-text-primary line-clamp-1">{name}</h3>
          {description && <p className="text-xs text-text-muted line-clamp-1 mt-0.5">{description}</p>}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-400">
              {hasDiscount ? formatEUR(discountPrice!) : formatEUR(price)}
            </span>
            {hasDiscount && <span className="text-xs text-text-muted line-through">{formatEUR(price)}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onAddToCart}
          className="h-9 w-9 rounded-full bg-brand-gradient grid place-items-center text-white shadow-glow active:scale-95 transition-transform"
          aria-label={addLabel}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    );
  }

  if (variant === 'wide') {
    return (
      <div
        className={cn(
          'group flex items-stretch gap-3 p-3 rounded-2xl',
          'bg-bg-card border border-white/[0.06]',
          'transition-all duration-200',
          'hover:border-white/[0.12] hover:shadow-premium',
          className,
        )}
      >
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-bg-elevated flex-shrink-0">
          <CatalogImage src={cover} alt={name} name={name} kind="product" priority={priority} sizes="(max-width: 640px) 96px, 112px" className="group-hover:scale-[1.045]" />
          {hasDiscount && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              -{discountPercent}%
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-semibold text-sm sm:text-base text-text-primary line-clamp-1">{name}</h3>
          {description && (
            <p className="text-xs text-text-muted line-clamp-2 mt-0.5">{description}</p>
          )}
          {(category || rating || prepMinutes) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-text-muted">
              {category && <span className="truncate">{category}</span>}
              {rating ? <span className="inline-flex items-center gap-1"><Star className="size-3 fill-brand-yellow text-brand-yellow" />{rating.toFixed(1)}</span> : null}
              {prepMinutes ? <span>{prepMinutes} {t('time.min', 'min')}</span> : null}
            </div>
          )}
          <div className="mt-auto pt-2 flex items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-base text-text-primary">
                  {hasDiscount ? formatEUR(discountPrice!) : formatEUR(price)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-text-muted line-through">{formatEUR(price)}</span>
                )}
              </div>
              {soldCount !== undefined && soldCount > 50 && (
                <span className="text-[10px] text-text-muted">
                  {t('label.soldCount', `${soldCount} sold`)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onAddToCart}
              className={cn(
                'h-9 w-9 rounded-full grid place-items-center text-white flex-shrink-0',
                'bg-brand-gradient shadow-glow',
                'active:scale-95 transition-transform',
              )}
              aria-label={addLabel}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default vertical card
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20%' }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={cn('group block relative', className)}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-bg-elevated sm:aspect-[16/10]">
        <CatalogImage src={cover} alt={name} name={name} kind="product" priority={priority} sizes="(max-width: 640px) 50vw, 33vw" className="group-hover:scale-[1.045]" />

        {/* Top badges */}
        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {badges.slice(0, 2).map((b, i) => {
              const config = BADGE_MAP[b];
              if (!config) return null;
              const Icon = config.icon;
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                    'border backdrop-blur-md',
                    config.tone === 'brand' && 'bg-red-500/20 text-red-200 border-red-400/30',
                    config.tone === 'success' && 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
                    config.tone === 'warning' && 'bg-amber-500/20 text-amber-200 border-amber-400/30',
                    config.tone === 'error' && 'bg-red-500/20 text-red-200 border-red-400/30',
                    config.tone === 'violet' && 'bg-violet-500/20 text-violet-200 border-violet-400/30',
                    config.tone === 'info' && 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30',
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {t(config.key, b === 'new' ? (locale === 'ar' ? 'جديد' : locale === 'de' ? 'Neu' : 'New') : b)}
                </span>
              );
            })}
          </div>
        )}

        {/* Discount badge */}
        {hasDiscount && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
            -{discountPercent}%
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* Add to cart button — slides in on hover */}
        {onAddToCart && (
          <button
            type="button"
            onClick={onAddToCart}
            className={cn(
              'absolute bottom-2 right-2 h-10 w-10 rounded-full grid place-items-center text-white',
              'bg-brand-gradient shadow-glow',
              'transition-all duration-200',
              'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0',
              'active:scale-95',
              'sm:opacity-100 sm:translate-y-0', // always show on touch / mobile
            )}
            aria-label={addLabel}
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-2.5 px-1">
        <h3 className="font-semibold text-sm text-text-primary line-clamp-1">{name}</h3>
        {description && (
          <p className="text-xs text-text-muted line-clamp-2 mt-0.5 min-h-[2rem]">{description}</p>
        )}
        {(category || rating || prepMinutes) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-text-muted">
            {category && <span className="truncate">{category}</span>}
            {rating ? <span className="inline-flex items-center gap-1"><Star className="size-3 fill-brand-yellow text-brand-yellow" />{rating.toFixed(1)}</span> : null}
            {prepMinutes ? <span>{prepMinutes} {t('time.min', 'min')}</span> : null}
          </div>
        )}
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-bold text-sm text-text-primary">
            {hasDiscount ? formatEUR(discountPrice!) : formatEUR(price)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-text-muted line-through">{formatEUR(price)}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const PremiumProductCard = memo(PremiumProductCardImpl);
