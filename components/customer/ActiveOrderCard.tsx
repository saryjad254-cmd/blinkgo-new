'use client';

/**
 * ActiveOrderCard — EXACT VISUAL (v4)
 *
 * Live order tracking card matching the reference:
 * - Red "Live order tracking" section heading
 * - Restaurant name (bold)
 * - "Your order is on the way" status
 * - 4-stage progress:
 *     🏪 Confirmed → 🧺 Preparing → 🛵 On the way → 🏠 Arriving
 *   Active stage highlighted in red with a ring
 * - ETA box on the right ("Arriving in N min")
 * - Restaurant image thumbnail
 */

import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n/I18nProvider';
import Store from 'lucide-react/dist/esm/icons/store.js';
import ShoppingBasket from 'lucide-react/dist/esm/icons/shopping-basket.js';
import Bike from 'lucide-react/dist/esm/icons/bike.js';
import Home from 'lucide-react/dist/esm/icons/home.js';
import { CatalogImage } from '@/components/customer/CatalogImage';

export type OrderStage = 'confirmed' | 'preparing' | 'on_the_way' | 'arriving' | 'delivered';

export interface ActiveOrderCardProps {
  restaurantName: string;
  status: string;
  etaMinutes: number;
  stage: OrderStage;
  imageUrl?: string;
  onClick?: () => void;
}

const STAGE_META: Record<OrderStage, { icon: typeof Store; key: string }> = {
  confirmed:   { icon: Store,             key: 'confirmed' },
  preparing:   { icon: ShoppingBasket,    key: 'preparing' },
  on_the_way:  { icon: Bike,              key: 'onTheWay' },
  arriving:    { icon: Home,              key: 'arriving' },
  delivered:   { icon: Home,              key: 'arriving' },
};

export function ActiveOrderCard({
  restaurantName,
  status,
  etaMinutes,
  stage,
  imageUrl,
  onClick,
}: ActiveOrderCardProps) {
  const t = useT();
  const { locale } = useI18n();

  // Compute which step is active
  const stepIndex: Record<OrderStage, number> = {
    confirmed:  0,
    preparing:  1,
    on_the_way: 2,
    arriving:   2, // arriving shows during on_the_way
    delivered:  3,
  };
  const activeStep = stepIndex[stage];
  const localizedStatus = stage === 'confirmed'
    ? t.tracking?.confirmed
    : stage === 'preparing'
      ? t.tracking?.preparing
      : stage === 'delivered'
        ? t.tracking?.delivered
        : t.tracking?.onTheWay;
  const arrivingNow = etaMinutes <= 0;
  const etaValue = arrivingNow
    ? locale === 'de' ? 'Jetzt' : locale === 'ar' ? 'الآن' : 'Now'
    : locale === 'en' ? `in ${etaMinutes}` : String(etaMinutes);
  const accessibleEta = arrivingNow
    ? etaValue
    : `${etaMinutes} ${t.activeOrderCard?.minutes || 'min'}`;

  return (
    <div className="px-4 mt-5">
      {/* Section heading */}
      <h3 className="text-brand font-extrabold text-[15px] mb-2 px-1">
        {t.activeOrderCard?.liveTracking || 'Live order tracking'}
      </h3>

      {/* Card */}
      <button
        type="button"
        onClick={onClick}
        aria-label={`${restaurantName}: ${localizedStatus || status}. ${t.activeOrderCard?.arriving || 'Arriving'} ${accessibleEta}`}
        className="w-full rounded-2xl border border-[var(--border)] bg-surface-1 p-3.5 text-start transition-colors hover:bg-surface-2 focus:outline-none focus:ring-4 focus:ring-red-500/15"
      >
        {/* Top row: name + image */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-ink-primary font-extrabold text-[17px] truncate">
              {restaurantName}
            </h4>
            <p className="text-text-secondary text-[13px] mt-0.5">{localizedStatus || status}</p>
          </div>
          <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-surface-2">
            <CatalogImage src={imageUrl} alt={restaurantName} name={restaurantName} kind="restaurant" sizes="48px" fallbackClassName="[&>span:nth-last-child(2)]:scale-50 [&>span:last-child]:hidden" />
          </div>
        </div>

        {/* Progress + ETA row */}
        <div className="flex items-center gap-3">
          {/* 4 stage progress */}
          <div className="flex-1 flex items-center gap-1">
            {[0, 1, 2, 3].map((i) => {
              const done = i < activeStep;
              const current = i === activeStep;
              const meta = i === 0 ? STAGE_META.confirmed
                         : i === 1 ? STAGE_META.preparing
                         : i === 2 ? STAGE_META.on_the_way
                         : STAGE_META.arriving;
              const Icon = meta.icon;
              return (
                <div key={i} className="flex-1 flex items-center gap-1">
                  <div
                    className={cn(
                      'relative w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                      'transition-colors',
                      done && 'bg-brand text-white',
                      current && 'bg-brand text-white ring-[3px] ring-brand/30',
                      !done && !current && 'bg-surface-3 text-text-muted'
                    )}
                    aria-current={current ? 'step' : undefined}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                  </div>
                  {i < 3 && (
                    <div
                      className={cn(
                        'flex-1 h-[2px] transition-colors',
                        i < activeStep ? 'bg-brand' : 'bg-surface-3'
                      )}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ETA box */}
          <div className="shrink-0 text-center min-w-[64px]">
            <div className="text-text-secondary text-[10px] font-medium leading-none mb-0.5">
              {t.activeOrderCard?.arriving || 'Arriving'}
            </div>
            <div className="text-brand font-extrabold text-[18px] leading-none tabular-nums">
              {etaValue}
            </div>
            {!arrivingNow && <div className="text-text-secondary text-[10px] font-medium leading-none mt-0.5">{t.activeOrderCard?.minutes || 'min'}</div>}
          </div>
        </div>
      </button>
    </div>
  );
}
