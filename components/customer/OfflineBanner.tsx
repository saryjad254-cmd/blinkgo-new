'use client';

/**
 * Sticky, accessible network-state notice. It disappears automatically when
 * connectivity returns and never changes the server's first render.
 */

import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useI18n } from '@/lib/i18n/I18nProvider';

export function OfflineBanner() {
  const { isOnline, lastOfflineAt } = useOnlineStatus();
  const { locale } = useI18n();

  if (isOnline) return null;

  const message = locale === 'ar'
    ? 'أنت غير متصل — نعرض آخر بيانات محفوظة'
    : locale === 'de'
      ? 'Offline — zuletzt gesehene Ergebnisse werden angezeigt'
      : 'Offline — showing your last saved results';
  const since = locale === 'ar' ? 'منذ' : locale === 'de' ? 'seit' : 'since';
  const timeLocale = locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm font-bold text-warning backdrop-blur-md"
    >
      <WifiOff className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
      <span>
        {message}
        {lastOfflineAt && (
          <span className="opacity-70 ms-2 text-xs font-normal">
            {since} {new Date(lastOfflineAt).toLocaleTimeString(timeLocale)}
          </span>
        )}
      </span>
    </div>
  );
}
