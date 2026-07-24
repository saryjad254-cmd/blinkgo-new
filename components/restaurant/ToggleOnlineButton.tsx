'use client';

import { useState, useTransition } from 'react';
import { Power, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { toggleRestaurantOnline } from '@/lib/restaurant-actions';

/**
 * ToggleOnlineButton — restaurant "go online / offline" switch.
 *
 * 3-locale UI so DE/AR/EN users all see labels in their own language.
 * Wrapped as a plain function (the page already memoises surrounding cards).
 */
export function ToggleOnlineButton({
  restaurantId,
  initialActive,
}: {
  restaurantId: string;
  initialActive: boolean;
}) {
  const { locale } = useI18n();
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const labels = {
    stop:
      locale === 'ar' ? 'إيقاف استقبال الطلبات' : locale === 'en' ? 'Stop accepting orders' : 'Bestellungen stoppen',
    start:
      locale === 'ar' ? 'تفعيل استقبال الطلبات' : locale === 'en' ? 'Start accepting orders' : 'Bestellungen annehmen',
    updating:
      locale === 'ar' ? 'جاري التحديث...' : locale === 'en' ? 'Updating...' : 'Wird aktualisiert...',
  };

  function handleToggle() {
    setError(null);
    const next = !active;
    setActive(next);

    startTransition(async () => {
      const result = await toggleRestaurantOnline(next);
      if (!result.ok) {
        setError(result.error);
        setActive(!next);
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={pending}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
          active
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-bg-elevated hover:bg-ink-3 text-text-secondary'
        }`}
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Power className="w-4 h-4" />
        )}
        {active ? labels.stop : labels.start}
      </button>
      {error && (
        <p className="text-xs text-danger mt-2">{error}</p>
      )}
      {pending && !error && (
        <p className="text-xs text-gray-500 mt-2">{labels.updating}</p>
      )}
    </div>
  );
}
