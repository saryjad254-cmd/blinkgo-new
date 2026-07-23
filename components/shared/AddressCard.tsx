'use client';

/**
 * Unified AddressCard — single source of truth for address display
 * Used in: customer order details, restaurant order details, driver order screen,
 *          admin order details, order history, tracking page.
 *
 * Variants:
 *   - restaurant (orange/yellow tones)
 *   - customer (blue/teal tones) — same visual style as restaurant for consistency
 *   - driver (green tones)
 *   - admin (purple tones)
 *
 * Same icon (MapPin), same layout, same height. Only color and label differ.
 */
import { MapPin, Phone, Navigation } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AddressVariant = 'restaurant' | 'customer' | 'driver' | 'admin';
export type AddressTheme = 'dark' | 'light';

export interface AddressCardProps {
  /** Display address (street, number, city) */
  address?: string | null;
  /** Latitude for map link */
  lat?: number | null;
  /** Longitude for map link */
  lng?: number | null;
  /** Phone number (clickable tel:) */
  phone?: string | null;
  /** Variant determines color theme and label */
  variant: AddressVariant;
  /** Theme: dark (default) or light */
  theme?: AddressTheme;
  /** Label override (default uses variant) */
  label?: string;
  /** Compact mode for use in cards/lists */
  compact?: boolean;
  /** Show navigation button (opens Google Maps directions) */
  showNavigation?: boolean;
  /** Source coordinates to compute directions FROM (for navigation) */
  directionsFrom?: { lat: number; lng: number } | null;
  /** Extra content below the address (e.g. notes, floor, door) */
  children?: React.ReactNode;
  /** className for outer wrapper */
  className?: string;
}

interface VariantConfig {
  label: string;
  bgDark: string;
  bgLight: string;
  borderDark: string;
  borderLight: string;
  textDark: string;
  textLight: string;
  accentDark: string;
  accentLight: string;
  iconBgDark: string;
  iconBgLight: string;
}

const variantConfig: Record<AddressVariant, VariantConfig> = {
  restaurant: {
    label: 'Pickup from',
    bgDark: 'bg-brand-red-500/10',
    bgLight: 'bg-brand-yellow-100',
    borderDark: 'border-brand-red-500/30',
    borderLight: 'border-brand-yellow-200',
    textDark: 'text-brand-yellow-300',
    textLight: 'text-brand-red-600',
    accentDark: 'text-brand-red-500',
    accentLight: 'text-brand-red-600',
    iconBgDark: 'bg-brand-red-500/10',
    iconBgLight: 'bg-brand-yellow-200/50',
  },
  customer: {
    label: 'Delivery to',
    bgDark: 'bg-blue-500/10',
    bgLight: 'bg-info/15',
    borderDark: 'border-blue-500/30',
    borderLight: 'border-info/30',
    textDark: 'text-blue-300',
    textLight: 'text-blue-600',
    accentDark: 'text-blue-500',
    accentLight: 'text-blue-600',
    iconBgDark: 'bg-blue-500/10',
    iconBgLight: 'bg-blue-200/50',
  },
  driver: {
    label: 'Drop-off',
    bgDark: 'bg-emerald-500/10',
    bgLight: 'bg-success/15',
    borderDark: 'border-emerald-500/30',
    borderLight: 'border-success/30',
    textDark: 'text-emerald-300',
    textLight: 'text-success',
    accentDark: 'text-emerald-500',
    accentLight: 'text-success',
    iconBgDark: 'bg-emerald-500/10',
    iconBgLight: 'bg-emerald-200/50',
  },
  admin: {
    label: 'Address',
    bgDark: 'bg-purple-500/10',
    bgLight: 'bg-purple-500/15',
    borderDark: 'border-purple-500/30',
    borderLight: 'border-purple-200',
    textDark: 'text-purple-300',
    textLight: 'text-purple-600',
    accentDark: 'text-purple-500',
    accentLight: 'text-purple-600',
    iconBgDark: 'bg-purple-500/10',
    iconBgLight: 'bg-purple-200/50',
  },
};

function buildMapsUrl(lat?: number | null, lng?: number | null, from?: { lat: number; lng: number } | null): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (from) {
    return `https://www.google.com/maps/dir/${from.lat},${from.lng}/${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function AddressCard({
  address,
  lat,
  lng,
  phone,
  variant,
  theme = 'dark',
  label,
  compact = false,
  showNavigation = true,
  directionsFrom,
  children,
  className,
}: AddressCardProps) {
  const cfg = variantConfig[variant];
  const isLight = theme === 'light';
  const bg = isLight ? cfg.bgLight : cfg.bgDark;
  const border = isLight ? cfg.borderLight : cfg.borderDark;
  const text = isLight ? cfg.textLight : cfg.textDark;
  const accent = isLight ? cfg.accentLight : cfg.accentDark;
  const iconBg = isLight ? cfg.iconBgLight : cfg.iconBgDark;
  const displayLabel = label ?? cfg.label;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const mapsUrl = hasCoords ? buildMapsUrl(lat, lng, directionsFrom) : null;
  const phoneColors = isLight
    ? 'bg-white border-brand-yellow-200 text-brand-red-700 hover:bg-brand-yellow-50'
    : `${bg} ${border} ${text} hover:opacity-80`;
  const navColors = isLight
    ? 'bg-white border-brand-yellow-200 text-brand-red-700 hover:bg-brand-yellow-50'
    : `${bg} ${border} ${text} hover:opacity-80`;

  if (compact) {
    return (
      <div className={cn('flex items-start gap-2 p-2.5 rounded-md', bg, 'border', border, className)}>
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
          <MapPin className={cn('w-3.5 h-3.5', accent)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[10px] font-bold uppercase tracking-wider truncate', text)}>
            {displayLabel}
          </p>
          <p className={cn('text-xs truncate', isLight ? 'text-gray-900' : 'text-white')}>{address || '—'}</p>
          {children}
        </div>
        {showNavigation && mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors', bg, 'hover:opacity-80')}
            aria-label="Open in Maps"
          >
            <Navigation className={cn('w-3.5 h-3.5', accent)} />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl p-4 border', bg, border, className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', iconBg)}>
          <MapPin className={cn('w-3.5 h-3.5', accent)} />
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', text)}>
          {displayLabel}
        </span>
      </div>
      <p className={cn('text-sm font-medium mb-2 break-words', isLight ? 'text-gray-900' : 'text-white')}>{address || '—'}</p>

      <div className="flex items-center gap-2 flex-wrap">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
              phoneColors,
            )}
          >
            <Phone className="w-3 h-3" />
            <span dir="ltr">{phone}</span>
          </a>
        ) : null}
        {showNavigation && mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
              navColors,
            )}
          >
            <Navigation className="w-3 h-3" />
            Maps
          </a>
        ) : null}
      </div>
      {children}
    </div>
  );
}
