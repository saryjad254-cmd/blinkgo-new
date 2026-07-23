import { forwardRef, type ReactNode, type ComponentType, type SVGProps } from 'react';
import { cn } from '@/lib/cn';

type LucideProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

type LucideIcon = ComponentType<LucideProps>;

interface LucideIconProps {
  icon: LucideIcon;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  /** Stroke width — defaults to 2 for consistent world-class feel */
  strokeWidth?: number;
  /** Color override (e.g. 'currentColor' uses text color) */
  className?: string;
  /** Optional aria label for accessibility */
  ariaLabel?: string;
}

const SIZE_MAP: Record<string, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-7 h-7',
  '2xl': 'w-9 h-9',
};

/**
 * LucideIcon — Standardized wrapper for ALL icons in the application.
 *
 * Ensures every icon has:
 * - Consistent sizing (xs/sm/md/lg/xl/2xl or custom number)
 * - Consistent stroke width (2.0 by default for world-class feel)
 * - flex-shrink-0 to prevent layout breaks
 * - aria-hidden by default (decorative) or aria-label for accessibility
 *
 * Usage: <LucideIcon icon={MapPin} size="md" />
 *        <LucideIcon icon={MapPin} size={20} strokeWidth={1.75} />
 */
export const LucideIcon = forwardRef<SVGSVGElement, LucideIconProps>(function LucideIcon(
  { icon: IconComponent, size = 'md', strokeWidth = 2, className = '', ariaLabel },
  ref,
) {
  if (!IconComponent) return null;
  const sizeClass = typeof size === 'number' ? '' : SIZE_MAP[size] || SIZE_MAP.md;
  const sizeProp = typeof size === 'number' ? size : undefined;
  return (
    <IconComponent
      ref={ref}
      className={cn('flex-shrink-0', sizeClass, className)}
      strokeWidth={strokeWidth}
      size={sizeProp}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
});

/** Compact: returns the SVG element directly (no wrapper span) */
export function RawLucideIcon({
  icon: IconComponent,
  size = 'md',
  strokeWidth = 2,
  className = '',
  ariaLabel,
}: LucideIconProps): ReactNode {
  if (!IconComponent) return null;
  const sizeClass = typeof size === 'number' ? '' : SIZE_MAP[size] || SIZE_MAP.md;
  const sizeProp = typeof size === 'number' ? size : undefined;
  return (
    <IconComponent
      className={cn('flex-shrink-0', sizeClass, className)}
      strokeWidth={strokeWidth}
      size={sizeProp}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    />
  );
}
