'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  success?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

/**
 * Premium Input — text input with label, hint, error, and icon support.
 *
 * Design:
 * - Floating focus ring (brand-colored)
 * - Icon-aware padding (auto-adjusts based on icon presence)
 * - Inline error/hint area
 * - Dark-theme native styling
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    success,
    icon,
    iconRight,
    size = 'md',
    fullWidth = true,
    className = '',
    id: providedId,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const id = providedId || autoId;
  const hasError = !!error;

  const sizeClasses = {
    sm: 'h-9 text-sm',
    md: 'h-11 text-sm',
    lg: 'h-13 text-base',
  } as const;

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth ? 'w-full' : '')}>
      {label && (
        <label htmlFor={id} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none transition-colors group-focus-within:text-brand">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
          className={cn(
            'w-full bg-bg-elevated border rounded-xl text-text placeholder:text-text-muted caret-brand',
            'transition-all duration-200 ease-silk',
            'focus:outline-none focus:bg-bg-subtle',
            '[&:-webkit-autofill]:bg-bg-elevated [&:-webkit-autofill]:[-webkit-text-fill-color:#FFFFFF]',
            icon ? 'ps-10' : 'ps-4',
            iconRight ? 'pe-10' : 'pe-4',
            sizeClasses[size],
            hasError
              ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
              : success
              ? 'border-success focus:border-success focus:shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
              : 'border-edge focus:border-brand focus:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]',
            className,
          )}
          aria-invalid={hasError || undefined}
          aria-describedby={hint || error ? `${id}-msg` : undefined}
          {...rest}
        />
        {iconRight && (
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {iconRight}
          </span>
        )}
      </div>
      {(hint || error) && (
        <p
          id={`${id}-msg`}
          className={cn(
            'text-xs leading-snug',
            hasError ? 'text-danger' : 'text-text-muted',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});
