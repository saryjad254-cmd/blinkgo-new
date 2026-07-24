'use client';
import { memo } from 'react';
import { Check, ChefHat, Store, Truck, Home, X, Package } from 'lucide-react';

import type { Order } from '@/lib/types';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Props {
  order: Order;
}

function getStepIndex(status: string): number {
  switch (status) {
    case 'pending': return 0;
    case 'confirmed': return 1;
    case 'preparing': return 2;
    case 'ready': return 3;
    case 'assigned': return 3;
    case 'picked_up':
    case 'on_the_way':
    case 'delivering': return 4;
    case 'delivered': return 5;
    default: return 0;
  }
}

function getETA(order: any, _locale: string): string {
  // Hook into ETA logic if available; fallback to a generic placeholder
  const avgMins = 25;
  if (_locale === 'ar') return `~${avgMins} دقيقة`;
  return `~${avgMins} ${_locale === 'en' ? 'min' : 'Min.'}`;
}

function OrderTimelineInner({ order }: Props) {
  const { t } = useI18n();
  const sub = t.customer.trackingSubsteps;

  const steps = [
    { id: 'placed', label: t.customer.orderPlaced, sub: sub?.placed, icon: Package },
    { id: 'confirmed', label: t.customer.orderStatus.confirmed, sub: sub?.confirmed, icon: Store },
    { id: 'preparing', label: t.customer.orderStatus.preparing, sub: sub?.preparing, icon: ChefHat },
    { id: 'ready', label: t.customer.orderStatus.ready, sub: sub?.ready, icon: Check },
    { id: 'picked_up', label: t.customer.driverOnWay, sub: sub?.picked_up, icon: Truck },
    { id: 'delivered', label: t.customer.orderStatus.delivered, sub: sub?.delivered, icon: Home },
  ];

  const isCancelled = order.status === 'cancelled';
  const currentStepIdx = getStepIndex(order.status);

  if (isCancelled) {
    return (
      <div className="card-glass border-danger/30 p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-danger text-white flex items-center justify-center shadow-md">
            <X className="w-6 h-6" />
          </div>
          <div>
            <p className="font-extrabold text-danger">{t.customer.orderStatus.cancelled}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {t.customer.cancelledDesc}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-text">{t.customer.orderStatus?.delivered ? t.customer.delivery : t.customer.orderPlaced}</h3>
      </div>
      <ol className="relative">
        <div className="absolute top-0 bottom-0 end-5 w-0.5 bg-edge" aria-hidden="true" />
        <div
          className="absolute top-0 end-5 w-0.5 bg-gradient-to-b from-brand-red-500 to-brand-red-600 transition-all"
          style={{ height: `${(currentStepIdx / (steps.length - 1)) * 100}%`, transition: 'height 0.6s cubic-bezier(0.21, 1.02, 0.73, 1)' }}
          aria-hidden="true"
        />
        {steps.map((step, idx) => {
          const isPast = idx <= currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          const Icon = step.icon;
          return (
            <li key={step.id} className={`flex items-start gap-3 relative pb-4 ${idx === steps.length - 1 ? '' : ''}`}>
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ease-silk ${
                  isPast ? 'bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white shadow-speed-md' : 'bg-bg-elevated text-text-muted border border-edge'
                } ${isCurrent ? 'ring-4 ring-brand-red-500/30 scale-110' : ''}`}
              >
                <Icon className="w-5 h-5" strokeWidth={isCurrent ? 2.5 : 2} />
              </div>
              <div className="flex-1 min-w-0 pt-1.5">
                <p className={`font-bold ${isPast ? 'text-text' : 'text-text-muted'}`}>{step.label}</p>
                <p className="text-xs text-text-muted mt-0.5">{step.sub}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Memoize to avoid re-renders when order object hasn't changed
export const OrderTimeline = memo(OrderTimelineInner, (prev, next) => {
  return prev.order?.status === next.order?.status &&
         prev.order?.id === next.order?.id;
});
