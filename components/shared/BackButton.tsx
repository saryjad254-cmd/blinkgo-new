'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Props {
  fallback?: string;
  label?: string;
  className?: string;
}

export function BackButton({ fallback = '/', label, className = '' }: Props) {
  const router = useRouter();
  const { locale } = useI18n();

  const ariaLabel = label || (locale === 'ar' ? 'رجوع' : locale === 'de' ? 'Zurück' : 'Back');

  return (
    <button
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-light text-white transition-all active:scale-95 ${className}`}
      aria-label={ariaLabel}
    >
      <ArrowLeft className={`w-5 h-5 ${locale === 'ar' ? 'rotate-180' : ''}`} />
    </button>
  );
}
