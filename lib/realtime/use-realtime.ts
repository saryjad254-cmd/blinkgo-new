'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  channels: Array<{
    name: string;
    table: string;
    schema?: string;
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    onChange: (payload: any) => void;
  }>;
  /** When false, the hook doesn't subscribe. Default true. */
  enabled?: boolean;
}

/**
 * useRealtime
 * ───────────
 * Single Supabase Realtime hook for the admin / shared live data.
 * Properly cleans up channels on unmount or when channels change.
 *
 * Subscribes to postgres_changes events on the listed tables.
 *
 * v82 MAJOR fix: previous version suffixed each channel name with
 * `Date.now()` so every re-render with a changed `channels` prop
 * created a brand-new channel without ever releasing the old one.
 * Combined with the JSON.stringify(channels) dep, this leaked a
 * channel per re-render and quickly exhausted the Supabase WebSocket
 * limit (default 100 channels per client). The fix is to use a
 * STABLE channel name keyed by table+filter+event, rely on the
 * removeChannel cleanup, AND debounce the re-subscribe when the
 * channels array changes rapidly (e.g. parent re-renders during
 * scroll). We also re-attach the latest onChange on every event so
 * callers don't need to memoize their callbacks.
 */
export function useRealtime({ channels, enabled = true }: UseRealtimeOptions): void {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold the latest onChange callbacks in a ref so channel subscriptions
  // can read the freshest version without needing to re-subscribe.
  const onChangeMap = useRef<Map<string, (payload: any) => void>>(new Map());
  for (const c of channels) {
    onChangeMap.current.set(`${c.name}|${c.table}|${c.filter ?? ''}|${c.event ?? '*'}`, c.onChange);
  }

  // Stable signature: keys only, no functions. Re-renders that change
  // only the callback identity will NOT trigger a teardown storm.
  const signature = channels
    .map((c) => `${c.name}|${c.table}|${c.filter ?? ''}|${c.event ?? '*'}|${c.schema ?? 'public'}`)
    .sort()
    .join(';');

  useEffect(() => {
    if (!enabled || !channels.length) {
      // Disabled or empty: clean up any previous subscriptions.
      const supabase = createBrowserClient();
      for (const ch of channelsRef.current) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
      }
      channelsRef.current = [];
      return;
    }
    // Debounce so a flurry of re-renders (e.g. parent typing into a
    // search box) does not cause 10+ tear-downs + subscriptions.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const supabase = createBrowserClient();
      for (const ch of channelsRef.current) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
      }
      channelsRef.current = [];
      const newChannels: RealtimeChannel[] = [];
      for (const c of channels) {
        const key = `${c.name}|${c.table}|${c.filter ?? ''}|${c.event ?? '*'}`;
        // STABLE name \u2014 no Date.now() suffix. Supabase dedupes by name.
        const channel = supabase
          .channel(c.name)
          .on(
            'postgres_changes' as any,
            {
              event: c.event ?? '*',
              schema: c.schema ?? 'public',
              table: c.table,
              ...(c.filter ? { filter: c.filter } : {}),
            },
            (payload: any) => {
              // Look up the FRESHEST callback each time, so a new arrow
              // function on the parent doesn't require a re-subscribe.
              const handler = onChangeMap.current.get(key);
              if (handler) {
                try { handler(payload); } catch { /* swallow */ }
              }
            }
          )
          .subscribe();
        newChannels.push(channel);
      }
      channelsRef.current = newChannels;
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const supabase = createBrowserClient();
      for (const ch of channelsRef.current) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
      }
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
}
