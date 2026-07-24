'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { LucideIcon, RawLucideIcon } from './LucideIcon';

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface IconProps {
  /** Lucide icon component */
  icon: any;
  size?: IconSize;
  /** Stroke width (2.0 default for world-class feel) */
  strokeWidth?: number;
  className?: string;
  color?: string;
  ariaLabel?: string;
}

const sizeClasses: Record<IconSize, string> = {
  xs:   'w-3 h-3',
  sm:   'w-4 h-4',
  md:   'w-5 h-5',
  lg:   'w-6 h-6',
  xl:   'w-7 h-7',
  '2xl':'w-9 h-9',
};

/**
 * Premium Icon — wrapper around Lucide icons enforcing consistent sizing
 * and stroke width across the entire application.
 *
 * Usage: <Icon icon={MapPin} size="md" />
 *        <Icon icon={Truck} size="lg" strokeWidth={2.5} />
 */
export const Icon = forwardRef<HTMLSpanElement, IconProps>(function Icon(
  { icon: IconComponent, size = 'md', strokeWidth = 2, className = '', color, ariaLabel },
  ref,
) {
  if (!IconComponent) return null;
  return (
    <span
      ref={ref}
      className={cn('inline-flex items-center justify-center flex-shrink-0', className)}
    >
      <LucideIcon
        icon={IconComponent}
        size={size}
        strokeWidth={strokeWidth}
        ariaLabel={ariaLabel}
        className={color ? '' : ''}
      />
    </span>
  );
});

/** Convenience: render an icon directly without the wrapper */
interface RawIconProps {
  icon: any;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
}

export function RawIcon({
  icon: IconComponent,
  size = 'md',
  strokeWidth = 2,
  className = '',
  ariaLabel,
}: RawIconProps): ReactNode {
  if (!IconComponent) return null;
  return (
    <RawLucideIcon
      icon={IconComponent}
      size={size}
      strokeWidth={strokeWidth}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}

/**
 * IconBadge — circular icon container for stats and feature highlights.
 */
interface IconBadgeProps {
  icon: any;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'brand' | 'accent' | 'success' | 'warning' | 'info' | 'neutral';
  className?: string;
  /** Pulse animation */
  pulse?: boolean;
}

const badgeSizeClasses: Record<string, { wrapper: string; icon: IconSize }> = {
  sm: { wrapper: 'w-8 h-8',  icon: 'sm' },
  md: { wrapper: 'w-10 h-10', icon: 'md' },
  lg: { wrapper: 'w-12 h-12', icon: 'lg' },
  xl: { wrapper: 'w-14 h-14', icon: 'lg' },
};

const variantClasses = {
  brand:   'bg-brand-red-500/10 text-brand border border-brand-red-500/20',
  accent:  'bg-brand-yellow-500/10 text-brand-yellow-500 border border-brand-yellow-500/20',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  info:    'bg-info/10 text-info border border-info/20',
  neutral: 'bg-bg-elevated text-text-secondary border border-edge',
};

export function IconBadge({ icon, size = 'md', variant = 'brand', className = '', pulse = false }: IconBadgeProps) {
  const s = badgeSizeClasses[size];
  return (
    <div className={cn('relative rounded-xl flex items-center justify-center flex-shrink-0', s.wrapper, variantClasses[variant], className)}>
      <Icon icon={icon} size={s.icon} strokeWidth={2} />
      {pulse && (
        <span className="absolute -top-1 -end-1 w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
      )}
    </div>
  );
}

/**
 * FeatureCard — premium icon + title + description card.
 */
interface FeatureCardProps {
  icon: any;
  title: string;
  description?: string;
  variant?: 'brand' | 'accent' | 'success' | 'warning' | 'info' | 'neutral';
  className?: string;
}

export function FeatureCard({ icon, title, description, variant = 'brand', className = '' }: FeatureCardProps) {
  return (
    <div className={cn('card-glass p-4 flex items-start gap-3', className)}>
      <IconBadge icon={icon} variant={variant} size="md" />
      <div className="min-w-0 flex-1">
        <h4 className="font-extrabold text-text text-sm leading-tight">{title}</h4>
        {description && (
          <p className="text-xs text-text-secondary mt-1 leading-snug">{description}</p>
        )}
      </div>
    </div>
  );
}
