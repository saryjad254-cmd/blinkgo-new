'use client';

/**
 * DriverShiftCard — at-a-glance shift metrics.
 *
 * Shows the driver how their current shift is going:
 * - Duration online
 * - Deliveries completed
 * - Total earnings (base + tips)
 * - Average per delivery
 * - Hourly pace
 *
 * Designed to be glanceable in 2 seconds while parked.
 */

import { Clock, TrendingUp, Truck, Wallet } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';

export interface DriverShiftCardProps {
  online: boolean;
  /** ISO string of when they went online, or null. */
  onlineSince: string | null;
  /** Number of completed deliveries this shift. */
  deliveriesThisShift: number;
  /** Total earnings this shift in EUR. */
  earningsThisShift: number;
  /** Active order id (or null). */
  activeOrderId: string | null;
}

export function DriverShiftCard({ online, onlineSince, deliveriesThisShift, earningsThisShift, activeOrderId }: DriverShiftCardProps) {
  const t = useT();

  const durationMin = onlineSince
    ? Math.floor((Date.now() - new Date(onlineSince).getTime()) / 60000)
    : 0;
  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  const durationLabel = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  const avgPerDelivery = deliveriesThisShift > 0 ? earningsThisShift / deliveriesThisShift : 0;
  const hourlyPace = durationMin > 0 ? (earningsThisShift / (durationMin / 60)) : 0;

  return (
    <div
      className="bg-bg-card border-2 border-ink-3/20 rounded-3xl p-5 shadow-card"
      role="region"
      aria-label={t.driver?.shift_summary ?? 'Schichtübersicht'}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-ink-1 flex items-center gap-2">
          <Clock className="h-5 w-5 text-ink-2" aria-hidden />
          {t.driver?.current_shift ?? 'Aktuelle Schicht'}
        </h2>
        {online ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success-700">
            <span className="h-2 w-2 rounded-full bg-success-500 animate-pulse" />
            {t.driver?.online ?? 'Online'}
          </span>
        ) : (
          <span className="text-xs font-semibold text-ink-2">
            {t.driver?.offline ?? 'Offline'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          icon={<Clock className="h-4 w-4" aria-hidden />}
          label={t.driver?.shift_duration ?? 'Dauer'}
          value={durationLabel}
        />
        <Stat
          icon={<Truck className="h-4 w-4" aria-hidden />}
          label={t.driver?.deliveries_count ?? 'Lieferungen'}
          value={String(deliveriesThisShift)}
        />
        <Stat
          icon={<Wallet className="h-4 w-4" aria-hidden />}
          label={t.driver?.earnings ?? 'Verdienst'}
          value={formatEUR(earningsThisShift)}
          accent="tip"
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          label={t.driver?.hourly_pace ?? 'Stundenverdienst'}
          value={durationMin > 30 ? formatEUR(hourlyPace) : '—'}
        />
      </div>

      {deliveriesThisShift > 0 && (
        <div className="mt-3 pt-3 border-t border-ink-3/10 text-xs text-ink-2 text-center">
          ⌀ {formatEUR(avgPerDelivery)} {t.driver?.per_delivery ?? 'pro Lieferung'}
        </div>
      )}

      {activeOrderId && (
        <div className="mt-3 pt-3 border-t border-ink-3/10 text-xs text-brand-primary text-center font-medium">
          🚀 {t.driver?.one_active_order ?? 'Eine aktive Bestellung'}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: 'tip' }) {
  return (
    <div className="bg-bg-elevated rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-xs text-ink-2 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${accent === 'tip' ? 'text-tip-gradient' : 'text-ink-1'}`}>
        {value}
      </div>
    </div>
  );
}
