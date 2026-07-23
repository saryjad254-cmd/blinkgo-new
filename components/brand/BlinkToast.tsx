'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkToast — Official BlinkGo Toast Notifications
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - success  Green with check
 *    - error    Red with X
 *    - warning  Yellow with warning
 *    - info     Blue with i
 *
 *  Positions: top-right, top-center, bottom-right, bottom-center
 *  Auto-dismiss with progress bar
 *  Stack up to 5 toasts
 */

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
type ToastPosition = 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface BlinkToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const variantStyles: Record<ToastVariant, { bg: string; ring: string; icon: any; iconColor: string; barColor: string }> = {
  success: {
    bg: 'bg-surface border-emerald-500/30',
    ring: 'ring-emerald-500/10',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    barColor: 'bg-emerald-500',
  },
  error: {
    bg: 'bg-surface border-brand-red/30',
    ring: 'ring-brand-red/10',
    icon: AlertCircle,
    iconColor: 'text-brand-red',
    barColor: 'bg-brand-red',
  },
  warning: {
    bg: 'bg-surface border-brand-yellow-500/30',
    ring: 'ring-brand-yellow-500/10',
    icon: AlertTriangle,
    iconColor: 'text-brand-yellow-500',
    barColor: 'bg-brand-yellow-500',
  },
  info: {
    bg: 'bg-surface border-blue-500/30',
    ring: 'ring-blue-500/10',
    icon: Info,
    iconColor: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
};

const positionStyles: Record<ToastPosition, string> = {
  'top-right': 'top-4 right-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function BlinkToast({ toast, onClose }: BlinkToastProps) {
  const c = variantStyles[toast.variant];
  const Icon = c.icon;
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border overflow-hidden',
        c.bg,
        c.ring,
        'ring-4',
      )}
      role="alert"
    >
      <div className="flex items-start gap-3 p-3.5">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', c.iconColor)} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-text-primary text-sm leading-tight">{toast.title}</p>
          {toast.description && (
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{toast.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="w-6 h-6 -me-1 flex-shrink-0 rounded-md flex items-center justify-center hover:bg-surface-light transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-text-muted" />
        </button>
      </div>
      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 w-full bg-surface-light overflow-hidden">
        <motion.div
          className={cn('h-full', c.barColor)}
          initial={{ width: '100%' }}
          animate={{ width: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}

/** Toast container + hook (lightweight, no provider) */
interface ToastContainerProps {
  position?: ToastPosition;
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function BlinkToastContainer({ position = 'top-right', toasts, onClose }: ToastContainerProps) {
  return (
    <div
      className={cn(
        'fixed z-toast pointer-events-none flex flex-col gap-2',
        positionStyles[position],
      )}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <BlinkToast key={t.id} toast={t} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  );
}
