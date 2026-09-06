'use client';

import { useState, useCallback, useEffect } from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import Megaphone from 'lucide-react/dist/esm/icons/megaphone';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Props {
  audience: 'customer' | 'driver' | 'restaurant' | 'admin' | 'restaurant_owner';
  initiallyDismissed: boolean;
}

/**
 * Client-side dismissable announcement bar.
 *
 * - Reads initial dismissed state from the server-rendered prop (no hydration mismatch)
 * - Clicking X sets a cookie (so dismissal survives refreshes) and updates state
 * - Cookie lifetime: 1 day (re-appears the next day for returning users)
 * - Keyboard accessible (button + Escape)
 */
export function DismissibleAnnouncement({ audience, initiallyDismissed }: Props) {
  const { locale } = useI18n();
  const [dismissed, setDismissed] = useState(initiallyDismissed);

  const messages = {
    de: {
      customer: 'Live-Verfügbarkeit und Lieferkosten werden vor der Bestellung klar angezeigt.',
      driver: 'Sicher unterwegs: Prüfe vor deiner Schicht Dokumente, Akku und Navigation.',
      restaurant: 'Neue Bestellungen und Statusänderungen erscheinen direkt im Restaurant-Portal.',
      restaurant_owner: 'Neue Bestellungen und Statusänderungen erscheinen direkt im Restaurant-Portal.',
      admin: 'Betriebsstatus und offene Vorgänge regelmäßig prüfen.',
    },
    ar: {
      customer: 'يتم عرض التوفر وتكاليف التوصيل بوضوح قبل تأكيد الطلب.',
      driver: 'قيادة آمنة: تحقق من المستندات والبطارية والملاحة قبل بدء الوردية.',
      restaurant: 'تظهر الطلبات الجديدة وتغييرات الحالة مباشرة في بوابة المطعم.',
      restaurant_owner: 'تظهر الطلبات الجديدة وتغييرات الحالة مباشرة في بوابة المطعم.',
      admin: 'راجع حالة التشغيل والمهام المفتوحة بانتظام.',
    },
    en: {
      customer: 'Live availability and delivery costs are shown clearly before checkout.',
      driver: 'Ride safely: check documents, battery and navigation before your shift.',
      restaurant: 'New orders and status changes appear directly in the restaurant portal.',
      restaurant_owner: 'New orders and status changes appear directly in the restaurant portal.',
      admin: 'Review operating status and open actions regularly.',
    },
  } as const;

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Set a cookie so dismissal persists across page navigations
    const cookieName = `announcement-dismissed-${audience}`;
    const maxAge = 60 * 60 * 24; // 1 day
    document.cookie = `${cookieName}=1; path=/; max-age=${maxAge}; samesite=lax`;
  }, [audience]);

  // Keyboard: Escape dismisses
  useEffect(() => {
    if (dismissed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismissed, handleDismiss]);

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Announcement"
      className={cn(
        'bg-gradient-to-r from-brand-yellow via-brand-yellow-hover to-brand-yellow-active text-brand-black px-4 py-2.5 flex items-center justify-between gap-3 border-b border-brand-yellow-active shadow-sm',
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Megaphone className="w-4 h-4 flex-shrink-0" />
        <p className="text-xs sm:text-sm font-bold truncate">
          {messages[locale][audience]}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="w-6 h-6 rounded-md hover:bg-brand-black/10 active:bg-brand-black/20 transition-colors flex items-center justify-center flex-shrink-0"
        aria-label="Dismiss announcement"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
