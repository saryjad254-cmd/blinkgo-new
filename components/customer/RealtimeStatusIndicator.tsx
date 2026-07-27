'use client';

/**
 * RealtimeStatusIndicator
 * ───────────────────────
 * v83: small visual cue so the customer knows whether realtime updates
 * are flowing. Without this, a customer on a flaky network sees stale
 * order status for 30+ seconds and has no way to tell whether the
 * page is just slow or whether the connection is broken.
 *
 * Subscribes to a Supabase Realtime channel on the order's id and
 * shows:
 *  - "Live" (green) when subscribed
 *  - "Reconnecting…" (amber) while the channel is reconnecting
 *  - "Offline" (red) after retries are exhausted
 *
 * Renders nothing when all is well so it doesn't take up space.
 */

import { useEffect, useState } from 'react';
import Wifi from 'lucide-react/dist/esm/icons/wifi';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';

type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export function RealtimeStatusIndicator({ orderId }: { orderId: string }) {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let channel: any = null;
    let timer: any = null;

    (async () => {
      try {
        const { createBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserClient();

        channel = supabase
          .channel(`order-status-${orderId}`)
          .on(
            'postgres_changes' as any,
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orders',
              filter: `id=eq.${orderId}`,
            },
            () => {
              if (!cancelled) {
                setState('live');
                setLastUpdate(Date.now());
              }
            },
          )
          .subscribe((status: string) => {
            if (cancelled) return;
            if (status === 'SUBSCRIBED') setState('live');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('reconnecting');
            else if (status === 'CLOSED') setState('offline');
          });

        // Detect "stale" connection: if we haven't received an update
        // for > 60s and the order is in a live status, show reconnecting.
        // (Many networks will keep the WebSocket open but silently drop
        //  messages; this gives the user a hint that polling is now
        // the fallback.)
        timer = setInterval(() => {
          if (cancelled) return;
          if (Date.now() - lastUpdate > 60_000 && state === 'live') {
            setState('reconnecting');
          }
        }, 15_000);
      } catch {
        setState('offline');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (channel) {
        try {
          const { createBrowserClient } = require('@/lib/supabase/client');
          const supabase = createBrowserClient();
          supabase.removeChannel(channel);
        } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (state === 'live') return null; // Don't take up space when all is well

  const map: Record<ConnectionState, { icon: any; className: string; label: string }> = {
    connecting: {
      icon: Loader2,
      className: 'bg-bg-elevated text-text-secondary border-edge',
      label: 'Connecting…',
    },
    reconnecting: {
      icon: Loader2,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      label: 'Reconnecting…',
    },
    offline: {
      icon: WifiOff,
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      label: 'Offline — pull to refresh',
    },
    live: { icon: Wifi, className: '', label: '' },
  };
  const config = map[state];
  const Icon = config.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${config.className}`}
    >
      <Icon className={`w-3 h-3 ${state === 'reconnecting' || state === 'connecting' ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </div>
  );
}
