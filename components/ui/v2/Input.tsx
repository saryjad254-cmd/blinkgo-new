'use client';

/**
 * Premium Input — single source of truth for text inputs.
 *
 * Features:
 *   - Floating label (Material Design style)
 *   - Validation states (error, success)
 *   - Helper text + error message
 *   - Left/right icons
 *   - Size variants: sm, md (default), lg
 *   - Disabled + readonly states
 *   - ARIA labels
 *   - 44px+ touch target
 */

import { type InputHTMLAttributes, type ReactNode, forwardRef, useId, useState } from 'react';
import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: Size;
  optional?: boolean;
  /** When true, label is always visible (no floating behavior) */
  staticLabel?: boolean;
}

const sizeClasses: Record<Size, { input: string; padding: string; height: string; text: string; }> = {
  sm: { input: 'h-9',  padding: 'pl-9 pr-9',  height: '36px',  text: 'text-sm' },
  md: { input: 'h-12', padding: 'pl-11 pr-11', height: '48px', text: 'text-base' },
  lg: { input: 'h-14', padding: 'pl-12 pr-12', height: '56px', text: 'text-lg' },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    error,
    success,
    leftIcon,
    rightIcon,
    size = 'md',
    optional = false,
    staticLabel = false,
    disabled,
    placeholder = ' ',
    className,
    id: providedId,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(
    Boolean(rest.value || rest.defaultValue),
  );

  const sizes = sizeClasses[size];
  const isFloating = !staticLabel;
  const showLabel = isFloating ? (focused || hasValue) : true;
  const isError = Boolean(error);
  const isSuccess = success && !isError;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative w-full rounded-2xl',
          'border bg-white/[0.04] transition-all duration-200',
          isError && 'border-red-500/60 bg-red-500/[0.04]',
          isSuccess && 'border-emerald-500/60 bg-emerald-500/[0.04]',
          !isError && !isSuccess && focused && 'border-red-500/50 bg-white/[0.06]',
          !isError && !isSuccess && !focused && 'border-white/[0.10]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {label && isFloating && (
          <label
            htmlFor={id}
            className={cn(
              'absolute left-11 pointer-events-none font-medium',
              'transition-all duration-200 ease-out origin-left',
              'text-text-secondary',
              showLabel
                ? 'top-0 -translate-y-1/2 text-[10px] uppercase tracking-wider px-1.5 bg-bg'
                : 'top-1/2 -translate-y-1/2 text-base',
              isError && 'text-red-400',
              isSuccess && 'text-emerald-400',
              !isError && !isSuccess && focused && 'text-red-400',
            )}
          >
            {label}
            {optional && !showLabel && <span className="ml-1 text-text-muted normal-case text-xs">Optional</span>}
          </label>
        )}

        {leftIcon && (
          <span
            className={cn(
              'absolute top-1/2 -translate-y-1/2 left-3.5 text-text-muted pointer-events-none',
              isError && 'text-red-400',
              isSuccess && 'text-emerald-400',
              !isError && !isSuccess && focused && 'text-red-400',
            )}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={id}
          placeholder={isFloating ? undefined : placeholder}
          disabled={disabled}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            setHasValue(Boolean(e.target.value));
            rest.onBlur?.(e);
          }}
          onChange={(e) => {
            setHasValue(Boolean(e.target.value));
            rest.onChange?.(e);
          }}
          aria-invalid={isError}
          aria-describedby={helperText || error ? `${id}-helper` : undefined}
          className={cn(
            'w-full bg-transparent text-text-primary',
            'placeholder:text-text-muted placeholder:font-normal',
            'focus:outline-none',
            'rounded-2xl',
            sizes.input,
            sizes.text,
            (leftIcon || (label && isFloating)) ? sizes.padding : 'px-4',
            disabled && 'cursor-not-allowed',
          )}
          {...rest}
        />

        {rightIcon && (
          <span
            className="absolute top-1/2 -translate-y-1/2 right-3.5 text-text-muted"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>

      {(helperText || error) && (
        <p
          id={`${id}-helper`}
          className={cn(
            'mt-1.5 text-xs',
            isError ? 'text-red-400' : 'text-text-muted',
            isSuccess && 'text-emerald-400',
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
});
