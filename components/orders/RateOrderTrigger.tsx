'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { RateOrderModal } from './RateOrderModal';
import { safeT } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  orderId: string;
  orderNumber: string;
  restaurantId?: string;
  driverId?: string;
  locale: 'de' | 'ar' | 'en';
  variant?: 'card' | 'button' | 'inline';
}

/**
 * RateOrderTrigger
 * ────────────────
 * Button that opens RateOrderModal.
 * Three variants: full card, primary button, or inline link.
 */
export function RateOrderTrigger({
  orderId,
  orderNumber,
  restaurantId,
  driverId,
  locale,
  variant = 'card',
}: Props) {
  const [open, setOpen] = useState(false);

  const title = safeT(
    { customer: { rateOrder: locale === 'ar' ? 'تقييم الطلب' : locale === 'en' ? 'Rate order' : 'Bestellung bewerten' } },
    'rateOrder',
    'Bestellung bewerten',
  );

  if (variant === 'card') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'w-full rounded-2xl p-4 sm:p-5 text-start',
            'bg-gradient-to-br from-brand-yellow-500/15 via-brand-yellow-500/10 to-yellow-500/5',
            'border-2 border-brand-yellow-500/40 hover:border-brand-yellow-500/70',
            'active:scale-[0.99] transition-all duration-200',
            'group',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-glow-accent group-hover:scale-110 transition-transform">
              <Star className="w-6 h-6 text-ink-900 fill-ink-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-white">
                {safeT({ customer: { rateYourOrder: locale === 'ar' ? 'قيّم طلبك' : locale === 'en' ? 'Rate your order' : 'Bewerte deine Bestellung' } }, 'rateYourOrder', 'Bewerte deine Bestellung')}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                {locale === 'ar'
                  ? 'شاركنا رأيك في الطعام والمطعم'
                  : locale === 'en'
                  ? 'Help other customers with your feedback'
                  : 'Hilf anderen Kunden mit deinem Feedback'}
              </p>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-4 h-4 text-brand-yellow-500 fill-brand-yellow-500" />
              ))}
            </div>
          </div>
        </button>
        <RateOrderModal
          orderId={orderId}
          orderNumber={orderNumber}
          restaurantId={restaurantId}
          driverId={driverId}
          isOpen={open}
          onClose={() => setOpen(false)}
          locale={locale}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-brand-yellow-500/10 border border-brand-yellow-500/30 text-brand-yellow-500 hover:bg-brand-yellow-500/20 active:scale-95 transition-all text-xs font-bold"
      >
        <Star className="w-3.5 h-3.5 fill-current" />
        {title}
      </button>
      <RateOrderModal
        orderId={orderId}
        orderNumber={orderNumber}
        restaurantId={restaurantId}
        driverId={driverId}
        isOpen={open}
        onClose={() => setOpen(false)}
        locale={locale}
      />
    </>
  );
}
