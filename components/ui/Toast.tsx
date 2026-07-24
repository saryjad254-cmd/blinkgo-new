'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastType = 'success' | 'error' | 'info' | 'warning';
type ToastPosition = 'top' | 'bottom';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: (options: Omit<Toast, 'id'>) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const typeStyles: Record<ToastType, { border: string; icon: any; iconColor: string; bar: string }> = {
  success: { border: 'border-success/30', icon: CheckCircle2, iconColor: 'text-success', bar: 'bg-success' },
  error:   { border: 'border-danger/30',  icon: XCircle,      iconColor: 'text-danger',  bar: 'bg-danger' },
  info:    { border: 'border-info/30',    icon: Info,         iconColor: 'text-info',    bar: 'bg-info' },
  warning: { border: 'border-warning/30', icon: AlertTriangle,iconColor: 'text-warning', bar: 'bg-warning' },
};

/**
 * Premium Toast — top-positioned, swipe-dismissable, action-supporting.
 *
 * Design:
 * - 4px colored accent bar on the leading edge (type-coded)
 * - Backdrop-blur for premium feel
 * - Spring entry (overshoot) + exit
 * - Auto-dismiss with manual close
 * - Optional action button (e.g., "Undo")
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({
  children,
  position = 'top',
  maxToasts = 4,
}: {
  children: ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((options: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9);
    const toast: Toast = { id, duration: 3500, ...options };
    setToasts((prev) => [toast, ...prev].slice(0, maxToasts));
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration);
    }
  }, [maxToasts, dismiss]);

  const api: ToastContextValue = {
    toast: add,
    success: (message, description) => add({ type: 'success', message, description }),
    error: (message, description) => add({ type: 'error', message, description }),
    info: (message, description) => add({ type: 'info', message, description }),
    warning: (message, description) => add({ type: 'warning', message, description }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && toasts.length > 0 && createPortal(
        <div
          className={cn(
            'fixed z-toast left-0 right-0 px-4 pointer-events-none',
            position === 'top' ? 'top-4' : 'bottom-4',
          )}
          aria-live="polite"
        >
          <div className={cn('flex flex-col gap-2 max-w-md mx-auto', position === 'top' ? '' : 'flex-col-reverse')}>
            {toasts.map((t) => {
              const style = typeStyles[t.type];
              const Icon = style.icon;
              return (
                <div
                  key={t.id}
                  className={cn(
                    'pointer-events-auto relative bg-bg-elevated/95 backdrop-blur-xl',
                    'border rounded-2xl shadow-speed-lg overflow-hidden',
                    'animate-toast-in',
                    style.border,
                  )}
                >
                  {/* Accent bar (leading edge) */}
                  <span className={cn('absolute top-0 bottom-0 w-1 start-0', style.bar)} />
                  <div className="flex items-start gap-3 p-3 ps-4">
                    <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.iconColor)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text leading-snug">{t.message}</p>
                      {t.description && (
                        <p className="text-xs text-text-secondary mt-0.5 leading-snug">{t.description}</p>
                      )}
                      {t.action && (
                        <button
                          onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                          className="mt-1.5 text-xs font-bold text-brand hover:text-brand-red-600 transition-colors"
                        >
                          {t.action.label}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => dismiss(t.id)}
                      className="w-7 h-7 rounded-full hover:bg-surface-light text-text-muted hover:text-text transition-colors flex items-center justify-center flex-shrink-0"
                      aria-label="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
