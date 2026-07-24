'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BlinkLogo } from './BlinkLogo';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkHeader — Official BlinkGo Page Header
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - default  Subtle bg + border
 *    - solid    Filled bg (brand color or surface)
 *    - glass    Frosted backdrop blur
 *    - brand    Yellow-to-red hero gradient
 *    - dark     Black with white text
 *
 *  Layout: [back] [title (+ subtitle)] [actions]
 *  All sticky by default. Safe-area aware for iOS.
 */

type Variant = 'default' | 'solid' | 'glass' | 'brand' | 'dark' | 'transparent';

interface BlinkHeaderProps extends HTMLAttributes<HTMLElement> {
  title: string;
  subtitle?: string;
  back?: boolean;
  backHref?: string;
  backAction?: () => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  variant?: Variant;
  sticky?: boolean;
  logo?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<Variant, string> = {
  default:
    'bg-bg/85 backdrop-blur-xl border-b border-edge text-text-primary',
  solid:
    'bg-surface border-b border-edge text-text-primary',
  glass:
    'bg-white/5 backdrop-blur-2xl border-b border-white/10 text-text-primary',
  brand:
    'bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active border-b border-brand-yellow-active text-brand-black shadow-md',
  dark:
    'bg-brand-black border-b border-brand-black/40 text-white',
  transparent:
    'bg-transparent text-text-primary',
};

const sizeStyles = {
  sm: 'min-h-[48px] py-2.5',
  md: 'min-h-[60px] py-3',
  lg: 'min-h-[72px] py-4',
};

export function BlinkHeader({
  title,
  subtitle,
  back = false,
  backHref,
  backAction,
  leftSlot,
  rightSlot,
  variant = 'default',
  sticky = true,
  logo = false,
  size = 'md',
  className,
  children,
  ...rest
}: BlinkHeaderProps) {
  const isBrand = variant === 'brand';
  const isDark = variant === 'dark';

  return (
    <header
      className={cn(
        'z-sticky w-full',
        variantStyles[variant],
        sticky && 'sticky top-0',
        sizeStyles[size],
        // iOS safe area
        'pt-[env(safe-area-inset-top,0px)]',
        className,
      )}
      {...rest}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3 h-full">
        {/* Left: back / logo / custom */}
        {back && (
          backHref ? (
            <Link
              href={backHref}
              className={cn(
                'w-10 h-10 -ms-2 rounded-full flex items-center justify-center',
                'hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-transform',
                isBrand && 'hover:bg-brand-black/10',
                isDark && 'hover:bg-white/10',
              )}
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={backAction}
              className={cn(
                'w-10 h-10 -ms-2 rounded-full flex items-center justify-center',
                'hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-transform',
                isBrand && 'hover:bg-brand-black/10',
                isDark && 'hover:bg-white/10',
              )}
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
          )
        )}
        {logo && <BlinkLogo size="sm" variant="mark" />}
        {leftSlot}

        {/* Center: title + subtitle */}
        <div className="flex-1 min-w-0">
          <h1
            className={cn(
              'font-extrabold leading-tight truncate',
              size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base sm:text-lg',
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-text-secondary truncate mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Right: actions */}
        {rightSlot && <div className="flex items-center gap-2 -me-2">{rightSlot}</div>}
        {children}
      </div>
    </header>
  );
}

/** Simple section header with title + optional action */
interface BlinkSectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function BlinkSectionHeader({ title, subtitle, action, className }: BlinkSectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3 mb-4', className)}>
      <div>
        <h2 className="text-lg sm:text-xl font-extrabold text-text-primary leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
