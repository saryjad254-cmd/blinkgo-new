import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  spacing?: 'sm' | 'md' | 'lg';
  /** Show horizontal scroll instead of grid */
  horizontal?: boolean;
}

/**
 * Premium section — consistent vertical rhythm across pages.
 *
 * - Title + optional subtitle + optional action
 * - Spacing tokens (sm: py-4, md: py-6, lg: py-8)
 * - Optional horizontal scroll for carousels
 */
export function Section({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
  spacing = 'md',
  horizontal = false,
}: SectionProps) {
  const spacingClass = {
    sm: 'py-4',
    md: 'py-6',
    lg: 'py-8',
  }[spacing];

  return (
    <section className={cn(spacingClass, className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-4 mb-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-base font-extrabold text-text leading-tight tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {horizontal ? (
        <div
          className={cn(
            'flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory',
            'px-4 pb-2 -mx-0 scrollbar-hide',
            contentClassName,
          )}
        >
          {children}
        </div>
      ) : (
        <div className={cn('px-4', contentClassName)}>{children}</div>
      )}
    </section>
  );
}
