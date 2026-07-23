'use client';

/**
 * ActiveDeliveryCardV2 — action-first delivery control surface.
 *
 * Design principles:
 * - One-handed use: primary action reachable with thumb at bottom
 * - Status hierarchy: ETA > Customer > Restaurant > Actions
 * - Critical actions are 56-64px tall (above 44px WCAG minimum, optimized for driving gloves)
 * - Reduces taps: combine secondary info, hide advanced behind expandable section
 * - Safe to glance at: large text, high contrast, predictable layout
 */

import { useState } from 'react';
import Link from 'next/link';
import { Phone, MapPin, Navigation2, CheckCircle2, Package, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { formatEUR } from '@/lib/format';

interface ActiveDeliveryCardV2Props {
  order: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    tip: number;
    delivery_fee: number;
    payment_method: string;
    customer: { name: string; phone?: string } | null;
    restaurant: { name: string; address: string; phone?: string } | null;
    delivery_address: string;
    delivery_instructions?: string | null;
    restaurant_latitude: number;
    restaurant_longitude: number;
    customer_latitude: number;
    customer_longitude: number;
  };
  distanceToNextKm: number;
  etaMinutes: number;
  /** Stage of delivery — controls which action is primary. */
  stage: 'to_restaurant' | 'at_restaurant' | 'to_customer' | 'at_customer' | 'completed';
  onPrimaryAction: () => void;
  onMarkArrived: () => void;
  onComplete: () => void;
  busy?: boolean;
}

