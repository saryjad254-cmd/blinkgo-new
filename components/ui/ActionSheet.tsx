'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import X from 'lucide-react/dist/esm/icons/x';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Localized cancel label override (otherwise inferred from i18n). */
  cancelLabel?: string;
}

/**
 * Action sheet — modal with vertical list of actions.
 * Mobile-friendly, like iOS action sheets.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  cancelLabel,
}: ActionSheetProps) {
  const { locale } = useI18n();
  const cancelText =
    cancelLabel ??
    (locale === 'ar' ? 'إلغاء' : locale === 'en' ? 'Cancel' : 'Abbrechen');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // v82: move focus into the action sheet on open, restore on close.
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
  }, [open, onClose]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-modal">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={cn(
          'absolute bottom-0 inset-x-0',
          'bg-bg-elevated border-t border-edge rounded-t-3xl shadow-speed-xl',
          'animate-sheet-up',
          'pb-safe-bottom',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Actions'}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-edge-strong" />
        </div>

        {(title || description) && (
          <div className="px-5 pt-2 pb-3 text-center">
            {title && <h2 className="text-base font-extrabold text-text">{title}</h2>}
            {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
          </div>
        )}

        <div className="px-3 pb-3">{children}</div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={cancelText}
            className={cn(
              'w-full h-12 rounded-2xl',
              'bg-surface-light hover:bg-surface text-text font-bold',
              'flex items-center justify-center',
              'transition-all duration-150 active:scale-[0.985]',
            )}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
