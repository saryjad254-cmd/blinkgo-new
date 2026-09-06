'use client';

import { useEffect, useRef, useState } from 'react';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import { useI18n } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: {
    offline: 'Keine Internetverbindung',
    offlineBody: 'Live-Daten und Zahlungen werden fortgesetzt, sobald du wieder verbunden bist.',
    restored: 'Verbindung wiederhergestellt',
  },
  en: {
    offline: 'No internet connection',
    offlineBody: 'Live data and payments will resume when you are connected again.',
    restored: 'Connection restored',
  },
  ar: {
    offline: 'لا يوجد اتصال بالإنترنت',
    offlineBody: 'ستُستأنف البيانات المباشرة وعمليات الدفع عند عودة الاتصال.',
    restored: 'تمت استعادة الاتصال',
  },
} as const;

type BannerState = 'hidden' | 'offline' | 'restored';

export function OfflineBanner() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [state, setState] = useState<BannerState>('hidden');
  const hasBeenOffline = useRef(false);

  useEffect(() => {
    let restoredTimer: number | undefined;

    if (process.env.NODE_ENV !== 'production') {
      const preview = new URLSearchParams(window.location.search).get('networkPreview');
      if (preview === 'offline' || preview === 'restored') {
        hasBeenOffline.current = preview === 'offline';
        const previewTimer = window.setTimeout(() => setState(preview), 0);
        return () => window.clearTimeout(previewTimer);
      }
    }

    const goOffline = () => {
      hasBeenOffline.current = true;
      window.clearTimeout(restoredTimer);
      setState('offline');
    };
    const goOnline = () => {
      if (!hasBeenOffline.current) {
        setState('hidden');
        return;
      }
      setState('restored');
      restoredTimer = window.setTimeout(() => {
        hasBeenOffline.current = false;
        setState('hidden');
      }, 3200);
    };

    if (!navigator.onLine) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.clearTimeout(restoredTimer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (state === 'hidden') return null;
  const restored = state === 'restored';

  return (
    <aside
      role="status"
      aria-live={restored ? 'polite' : 'assertive'}
      className={`fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] z-[225] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 text-white shadow-2xl backdrop-blur-xl motion-safe:animate-slide-down ${
        restored
          ? 'border-emerald-400/30 bg-emerald-950/95'
          : 'border-[#ffc107]/35 bg-[#17130a]/95'
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${restored ? 'bg-emerald-400/15 text-emerald-300' : 'bg-[#ffc107]/15 text-[#ffc107]'}`}
        aria-hidden="true"
      >
        {restored ? <CheckCircle2 className="size-5" /> : <WifiOff className="size-5" />}
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black">{restored ? copy.restored : copy.offline}</strong>
        {!restored && <span className="mt-0.5 block text-xs leading-5 text-white/65">{copy.offlineBody}</span>}
      </span>
    </aside>
  );
}
