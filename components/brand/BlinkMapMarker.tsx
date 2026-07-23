'use client';

import { type CSSProperties } from 'react';
import { Store, Home, Truck, MapPin, ShoppingBag, Pill, Package, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkMapMarker — Official BlinkGo Map Markers
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Unified marker design language:
 *    - White pill with colored circle
 *    - Soft drop shadow + brand-red active glow
 *    - Optional rotation (for driver heading)
 *    - Pulse ring for active state
 *
 *  Types:
 *    - restaurant  Brand red
 *    - market      Yellow
 *    - pharmacy    Blue
 *    - customer    Black
 *    - driver      Red with motion glow
 *    - pickup      Black with gold accent
 *    - destination Black
 */

export type MarkerType = 'restaurant' | 'market' | 'pharmacy' | 'customer' | 'driver' | 'pickup' | 'destination';

interface BlinkMapMarkerProps {
  type: MarkerType;
  rotation?: number;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  ariaLabel?: string;
}

const config: Record<MarkerType, { Icon: any; bg: string; ring: string; text: string; label: string }> = {
  restaurant: {
    Icon: Store,
    bg: 'bg-brand-red',
    ring: 'ring-brand-red/30',
    text: 'text-white',
    label: 'Restaurant',
  },
  market: {
    Icon: ShoppingBag,
    bg: 'bg-brand-yellow',
    ring: 'ring-brand-yellow/40',
    text: 'text-brand-black',
    label: 'Market',
  },
  pharmacy: {
    Icon: Pill,
    bg: 'bg-blue-500',
    ring: 'ring-blue-500/30',
    text: 'text-white',
    label: 'Pharmacy',
  },
  customer: {
    Icon: Home,
    bg: 'bg-brand-black',
    ring: 'ring-brand-black/30',
    text: 'text-white',
    label: 'You',
  },
  driver: {
    Icon: Truck,
    bg: 'bg-brand-red',
    ring: 'ring-brand-red/40',
    text: 'text-white',
    label: 'Driver',
  },
  pickup: {
    Icon: Package,
    bg: 'bg-brand-black',
    ring: 'ring-brand-yellow/40',
    text: 'text-brand-yellow',
    label: 'Pickup',
  },
  destination: {
    Icon: MapPin,
    bg: 'bg-brand-black',
    ring: 'ring-brand-black/30',
    text: 'text-white',
    label: 'Destination',
  },
};

const sizes = {
  sm: { wrap: 'w-8 h-8',  icon: 'w-4 h-4' },
  md: { wrap: 'w-10 h-10', icon: 'w-5 h-5' },
  lg: { wrap: 'w-12 h-12', icon: 'w-6 h-6' },
};

export function BlinkMapMarker({
  type,
  rotation,
  isActive = false,
  size = 'md',
  className,
  label,
  ariaLabel,
}: BlinkMapMarkerProps) {
  const c = config[type];
  const s = sizes[size];
  const Icon = c.Icon;
  const style: CSSProperties = rotation !== undefined ? { transform: `rotate(${rotation}deg)` } : {};

  return (
    <div
      className={cn('relative inline-flex flex-col items-center gap-1', className)}
      role="img"
      aria-label={ariaLabel || c.label}
    >
      {/* Pulse ring for active state */}
      {isActive && (
        <>
          <span
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full',
              c.bg,
              'opacity-30 animate-ping',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full',
              c.bg,
              'opacity-20 animate-pulse',
            )}
            aria-hidden
          />
        </>
      )}

      {/* Marker pin — inverted teardrop shape */}
      <div
        style={style}
        className={cn(
          'relative',
          s.wrap,
          'rounded-full flex items-center justify-center',
          c.bg,
          c.text,
          'shadow-lg ring-4 ring-bg',
          'border-2 border-white',
          c.ring,
          isActive && 'scale-110 shadow-xl',
          'transition-transform duration-200',
        )}
      >
        <Icon className={cn(s.icon, 'flex-shrink-0')} strokeWidth={2.5} aria-hidden />
      </div>

      {/* Label below marker */}
      {label && (
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-primary bg-bg/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {label}
        </span>
      )}
    </div>
  );
}
