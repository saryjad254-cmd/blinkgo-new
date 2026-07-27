'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkBadge — Official BlinkGo Badge / Status Indicator
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - red       Brand red — important, urgent
 *    - yellow    Brand yellow — accent, attention
 *    - black     Brand black — primary emphasis
 *    - success   Green — positive
 *    - warning   Amber — caution
 *    - info      Blue — informational
 *    - neutral   Gray — low-emphasis
 *    - outline   Border-only
 *
 *  Sizes: sm · md · lg
 *
 *  Use cases:
 *    - Order status (preparing, on the way, delivered)
 *    - Loyalty tier (Bronze, Silver, Gold, Platinum)
 *    - Live indicator (driver online, restaurant open)
 *    - Counts (cart items, unread notifications)
 *    - Tags & labels
 */

type Variant =
  | 'red'
  | 'yellow'
  | 'black'
  | 'success'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'outline';

type Size = 'sm' | 'md' | 'lg';

interface BlinkBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: Size;
  dot?: boolean;
  icon?: ReactNode;
  rounded?: 'sm' | 'md' | 'full';
}

const variantStyles: Record<Variant, string> = {
  red: 'bg-brand-red/15 text-brand-red border-brand-red/20',
  yellow: 'bg-brand-yellow/20 text-brand-yellow-hover border-brand-yellow/30',
  black: 'bg-brand-black/85 text-white border-brand-black/20',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  warning: 'bg-brand-yellow-500/15 text-brand-yellow-700 dark:text-brand-yellow-400 border-brand-yellow-500/25',
  info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
  neutral: 'bg-surface-light text-text-secondary border-edge',
  outline: 'bg-transparent text-text-primary border-edge-strong',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-5  px-2   text-[10px] gap-1',
  md: 'h-6  px-2.5 text-xs     gap-1.5',
  lg: 'h-7  px-3   text-sm     gap-1.5',
};

const radiusStyles = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  full: 'rounded-full',
};

const dotColors: Record<Variant, string> = {
  red: 'bg-brand-red',
  yellow: 'bg-brand-yellow',
  black: 'bg-brand-black',
  success: 'bg-emerald-500',
  warning: 'bg-brand-yellow-500',
  info: 'bg-blue-500',
  neutral: 'bg-gray-500',
  outline: 'bg-text-secondary',
};

export function BlinkBadge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  rounded = 'full',
  className,
  children,
  ...rest
}: BlinkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-bold uppercase tracking-wider border whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        radiusStyles[rounded],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant], 'animate-pulse')}
          aria-hidden
        />
      )}
      {icon && <span className="flex-shrink-0" aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

/** Pre-built semantic badges */
export function BlinkStatusBadge({ status, ...rest }: { status: string } & Omit<BlinkBadgeProps, 'children' | 'variant'>) {
  const statusMap: Record<string, { variant: Variant; label: string }> = {
    pending:    { variant: 'warning',  label: 'Pending' },
    preparing:  { variant: 'yellow',   label: 'Preparing' },
    ready:      { variant: 'info',     label: 'Ready' },
    'on-the-way': { variant: 'red',    label: 'On the way' },
    delivered:  { variant: 'success',  label: 'Delivered' },
    cancelled:  { variant: 'neutral',  label: 'Cancelled' },
    online:     { variant: 'success',  label: 'Online' },
    offline:    { variant: 'neutral',  label: 'Offline' },
    active:     { variant: 'success',  label: 'Active' },
    inactive:   { variant: 'neutral',  label: 'Inactive' },
    vip:        { variant: 'yellow',   label: 'VIP' },
    new:        { variant: 'red',      label: 'New' },
  };

  const config = statusMap[status] || { variant: 'neutral' as Variant, label: status };

  return (
    <BlinkBadge variant={config.variant} dot size="sm" {...rest}>
      {config.label}
    </BlinkBadge>
  );
}
