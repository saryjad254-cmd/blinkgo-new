'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
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
}: ActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
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
            onClick={onClose}
            className={cn(
              'w-full h-12 rounded-2xl',
              'bg-surface-light hover:bg-surface text-text font-bold',
              'flex items-center justify-center',
              'transition-all duration-150 active:scale-[0.985]',
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
