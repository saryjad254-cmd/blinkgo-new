'use client';

import { useState, useRef, useEffect } from 'react';
import { Heart, Pencil } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TipOption {
  /** Percentage (0.05 = 5%), or absolute amount for 'custom' */
  value: number;
  label: string;
  type: 'percent' | 'amount' | 'custom';
}

interface TipSelectorProps {
  /** Current tip amount in EUR (absolute, not percent) */
  tip: number;
  /** Subtotal in EUR — used to compute percent-based tip amounts */
  subtotal: number;
  /** Update parent state with new tip amount (absolute EUR value) */
  onChange: (tip: number) => void;
  /** Currency symbol */
  currency?: string;
  /** Locale for formatting */
  locale?: string;
  /** Translation function */
  t: {
    title?: string;
    subtitle?: string;
    none?: string;
    custom?: string;
    note?: string;
  };
}

/**
 * Tip selector — Wolt/DoorDash/Uber Eats style.
 * 4 chips: None, 5%, 10%, 15%, Custom.
 * Custom opens a number input for exact EUR.
 *
 * Highlights the currently-selected chip with brand-gradient + glow.
 */
export function TipSelector({
  tip,
  subtotal,
  onChange,
  currency = '€',
  locale = 'de-DE',
  t,
}: TipSelectorProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const customRef = useRef<HTMLInputElement>(null);

  const percentOptions = [0, 0.05, 0.1, 0.15];

  // Which chip is active?
  const activePct =
    subtotal > 0 && tip > 0 ? Math.round((tip / subtotal) * 100) / 100 : 0;
  const isPercentActive = percentOptions.includes(activePct) && activePct > 0;
  const isCustomActive = tip > 0 && !isPercentActive;

  function selectPct(pct: number) {
    setCustomMode(false);
    setCustomText('');
    const newTip = subtotal * pct;
    onChange(Math.round(newTip * 100) / 100);
  }

  function selectNone() {
    setCustomMode(false);
    setCustomText('');
    onChange(0);
  }

  function openCustom() {
    setCustomMode(true);
    setTimeout(() => customRef.current?.focus(), 100);
  }

  function commitCustom(val: string) {
    setCustomText(val);
    const parsed = parseFloat(val.replace(',', '.'));
    const abs = Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, subtotal || parsed) : 0;
    onChange(Math.round(abs * 100) / 100);
  }

  useEffect(() => {
    if (customMode && customText === '' && tip > 0 && !isPercentActive) {
      setCustomText(String(tip));
    }
  }, [customMode]); // eslint-disable-line

  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-tip-gradient flex items-center justify-center shadow-glow-success flex-shrink-0">
          <Heart className="w-4.5 h-4.5 text-white fill-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm">{t.title ?? 'Trinkgeld für den Fahrer'}</h3>
          <p className="text-xs text-text-secondary mt-0.5">{t.subtitle ?? '100 % gehen direkt an den Fahrer'}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {/* No tip */}
        <button
          type="button"
          onClick={selectNone}
          aria-pressed={tip === 0}
          className={cn(
            'h-12 rounded-xl font-bold text-sm transition-all duration-200 ease-silk',
            'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
            tip === 0
              ? 'bg-surface-light text-white border border-brand-red-500/60 shadow-glow'
              : 'bg-surface text-text-secondary border border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
          )}
        >
          {t.none ?? 'Nein'}
        </button>

        {/* Percent chips */}
        {[0.05, 0.1, 0.15].map((pct) => {
          const amt = Math.round(subtotal * pct * 100) / 100;
          const amtStr = `${amt.toLocaleString(locale, { maximumFractionDigits: 2 })}${currency}`;
          const isActive = Math.abs(activePct - pct) < 0.001 && pct > 0;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => selectPct(pct)}
              aria-pressed={isActive}
              className={cn(
                'h-12 rounded-xl font-bold text-sm flex flex-col items-center justify-center transition-all duration-200 ease-silk',
                'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
                isActive
                  ? 'bg-tip-gradient text-white border border-emerald-400/60 shadow-glow-success'
                  : 'bg-surface text-text-secondary border border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
              )}
            >
              <span className="text-base font-extrabold leading-none">{Math.round(pct * 100)}%</span>
              <span className={cn('text-[10px] mt-0.5 font-medium', isActive ? 'text-white/85' : 'text-text-muted')}>
                {amtStr}
              </span>
            </button>
          );
        })}

        {/* Custom */}
        <button
          type="button"
          onClick={openCustom}
          aria-pressed={isCustomActive || customMode}
          className={cn(
            'h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-1 transition-all duration-200 ease-silk',
            'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
            customMode || isCustomActive
              ? 'bg-tip-gradient text-white border border-emerald-400/60 shadow-glow-success'
              : 'bg-surface text-text-secondary border border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
          )}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>{t.custom ?? 'Eigen'}</span>
        </button>
      </div>

      {/* Custom input row */}
      {customMode && (
        <div className="mt-3 flex items-center gap-2 animate-[fadeIn_200ms_ease-out]">
          <div className="flex-1 relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-text-muted font-bold">{currency}</span>
            <input
              ref={customRef}
              type="text"
              inputMode="decimal"
              value={customText}
              onChange={(e) => commitCustom(e.target.value)}
              placeholder="0.00"
              aria-label={t.custom ?? 'Eigen'}
              className={cn(
                'w-full h-11 ps-8 pe-3 rounded-xl',
                'bg-ink-700 border border-edge text-white font-bold',
                'placeholder:text-text-muted',
                'focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 focus:outline-none',
                'transition-all',
              )}
            />
          </div>
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="h-11 px-4 rounded-xl bg-surface-light text-text-secondary hover:text-white hover:bg-surface-raised transition-all text-sm font-bold"
          >
            OK
          </button>
        </div>
      )}

      {tip > 0 && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-medium">{t.note ?? 'Trinkgeld'}</span>
            <span className="font-extrabold text-emerald-400 tabular-nums">
              {tip.toLocaleString(locale, { minimumFractionDigits: 2 })}{currency}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
