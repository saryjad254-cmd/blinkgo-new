'use client';

import { type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fade in — entry animation with optional delay.
 */
export function FadeIn({ children, delay = 0, duration = 240, className, style }: FadeInProps) {
  return (
    <div
      className={cn('animate-fade-in', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface SlideUpProps extends FadeInProps {
  /** Y offset to start from (default 16px) */
  offset?: number;
}

export function SlideUp({ children, delay = 0, duration = 280, offset = 16, className, style }: SlideUpProps) {
  return (
    <div
      className={cn('animate-slide-up', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
        '--tw-translate-y': `${offset}px`,
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Staggered list — wraps children with cascading fade-in.
 */
export function StaggeredList({
  children,
  baseDelay = 0,
  step = 60,
  className,
}: {
  children: ReactNode[];
  baseDelay?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <FadeIn key={i} delay={baseDelay + i * step} duration={240}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
}

/**
 * Pulse dot — for live indicators, online status.
 */
export function PulseDot({
  color = 'success',
  size = 'md',
  className,
}: {
  color?: 'success' | 'warning' | 'danger' | 'info' | 'brand';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-3 h-3' };
  const colorClasses = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    brand: 'bg-brand-red-500',
  };
  return (
    <span className={cn('relative inline-flex', sizeClasses[size], className)}>
      <span className={cn('animate-ping-soft absolute inline-flex h-full w-full rounded-full opacity-75', colorClasses[color])} />
      <span className={cn('relative inline-flex rounded-full h-full w-full', colorClasses[color])} />
    </span>
  );
}

/**
 * Shimmer — for loading skeletons (used inside Skeleton component).
 */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}
