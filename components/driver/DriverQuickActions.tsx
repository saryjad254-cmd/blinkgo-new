'use client';

/**
 * DriverQuickActions — one-tap access to common driver actions.
 *
 * Replaces multi-step navigation with 2x2 grid of large buttons:
 * - Available orders (if any)
 * - Active delivery
 * - History
 * - Earnings
 *
 * Each button is 80px+ tall for easy tapping with gloves.
 */

import Link from 'next/link';
import { Package, ListChecks, History, Wallet, Settings, Headphones } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { haptic } from '@/lib/utils/haptics';

interface DriverQuickActionsProps {
  availableCount: number;
  hasActiveOrder: boolean;
}

export function DriverQuickActions({ availableCount, hasActiveOrder }: DriverQuickActionsProps) {
  const t = useT();
  const handleTap = () => haptic('light');

  const actions = [
    {
      href: '/driver/orders/available',
      icon: Package,
      label: t.driver?.availableOrders ?? 'Verfügbare Aufträge',
      badge: availableCount,
      disabled: false,
      tone: 'primary' as const,
    },
    {
      href: hasActiveOrder ? '/driver/orders' : '/driver/orders',
      icon: ListChecks,
      label: t.driver?.active_delivery ?? 'Aktive Lieferung',
      badge: hasActiveOrder ? 1 : 0,
      disabled: false,
      tone: 'accent' as const,
    },
    {
      href: '/driver/history',
      icon: History,
      label: t.driver?.history ?? 'Verlauf',
      badge: 0,
      disabled: false,
      tone: 'neutral' as const,
    },
    {
      href: '/driver/earnings',
      icon: Wallet,
      label: t.driver?.earnings ?? 'Verdienst',
      badge: 0,
      disabled: false,
      tone: 'tip' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3" role="navigation" aria-label={t.driver?.quick_actions ?? 'Schnellzugriff'}>
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            onClick={handleTap}
            className={`
              relative h-20 rounded-2xl p-3 flex items-center gap-3
              active:scale-95 transition-transform touch-manipulation
              ${a.tone === 'primary' ? 'bg-gradient-to-br from-brand-primary to-brand-premium text-white shadow-lg' : ''}
              ${a.tone === 'accent' ? 'bg-gradient-to-br from-brand-yellow-500 to-brand-yellow-600 text-white shadow-lg' : ''}
              ${a.tone === 'tip' ? 'bg-gradient-to-br from-tip-500 to-tip-600 text-white shadow-lg' : ''}
              ${a.tone === 'neutral' ? 'bg-bg-card border-2 border-ink-3/20 text-ink-1' : ''}
            `}
            aria-label={a.label}
          >
            <Icon className="h-7 w-7 flex-shrink-0" aria-hidden />
            <span className="text-sm font-semibold leading-tight">{a.label}</span>
            {a.badge > 0 && (
              <span
                className="absolute top-2 end-2 min-w-5 h-5 px-1.5 rounded-full bg-white text-ink-1 text-xs font-bold flex items-center justify-center"
                aria-label={`${a.badge} ${t.driver?.new ?? 'neu'}`}
              >
                {a.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
