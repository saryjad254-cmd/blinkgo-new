'use client';

import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkStat — Official BlinkGo Stat / KPI Card
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Used across dashboards (admin, driver, restaurant, customer)
 *  for displaying KPIs like:
 *    - Today's revenue
 *    - Active drivers
 *    - Order count
 *    - Average delivery time
 *
 *  Variants:
 *    - default  Light background
 *    - brand    Red accent
 *    - dark     Premium dark
 *    - glass    Frosted glass
 */

interface BlinkStatProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  change?: number; // percent
  changeLabel?: string;
  variant?: 'default' | 'brand' | 'dark' | 'glass' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  suffix?: string;
  prefix?: string;
  loading?: boolean;
  className?: string;
}

const variantStyles = {
  default:
    'bg-surface border border-edge shadow-sm',
  brand:
    'bg-gradient-to-br from-brand-red to-brand-red-hover text-white border border-brand-red-hover shadow-brand-red',
  dark:
    'bg-brand-black text-white border border-brand-black/40 shadow-brand-black',
  glass:
    'bg-white/5 backdrop-blur-2xl border border-white/10 text-white',
  success:
    'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  warning:
    'bg-brand-yellow-500/10 border border-brand-yellow-500/20 text-brand-yellow-700 dark:text-brand-yellow-300',
};

const sizeStyles = {
  sm: { wrap: 'p-3',  label: 'text-xs', value: 'text-xl' },
  md: { wrap: 'p-4 sm:p-5', label: 'text-xs', value: 'text-2xl sm:text-3xl' },
  lg: { wrap: 'p-5 sm:p-6', label: 'text-sm',  value: 'text-3xl sm:text-4xl' },
};

export function BlinkStat({
  label,
  value,
  icon,
  change,
  changeLabel,
  variant = 'default',
  size = 'md',
  suffix,
  prefix,
  loading = false,
  className,
}: BlinkStatProps) {
  const s = sizeStyles[size];
  const isBrand = variant === 'brand' || variant === 'dark' || variant === 'glass';
  const changeIsPositive = change !== undefined && change >= 0;

  return (
    <div
      className={cn(
        'rounded-2xl flex flex-col gap-2 transition-all duration-200',
        variantStyles[variant],
        s.wrap,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'font-bold uppercase tracking-wider truncate',
            s.label,
            isBrand ? 'text-white/80' : 'text-text-secondary',
            variant === 'success' || variant === 'warning' ? '' : '',
          )}
        >
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              isBrand ? 'bg-white/15' : 'bg-surface-light',
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-9 w-3/4 rounded-lg bg-surface-light animate-pulse" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          {prefix && (
            <span className={cn('font-extrabold text-text-secondary', s.value)}>
              {prefix}
            </span>
          )}
          <span
            className={cn(
              'font-black tracking-tight',
              s.value,
              isBrand ? 'text-white' : 'text-text-primary',
            )}
          >
            {value}
          </span>
          {suffix && (
            <span className={cn('font-bold text-text-secondary', size === 'sm' ? 'text-xs' : 'text-sm')}>
              {suffix}
            </span>
          )}
        </div>
      )}

      {change !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-bold',
            changeIsPositive ? 'text-emerald-500' : 'text-brand-red',
            isBrand && changeIsPositive && 'text-emerald-300',
            isBrand && !changeIsPositive && 'text-white',
          )}
        >
          {changeIsPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          <span>
            {changeIsPositive ? '+' : ''}
            {change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className={cn(isBrand ? 'text-white/70' : 'text-text-muted', 'font-medium ms-1')}>
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
