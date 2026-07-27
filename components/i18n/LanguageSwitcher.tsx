'use client';

import { useI18n, localeOptions, type Locale } from '@/lib/i18n/I18nProvider';
import Globe from 'lucide-react/dist/esm/icons/globe';
import Check from 'lucide-react/dist/esm/icons/check';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/cn';

/**
 * Language switcher — always shows all three options (DE / AR / EN).
 *
 * Bug fix v85: Dropdown positioning was broken on RTL languages and on
 * sticky headers. The dropdown is now positioned DIRECTLY below the
 * trigger using `top-full start-0` (or `end-0` for left-aligned in RTL),
 * with a high z-index so it floats over sticky headers.
 *
 * The trigger is given `position: relative` so the absolute dropdown
 * anchors to the button (not the page).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = localeOptions.find((l) => l.code === locale) ?? localeOptions[0];

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div
      className={cn('relative inline-block', className)}
      ref={ref}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong transition-all duration-200 active:scale-95"
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="menu"
        style={{ position: 'relative', zIndex: open ? 60 : 'auto' }}
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
            'w-3 h-3 text-text-muted transition-transform duration-200',
            open && 'rotate-180'
          )}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          // FIXED v85:
          // - `top-full` (was `mt-2` which adds margin AND uses `end-0` which
          //   is the OPPOSITE side from the trigger in RTL).
          // - `start-0` aligns dropdown to the LEFT edge of the trigger for
          //   LTR. For RTL, this same `start-0` aligns to the right edge —
          //   which is the correct "right below" position in BOTH cases.
          // - `z-[60]` is higher than the sticky header (`z-sticky` is
          //   typically z-30) so the dropdown floats above it.
          // - `mt-1` is the small gap between trigger and dropdown.
          className="absolute start-0 top-full mt-1 min-w-[220px] rounded-xl bg-bg-elevated/95 backdrop-blur-xl border border-edge p-1.5 shadow-2xl origin-top animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ zIndex: 70 }}
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
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-150',
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
