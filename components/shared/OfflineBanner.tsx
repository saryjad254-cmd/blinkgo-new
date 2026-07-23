/**
 * OfflineBanner
 * ─────────────
 * Shows when the user has lost internet connection.
 * Provides clear feedback that some features won't work.
 */
'use client';

import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { WifiOff } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const t = useT();
  const message = (t as any)?.common?.offline || 'Keine Internetverbindung';

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-banner bg-brand-yellow-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-md motion-safe:animate-slide-down"
    >
      <WifiOff className="w-4 h-4" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