export function ActiveDeliveryCardV2({
  order,
  distanceToNextKm,
  etaMinutes,
  stage,
  onPrimaryAction,
  onMarkArrived,
  onComplete,
  busy,
}: ActiveDeliveryCardV2Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const stageLabel = {
    to_restaurant: t.driver?.to_restaurant ?? 'Zum Restaurant',
    at_restaurant: t.driver?.at_restaurant ?? 'Im Restaurant',
    to_customer: t.driver?.to_customer ?? 'Zum Kunden',
    at_customer: t.driver?.at_customer ?? 'Beim Kunden',
    completed: t.driver?.completed ?? 'Abgeschlossen',
  }[stage];

  const earnings = (order.delivery_fee ?? 0) + (order.tip ?? 0);
  const primaryAction = {
    to_restaurant: { label: t.driver?.navigate_to_pickup ?? 'Navigation zum Restaurant', icon: Navigation2, action: onPrimaryAction, variant: 'primary' as const },
    at_restaurant: { label: t.driver?.confirm_pickup ?? 'Abholung bestätigen', icon: Package, action: onPrimaryAction, variant: 'success' as const },
    to_customer: { label: t.driver?.navigate_to_customer ?? 'Navigation zum Kunden', icon: Navigation2, action: onPrimaryAction, variant: 'primary' as const },
    at_customer: { label: t.driver?.confirm_delivery ?? 'Lieferung bestätigen', icon: CheckCircle2, action: onComplete, variant: 'success' as const },
    completed: { label: t.driver?.next_order ?? 'Nächster Auftrag', icon: ChevronDown, action: () => {}, variant: 'subtle' as const },
  }[stage];

  const PrimaryIcon = primaryAction.icon;
  const customerPhone = order.customer?.phone?.replace(/[^\d+]/g, '');

  const handlePrimary = () => {
    haptic(stage === 'at_restaurant' ? 'order-arrived' : 'tap');
    playDriverSound(stage === 'at_restaurant' ? 'pickup' : 'success');
    primaryAction.action();
  };

  return (
    <div
      className="bg-bg-card border-2 border-ink-3/20 rounded-3xl overflow-hidden shadow-card"
      role="region"
      aria-label={t.driver?.active_delivery ?? 'Aktive Lieferung'}
    >
      {/* Header — stage + ETA */}
      <div className="px-5 py-4 bg-gradient-to-br from-brand-primary/10 to-brand-premium/10 border-b border-ink-3/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-2">
            {stageLabel}
          </span>
          <span className="text-xs text-ink-2 font-mono">
            #{order.order_number}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-5xl font-black text-ink-1 leading-none tracking-tight">
              {etaMinutes}<span className="text-2xl text-ink-2 ms-1">min</span>
            </div>
            <div className="text-sm text-ink-2 mt-1">
              {distanceToNextKm.toFixed(1)} km
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-ink-2 uppercase tracking-wide">
              {t.driver?.earnings ?? 'Verdienst'}
            </div>
            <div className="text-2xl font-bold text-tip-gradient">
              {formatEUR(earnings)}
            </div>
          </div>
        </div>
      </div>

      {/* Customer info */}
      <div className="px-5 py-4 border-b border-ink-3/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-ink-2 uppercase tracking-wide mb-1">
              {t.driver?.customer ?? 'Kunde'}
            </div>
            <div className="text-lg font-semibold text-ink-1 truncate">
              {order.customer?.name ?? '—'}
            </div>
            <div className="text-sm text-ink-2 mt-1 line-clamp-2 flex items-start gap-1.5">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden />
              <span className="break-words">{formatAddress(order.delivery_address)}</span>
            </div>
            {order.delivery_instructions && expanded && (
              <div className="text-sm text-ink-2 mt-2 p-2 bg-bg-elevated rounded-lg italic">
                💬 {order.delivery_instructions}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions — always visible for one-handed use */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          {customerPhone && (
            <a
              href={`tel:${customerPhone}`}
              onClick={() => haptic('light')}
              className="h-12 flex items-center justify-center gap-2 rounded-xl bg-bg-elevated text-ink-1 font-medium active:scale-95 transition-transform"
              aria-label={t.driver?.callCustomer ?? 'Kunde anrufen'}
            >
              <Phone className="h-5 w-5" aria-hidden />
              <span>{t.driver?.call ?? 'Anrufen'}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => { setExpanded(!expanded); haptic('light'); }}
            className="h-12 flex items-center justify-center gap-2 rounded-xl bg-bg-elevated text-ink-1 font-medium active:scale-95 transition-transform"
            aria-expanded={expanded}
            aria-controls="order-details"
          >
            {expanded ? <ChevronUp className="h-5 w-5" aria-hidden /> : <ChevronDown className="h-5 w-5" aria-hidden />}
            <span>{expanded ? (t.driver?.less ?? 'Weniger') : (t.driver?.more ?? 'Mehr')}</span>
          </button>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div id="order-details" className="px-5 py-4 border-b border-ink-3/10 space-y-3 bg-bg-elevated/30">
          {order.restaurant && (
            <div>
              <div className="text-xs text-ink-2 uppercase tracking-wide mb-1">
                {t.driver?.restaurant ?? 'Restaurant'}
              </div>
              <div className="text-sm font-medium text-ink-1">{order.restaurant.name}</div>
              <div className="text-xs text-ink-2 mt-0.5">{order.restaurant.address}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-ink-2 uppercase tracking-wide mb-1">
              {t.driver?.order_total ?? 'Bestellsumme'}
            </div>
            <div className="text-sm font-medium text-ink-1">{formatEUR(order.total)}</div>
            <div className="text-xs text-ink-2 mt-0.5">
              {t.driver?.payment ?? 'Zahlung'}: {order.payment_method === 'cash' ? 'Bar' : 'Karte'}
            </div>
          </div>
        </div>
      )}

      {/* Primary action — full width, 64px tall, thumb-friendly */}
      <div className="p-4 bg-bg-card">
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy}
          className={`
            w-full h-16 rounded-2xl font-bold text-lg flex items-center justify-center gap-3
            active:scale-[0.98] transition-transform shadow-lg
            ${primaryAction.variant === 'success'
              ? 'bg-gradient-to-r from-tip-500 to-tip-600 text-white'
              : 'bg-gradient-to-r from-brand-primary to-brand-premium text-white'
            }
            ${busy ? 'opacity-50' : ''}
          `}
          aria-label={primaryAction.label}
        >
          <PrimaryIcon className="h-7 w-7" aria-hidden />
          <span>{primaryAction.label}</span>
        </button>
      </div>
    </div>
  );
}

function formatAddress(addr: any): string {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    return (
      addr.formatted_address ||
      addr.address ||
      [addr.street, addr.postal || addr.postal_code, addr.city].filter(Boolean).join(', ') ||
      '—'
    );
  }
  return String(addr);
}
