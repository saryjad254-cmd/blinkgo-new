'use client';

/**
 * Premium Button — single source of truth.
 *
 * Variants:
 *   - primary:  Brand gradient, white text, brand glow
 *   - secondary: Filled surface, primary text
 *   - outline:  Border only, primary text
 *   - ghost:    No background, primary text
 *   - danger:   Error color
 *
 * Sizes: sm, md (default), lg
 *
 * Features:
 *   - Touch target ≥44px (Apple HIG)
 *   - Loading state with spinner
 *   - Disabled state
 *   - Press scale animation
 *   - Icon support (left/right)
 *   - Full width option
 *   - ARIA compliant
 */

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { color } from '@/lib/design/tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   'text-white shadow-[0_4px_14px_rgba(239,68,68,0.35)] hover:shadow-[0_8px_24px_rgba(239,68,68,0.50)]',
  secondary: 'bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.10] text-text-primary',
  outline:   'border border-white/[0.16] hover:border-white/[0.24] hover:bg-white/[0.04] text-text-primary',
  ghost:     'hover:bg-white/[0.06] text-text-secondary hover:text-text-primary',
  danger:    'bg-red-500/90 hover:bg-red-500 text-white shadow-[0_4px_14px_rgba(239,68,68,0.40)]',
  success:   'bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.40)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-7 text-base',
};

const primaryStyle: Record<Size, React.CSSProperties> = {
  sm: { backgroundImage: `linear-gradient(135deg, ${color.brand[500]} 0%, ${color.accent[500]} 100%)` },
  md: { backgroundImage: `linear-gradient(135deg, ${color.brand[500]} 0%, ${color.accent[500]} 100%)` },
  lg: { backgroundImage: `linear-gradient(135deg, ${color.brand[500]} 0%, ${color.accent[500]} 100%)` },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    disabled,
    children,
    className,
    style,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-full',
        'select-none whitespace-nowrap',
        'transition-all duration-200 ease-out active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{
        ...(variant === 'primary' ? primaryStyle[size] : {}),
        ...style,
      }}
      aria-busy={loading}
      aria-disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size={size} />
          {loadingText || children}
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
});

// ── Internal Spinner ──────────────────────────────────────
function Spinner({ size }: { size: Size }) {
  const sizeMap = { sm: 14, md: 16, lg: 20 };
  return (
    <span
      className="inline-block animate-spin"
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: 'currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
      }}
      aria-hidden="true"
    />
  );
}
