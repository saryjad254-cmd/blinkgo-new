'use client';

import { memo, useEffect, useState } from 'react';
import { CheckCircle2, Clock, ChefHat, Package, Truck, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivering' | 'delivered' | 'cancelled';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  withDot?: boolean;
  withIcon?: boolean;
  /** @deprecated dot pulse is automatic for in-progress states */
  pulse?: boolean;
  className?: string;
}

const statusConfig: Record<Status, { label: { ar: string; de: string; en: string }; bg: string; text: string; dot: string; icon: any; animate?: string }> = {
  pending: {
    label: { ar: 'قيد الانتظار', de: 'Wartend', en: 'Pending' },
    bg: 'bg-warning/10 border-warning/30',
    text: 'text-warning',
    dot: 'bg-warning',
    icon: Clock,
    animate: 'animate-pulse-dot',
  },
  confirmed: {
    label: { ar: 'مؤكد', de: 'Bestätigt', en: 'Confirmed' },
    bg: 'bg-info/10 border-info/30',
    text: 'text-info',
    dot: 'bg-info',
    icon: CheckCircle2,
  },
  preparing: {
    label: { ar: 'قيد التحضير', de: 'Wird vorbereitet', en: 'Preparing' },
    bg: 'bg-brand-yellow-500/10 border-brand-yellow-500/30',
    text: 'text-brand-yellow-500',
    dot: 'bg-brand-yellow-500',
    icon: ChefHat,
    animate: 'animate-pulse-dot',
  },
  ready: {
    label: { ar: 'جاهز للاستلام', de: 'Abholbereit', en: 'Ready' },
    bg: 'bg-brand-red-500/10 border-brand-red-500/30',
    text: 'text-brand',
    dot: 'bg-brand',
    icon: Package,
    animate: 'animate-pulse-dot',
  },
  picked_up: {
    label: { ar: 'تم الاستلام', de: 'Abgeholt', en: 'Picked up' },
    bg: 'bg-info/10 border-info/30',
    text: 'text-info',
    dot: 'bg-info',
    icon: Package,
  },
  delivering: {
    label: { ar: 'قيد التوصيل', de: 'Unterwegs', en: 'On the way' },
    bg: 'bg-brand-red-500/10 border-brand-red-500/30',
    text: 'text-brand',
    dot: 'bg-brand',
    icon: Truck,
    animate: 'animate-pulse-dot',
  },
  delivered: {
    label: { ar: 'تم التوصيل', de: 'Zugestellt', en: 'Delivered' },
    bg: 'bg-success/10 border-success/30',
    text: 'text-success',
    dot: 'bg-success',
    icon: CheckCircle2,
  },
  cancelled: {
    label: { ar: 'ملغي', de: 'Storniert', en: 'Cancelled' },
    bg: 'bg-danger/10 border-danger/30',
    text: 'text-danger',
    dot: 'bg-danger',
    icon: XCircle,
  },
};

const sizeConfig = {
  sm: { px: 'px-2', py: 'py-0.5', text: 'text-[10px]', icon: 'w-2.5 h-2.5', dot: 'w-1.5 h-1.5', gap: 'gap-1' },
  md: { px: 'px-2.5', py: 'py-1', text: 'text-xs', icon: 'w-3 h-3', dot: 'w-2 h-2', gap: 'gap-1.5' },
  lg: { px: 'px-3', py: 'py-1.5', text: 'text-sm', icon: 'w-3.5 h-3.5', dot: 'w-2.5 h-2.5', gap: 'gap-2' },
};

/**
 * Premium status badge — locale-aware, color-coded, optional live pulse.
 *
 * Design:
 * - Translucent background (10% opacity) with matching border (30% opacity)
 * - 2px colored dot (or live pulse for in-progress states)
 * - Optional icon for stronger visual cue
 * - 3 sizes: sm (inline), md (default), lg (prominent)
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  size = 'md',
  withDot = true,
  withIcon = false,
  pulse: _pulse, // ignore
  className = '',
}: StatusBadgeProps) {
  // Map common aliases
  const normalized = (status as Status) in statusConfig ? (status as Status) : 'pending';
  const config = statusConfig[normalized];
  const s = sizeConfig[size];

  // Hydration-safe locale: use the I18nProvider's locale directly. The provider
  // is server-authoritative (initialLocale comes from the layout cookie read),
  // so on first render the server and client agree.
  const i18n = useI18n();
  const [lang, setLang] = useState<Locale>(i18n?.locale ?? 'de');
  // After hydration, sync if the provider's locale changes (e.g. user toggles
  // language). This is a no-op on first render, so no hydration mismatch.
  useEffect(() => {
    if (i18n?.locale && i18n.locale !== lang) setLang(i18n.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n?.locale]);
  const label = config.label[lang] || config.label.de;

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold uppercase tracking-wider rounded-full border',
        'whitespace-nowrap',
        s.px, s.py, s.text, s.gap,
        config.bg, config.text,
        className,
      )}
    >
      {withDot && (
        <span className="relative inline-flex flex-shrink-0">
          <span className={cn('block rounded-full', s.dot, config.dot)} />
          {config.animate && (
            <span className={cn('absolute inset-0 rounded-full opacity-50', config.dot, config.animate)} />
          )}
        </span>
      )}
      {withIcon && <Icon className={s.icon} />}
      <span>{label}</span>
    </span>
  );
});
