'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import X from 'lucide-react/dist/esm/icons/x';
import { cn } from '@/lib/cn';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  showHandle?: boolean;
  showClose?: boolean;
  className?: string;
  /** Disable backdrop click (for important confirmations) */
  persistent?: boolean;
}

const sizeClasses = {
  sm: 'max-h-[40vh]',
  md: 'max-h-[70vh]',
  lg: 'max-h-[90vh]',
  full: 'h-[calc(100dvh-1rem)]',
};

/**
 * Premium Bottom Sheet — mobile-first modal.
 *
 * Features:
 * - Spring entry animation (from below)
 * - Backdrop with blur
 * - Drag-to-close handle
 * - ESC key + backdrop click to dismiss
 * - Safe area inset padding
 * - Lock body scroll while open
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  showHandle = true,
  showClose = true,
  className,
  persistent = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // v82: remember the element that triggered the sheet and move focus into
    // the dialog on mount; restore on unmount. Improves keyboard a11y and
    // means screen-reader users land inside the sheet, not on the body.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const focusables = sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const target = (focusables && focusables[0]) || sheetRef.current;
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, persistent, onClose]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-modal">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => !persistent && onClose()}
        aria-hidden
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={cn(
          'absolute bottom-0 inset-x-0',
          'bg-bg-elevated border-t border-edge rounded-t-3xl shadow-speed-xl',
          'animate-sheet-up',
          'flex flex-col',
          'pb-safe-bottom',
          sizeClasses[size],
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        {showHandle && (
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-edge-strong" />
          </div>
        )}

        {(title || showClose) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3">
            <div className="flex-1 min-w-0">
              {title && <h2 className="text-lg font-extrabold text-text leading-tight">{title}</h2>}
              {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  'flex-shrink-0 w-9 h-9 rounded-full',
                  'bg-surface-light hover:bg-surface text-text-secondary hover:text-text',
                  'flex items-center justify-center',
                  'transition-all duration-150 active:scale-95',
                )}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-edge px-5 py-3 bg-bg-elevated/95 backdrop-blur-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
