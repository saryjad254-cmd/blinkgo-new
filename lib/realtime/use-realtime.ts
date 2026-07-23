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
 */
export function useRealtime({ channels, enabled = true }: UseRealtimeOptions): void {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const onChangeRef = useRef<typeof channels[number]['onChange'][]>([]);
  onChangeRef.current = channels.map((c) => c.onChange);

  useEffect(() => {
    if (!enabled || !channels.length) return;
    const supabase = createBrowserClient();
    // Tear down any existing
    for (const ch of channelsRef.current) {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    }
    channelsRef.current = [];
    const newChannels: RealtimeChannel[] = [];
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];
      const onChange = onChangeRef.current[i];
      const channel = supabase
        .channel(`${c.name}:${Date.now()}`)
        .on(
          'postgres_changes' as any,
          {
            event: c.event ?? '*',
            schema: c.schema ?? 'public',
            table: c.table,
            ...(c.filter ? { filter: c.filter } : {}),
          },
          (payload: any) => onChange(payload)
        )
        .subscribe();
      newChannels.push(channel);
    }
    channelsRef.current = newChannels;
    return () => {
      for (const ch of newChannels) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore
        }
      }
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(channels), enabled]);
}
