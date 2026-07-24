'use client';

import { useI18n, localeOptions, type Locale } from '@/lib/i18n/I18nProvider';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';

/**
 * Language switcher — always shows all three options (DE / AR / EN).
 * Persists choice in localStorage AND in the `blinkgo-locale` cookie so
 * server components can read it on the next request.
 *
 * The "EN only" bug the user reported was caused by the previous
 * implementation not merging missing keys from English as a fallback.
 * The new useTranslations() helper in I18nProvider handles that case.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = localeOptions.find((l) => l.code === locale) ?? localeOptions[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong transition-all duration-200 ease-silk active:scale-95"
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Globe className="w-4 h-4 text-text-secondary" strokeWidth={2} />
        <span className="text-base leading-none" aria-hidden>
          {current?.flag}
        </span>
        <span className="text-xs font-extrabold text-text-secondary hidden sm:inline tracking-wide">
          {current?.code.toUpperCase()}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-text-muted transition-transform duration-200 ease-silk',
            open && 'rotate-180'
          )}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 mt-2 z-modal min-w-[200px] max-w-[calc(100vw-1.5rem)] card-glass p-1.5 shadow-speed-xl animate-fade-in-down origin-top-end"
        >
          <div className="px-3 py-2 mb-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
              {locale === 'ar' ? 'اللغة' : locale === 'en' ? 'Language' : 'Sprache'}
            </p>
          </div>
          {localeOptions.map((opt) => {
            const isActive = locale === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                role="menuitem"
                onClick={() => {
                  setLocale(opt.code as Locale);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 ease-silk',
                  isActive
                    ? 'bg-gradient-to-r from-brand-red-500/15 to-brand-yellow-500/10 text-brand border border-brand-red-500/20'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text border border-transparent'
                )}
                dir={opt.code === 'ar' ? 'rtl' : 'ltr'}
              >
                <span className="text-base leading-none" aria-hidden>
                  {opt.flag}
                </span>
                <span className="flex-1 text-start">
                  <span className="block">{opt.name}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {opt.code}
                  </span>
                </span>
                {isActive && (
                  <Check className="w-4 h-4 text-brand" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
