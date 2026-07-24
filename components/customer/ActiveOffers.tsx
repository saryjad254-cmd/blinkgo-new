'use client';

import { Tag, Percent, Gift, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { formatCurrency } from '@/lib/i18n/format';

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount?: number;
  max_discount?: number;
  description?: string;
}

interface Props {
  coupons: Coupon[];
}

export function ActiveOffers({ coupons }: Props) {
  const { locale, t } = useI18n();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (coupons.length === 0) return null;

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  }

  return (
    <div className="card glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-md bg-accent/20 flex items-center justify-center">
          <Tag className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="font-bold text-white">{t.customer.activeOffers}</h3>
          <p className="text-xs text-text-muted">
            {coupons.length} {t.customer.couponsAvailable}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coupons.map((c) => (
          <div
            key={c.id}
            className="bg-surface-elevated border border-edge-light rounded-md p-3 hover:border-brand-red-500/40 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {c.type === 'percentage' ? (
                  <Percent className="w-4 h-4 text-brand-red-500" />
                ) : (
                  <Gift className="w-4 h-4 text-accent" />
                )}
                <div>
                  <p className="text-sm font-bold text-white">
                    {c.type === 'percentage'
                      ? `${c.value}%`
                      : `${formatCurrency(c.value, locale)}`}{' '}
                    {t.customer.discount}
                  </p>
                  {c.min_order_amount ? (
                    <p className="text-xs text-text-muted">
                      {t.common.minOrder}: {formatCurrency(c.min_order_amount, locale)}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                onClick={() => copyCode(c.code)}
                className="flex items-center gap-1 px-2 py-1 rounded-sm bg-bg border border-edge-light text-xs font-mono font-bold text-brand-red-500 hover:bg-brand-red-500/10 transition-colors"
              >
                {copiedCode === c.code ? (
                  <>
                    <Check className="w-3 h-3" />
                    {t.customer.copied}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    {c.code}
                  </>
                )}
              </button>
            </div>
            {c.description && (
              <p className="text-xs text-text-secondary leading-relaxed">{c.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
