/**
 * useOnlineStatus
 * ───────────────
 * Subscribe to browser online/offline events.
 * Useful for showing connection status and queuing actions.
 */
'use client';

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  return isOnline;
}
