/**
 * Skeleton Components
 * ───────────────────
 * Modern skeleton loaders that match actual content dimensions.
 * Use during initial load and content refresh.
 *
 * Each skeleton:
 *  - Matches the real component's exact shape (no layout shift)
 *  - Has subtle pulse animation
 *  - Supports reduced motion
 *  - Accessible (aria-busy)
 */

'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Width (Tailwind class or custom) */
  width?: string;
  /** Height (Tailwind class or custom) */
  height?: string;
  /** Round variant */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** No animation (for static placeholder) */
  noAnimate?: boolean;
}

const roundedMap = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

/**
 * Base skeleton — single block with pulse animation.
 */
export function Skeleton({
  className,
  style,
  width,
  height,
  rounded = 'md',
  noAnimate = false,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-bg-secondary',
        roundedMap[rounded],
        !noAnimate && 'animate-pulse',
        'motion-reduce:animate-none',
        className
      )}
      style={{
        width: width,
        height: height,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Text skeleton — animates a line of text.
 */
export function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = '60%',
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div
      className={cn('space-y-2', className)}
      aria-hidden="true"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.75rem"
          rounded="sm"
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * Avatar skeleton — circular placeholder.
 */
export function SkeletonAvatar({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      width={`${size}px`}
      height={`${size}px`}
      rounded="full"
      className={className}
    />
  );
}

/**
 * Card skeleton — matches a typical card layout.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'p-4 bg-bg-elevated rounded-2xl space-y-3',
        className
      )}
      aria-busy="true"
      aria-label="Loading content"
    >
      <Skeleton height="8rem" rounded="xl" />
      <div className="space-y-2">
        <Skeleton height="1rem" width="80%" />
        <Skeleton height="0.75rem" width="60%" />
      </div>
      <div className="flex justify-between">
        <Skeleton height="0.75rem" width="40%" />
        <Skeleton height="0.75rem" width="30%" />
      </div>
    </div>
  );
}

/**
 * Restaurant card skeleton — matches OptimizedRestaurantCard shape.
 */
export function SkeletonRestaurantCard({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div
        className="flex gap-3 p-3 bg-bg-elevated rounded-2xl min-h-[88px]"
        aria-busy="true"
        aria-label="Loading restaurant"
      >
        <Skeleton width="5rem" height="5rem" rounded="xl" className="flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton height="1rem" width="70%" />
          <Skeleton height="0.75rem" width="50%" />
          <div className="flex gap-3">
            <Skeleton height="0.75rem" width="3rem" />
            <Skeleton height="0.75rem" width="3rem" />
            <Skeleton height="0.75rem" width="3rem" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-bg-elevated rounded-2xl overflow-hidden min-h-[220px]"
      aria-busy="true"
      aria-label="Loading restaurant"
    >
      <Skeleton height="10rem" rounded="none" />
      <div className="p-3 space-y-2">
        <Skeleton height="1.125rem" width="75%" />
        <Skeleton height="0.875rem" width="50%" />
        <div className="flex gap-2 pt-1">
          <Skeleton height="0.75rem" width="3rem" />
          <Skeleton height="0.75rem" width="3rem" />
          <Skeleton height="0.75rem" width="3rem" />
        </div>
      </div>
    </div>
  );
}

/**
 * List of restaurant card skeletons.
 */
export function SkeletonRestaurantList({
  count = 6,
  view = 'grid',
}: {
  count?: number;
  view?: 'grid' | 'list';
}) {
  return (
    <div
      className={cn(
        view === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
          : 'space-y-3',
      )}
      aria-busy="true"
      aria-label={`Loading ${count} restaurants`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRestaurantCard key={i} view={view} />
      ))}
    </div>
  );
}

/**
 * Order row skeleton.
 */
export function SkeletonOrderRow() {
  return (
    <div
      className="flex gap-3 p-3 bg-bg-elevated rounded-2xl"
      aria-busy="true"
      aria-label="Loading order"
    >
      <Skeleton width="3.5rem" height="3.5rem" rounded="xl" className="flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton height="1rem" width="60%" />
        <Skeleton height="0.75rem" width="40%" />
        <div className="flex gap-2">
          <Skeleton height="0.625rem" width="4rem" rounded="full" />
          <Skeleton height="0.625rem" width="3rem" rounded="full" />
        </div>
      </div>
      <Skeleton width="3rem" height="1rem" />
    </div>
  );
}

/**
 * Skeleton wrapper for any page — applies the busy state.
 */
export function SkeletonPage({
  children,
  message,
}: {
  children: ReactNode;
  message?: string;
}) {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center p-8"
      aria-busy="true"
      aria-live="polite"
    >
      {message && (
        <p className="text-text-secondary text-sm mb-6">{message}</p>
      )}
      {children}
    </div>
  );
}

