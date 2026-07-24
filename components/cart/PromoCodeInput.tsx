'use client';

import { useState, useRef, useEffect } from 'react';
import { Tag, Check, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

export type PromoStatus = 'idle' | 'loading' | 'success' | 'error' | 'expired';

interface PromoCodeInputProps {
  applied: { code: string; discount: number; type: string } | null;
  onApply: (raw: string) => Promise<void> | void;
  onClear: () => void;
  subtotal: number;
  currency?: string;
  locale?: string;
  t: {
    title?: string;
    placeholder?: string;
    apply?: string;
    applied?: string;
    remove?: string;
    invalid?: string;
    expired?: string;
    minOrder?: (min: string) => string;
    discount?: string;
    free?: string;
  };
}

/**
 * Promo code input — Uber Eats/DoorDash style with 3 states:
 *  - idle: empty input + apply button (love gradient)
 *  - success: green chip with check + saved amount
 *  - error: red banner with reason
 *
 * Auto-uppercases input, async-aware loading state, accessible.
 */
export function PromoCodeInput({
  applied,
  onApply,
  onClear,
  subtotal,
  currency = '€',
  locale = 'de-DE',
  t,
}: PromoCodeInputProps) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<PromoStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (applied) {
      setStatus('success');
      setValue(applied.code);
      setErrorMsg(null);
    }
  }, [applied]);

  async function handleApply() {
    const code = value.toUpperCase().trim();
    if (!code) return;
    setStatus('loading');
    setErrorMsg(null);
    try {
      await onApply(code);
      // parent will set applied → triggers useEffect above
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? t.invalid ?? 'Ungültig');
    }
  }

  function handleClear() {
    setValue('');
    setStatus('idle');
    setErrorMsg(null);
    onClear();
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // Compute display for success chip
  const discountLabel =
    applied?.type === 'free_delivery'
      ? (t.free ?? 'Gratis Lieferung')
      : applied?.type === 'percent'
      ? `-${applied.discount}%${applied.discount ? '' : ''}`
      : applied
      ? `-${(applied.discount ?? 0).toLocaleString(locale, { minimumFractionDigits: 2 })}${currency}`
      : '';

  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
          status === 'success'
            ? 'bg-tip-gradient shadow-glow-success'
            : 'bg-love-gradient',
        )}>
          {status === 'success' ? (
            <Check className="w-4.5 h-4.5 text-white" strokeWidth={3} />
          ) : (
            <Sparkles className="w-4.5 h-4.5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm">{t.title ?? 'Promo-Code'}</h3>
          {status === 'success' && applied ? (
            <p className="text-xs text-emerald-400 mt-0.5 truncate flex items-center gap-1">
              <Check className="w-3 h-3" />
              {t.applied ?? 'Aktiviert'}
              {discountLabel && <span className="font-extrabold text-emerald-400">{' · '}{discountLabel}</span>}
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-0.5">{t.placeholder ?? 'Code eingeben'}</p>
          )}
        </div>

        {status === 'success' ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t.remove ?? 'Entfernen'}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center',
              'bg-surface-light text-text-secondary hover:text-white hover:bg-danger/20 hover:text-danger',
              'transition-all active:scale-95',
            )}
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {status !== 'success' && (
        <div className="px-4 pb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Tag className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.toUpperCase());
                  if (status === 'error') setStatus('idle');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApply())}
                placeholder={t.placeholder ?? 'BLINKGO15'}
                aria-label={t.title ?? 'Promo-Code'}
                className={cn(
                  'w-full h-11 ps-10 pe-3 rounded-xl',
                  'bg-ink-700 border border-edge text-white font-bold tracking-wider',
                  'placeholder:text-text-muted placeholder:font-normal placeholder:tracking-normal',
                  'focus:border-rose focus:ring-2 focus:ring-rose/20 focus:outline-none',
                  'transition-all uppercase',
                  status === 'error' && 'border-danger focus:border-danger focus:ring-danger/20',
                )}
              />
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!value.trim() || status === 'loading'}
              className={cn(
                'h-11 px-5 rounded-xl font-extrabold text-sm',
                'bg-love-gradient text-white',
                'shadow-[0_4px_16px_-2px_rgba(244,63,94,0.45)]',
                'hover:shadow-[0_8px_24px_-2px_rgba(244,63,94,0.6)]',
                'hover:-translate-y-0.5 active:translate-y-0',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
                'transition-all duration-200 ease-silk',
                'flex items-center gap-2',
              )}
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {t.apply ?? 'Anwenden'}
            </button>
          </div>

          {status === 'error' && errorMsg && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2 animate-[fadeIn_150ms_ease-out]">
              <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <p className="text-xs text-danger font-medium">{errorMsg}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
