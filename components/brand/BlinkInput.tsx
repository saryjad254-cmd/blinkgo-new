'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkInput — Official BlinkGo Input System
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - default     Standard input
 *    - filled      Filled background
 *    - outlined    Bold border
 *    - underlined  Only bottom border
 *
 *  Sizes:
 *    sm · md · lg
 *
 *  Features:
 *    - Label support
 *    - Hint text
 *    - Error state with red treatment
 *    - Left/right icon slots
 *    - Brand-red focus ring
 *    - Disabled state
 *    - Full-width option
 *    - WCAG AA contrast in both themes
 */

type Variant = 'default' | 'filled' | 'outlined' | 'underlined';
type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: Size;
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
}

type BlinkInputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;
type BlinkTextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

const sizeStyles: Record<Size, string> = {
  sm: 'h-9  px-3   text-sm',
  md: 'h-11 px-4   text-base',
  lg: 'h-13 px-5   text-md',
};

const variantStyles: Record<Variant, string> = {
  default:
    'bg-surface border border-edge ' +
    'focus:border-brand-red focus:ring-4 focus:ring-brand-red/15 ' +
    'hover:border-edge-strong',
  filled:
    'bg-surface-light border border-transparent ' +
    'focus:bg-surface focus:border-brand-red focus:ring-4 focus:ring-brand-red/15',
  outlined:
    'bg-transparent border-2 border-edge-strong ' +
    'focus:border-brand-red focus:ring-4 focus:ring-brand-red/15',
  underlined:
    'bg-transparent border-0 border-b-2 border-edge ' +
    'rounded-none focus:border-brand-red focus:ring-0',
};

const baseInputClasses = cn(
  'w-full rounded-xl text-text-primary placeholder:text-text-muted',
  'outline-none transition-all duration-150 ease-silk',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'read-only:bg-surface-light',
);

export const BlinkInput = forwardRef<HTMLInputElement, BlinkInputProps>(function BlinkInput(
  {
    label,
    hint,
    error,
    required,
    leftIcon,
    rightIcon,
    size = 'md',
    variant = 'default',
    fullWidth = true,
    className,
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const inputId = id || `blink-input-${Math.random().toString(36).slice(2, 9)}`;
  const hasError = !!error;

  return (
    <div className={cn(fullWidth && 'w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-text-primary mb-1.5"
        >
          {label}
          {required && <span className="text-brand-red ms-1" aria-hidden>*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span
            className="absolute start-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none flex items-center"
            aria-hidden
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hint || error ? `${inputId}-msg` : undefined}
          className={cn(
            baseInputClasses,
            sizeStyles[size as Size],
            variantStyles[hasError ? 'default' : variant] as string,
            hasError && 'border-brand-red ring-4 ring-brand-red/10 focus:border-brand-red',
            leftIcon && 'ps-11',
            rightIcon && 'pe-11',
          )}
          {...rest}
        />
        {rightIcon && (
          <span
            className="absolute end-3.5 top-1/2 -translate-y-1/2 text-text-muted flex items-center"
            aria-hidden
          >
            {rightIcon}
          </span>
        )}
      </div>
      {(hint || error) && (
        <p
          id={`${inputId}-msg`}
          className={cn(
            'mt-1.5 text-xs',
            hasError ? 'text-brand-red font-medium' : 'text-text-muted',
          )}
          role={hasError ? 'alert' : undefined}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export const BlinkTextarea = forwardRef<HTMLTextAreaElement, BlinkTextareaProps>(function BlinkTextarea(
  {
    label,
    hint,
    error,
    required,
    size = 'md',
    variant = 'default',
    fullWidth = true,
    className,
    id,
    disabled,
    rows = 4,
    ...rest
  },
  ref,
) {
  const inputId = id || `blink-textarea-${Math.random().toString(36).slice(2, 9)}`;
  const hasError = !!error;

  return (
    <div className={cn(fullWidth && 'w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-text-primary mb-1.5"
        >
          {label}
          {required && <span className="text-brand-red ms-1" aria-hidden>*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={hint || error ? `${inputId}-msg` : undefined}
        className={cn(
          baseInputClasses,
          'py-3',
          size === 'sm' ? 'px-3 text-sm' : size === 'lg' ? 'px-5 text-md' : 'px-4 text-base',
          variantStyles[hasError ? 'default' : variant] as string,
          hasError && 'border-brand-red ring-4 ring-brand-red/10',
        )}
        {...rest}
      />
      {(hint || error) && (
        <p
          id={`${inputId}-msg`}
          className={cn(
            'mt-1.5 text-xs',
            hasError ? 'text-brand-red font-medium' : 'text-text-muted',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});
