'use client';

import { useEffect, useState } from 'react';
import Wifi from 'lucide-react/dist/esm/icons/wifi';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export function RealtimeStatusIndicator({ orderId }: { orderId: string }) {
  const { locale } = useI18n();
  const [state, setState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let supabase: SupabaseClient | null = null;

    void (async () => {
      try {
        const clientModule = await import('@/lib/supabase/client');
        supabase = clientModule.createBrowserClient();
        channel = supabase
          .channel(`order-status-${orderId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
            () => { if (!cancelled) setState('live'); },
          )
          .subscribe((status: string) => {
            if (cancelled) return;
            if (status === 'SUBSCRIBED') setState('live');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('reconnecting');
            else if (status === 'CLOSED') setState(navigator.onLine ? 'reconnecting' : 'offline');
          });
      } catch {
        if (!cancelled) setState(navigator.onLine ? 'reconnecting' : 'offline');
      }
    })();

    return () => {
      cancelled = true;
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (state === 'live') return null;

  const labels = locale === 'ar'
    ? { connecting: 'جارٍ الاتصال…', reconnecting: 'التحديث التلقائي متوقف مؤقتاً', offline: 'غير متصل — حدّث الصفحة لاحقاً' }
    : locale === 'de'
      ? { connecting: 'Verbindung…', reconnecting: 'Automatische Aktualisierung pausiert', offline: 'Offline — später aktualisieren' }
      : { connecting: 'Connecting…', reconnecting: 'Automatic updates paused', offline: 'Offline — refresh later' };

  const map = {
    connecting: { icon: Loader2, className: 'bg-bg-elevated text-text-secondary border-edge', label: labels.connecting },
    reconnecting: { icon: Loader2, className: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: labels.reconnecting },
    offline: { icon: WifiOff, className: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: labels.offline },
    live: { icon: Wifi, className: '', label: '' },
  } satisfies Record<ConnectionState, { icon: typeof Wifi; className: string; label: string }>;
  const config = map[state];
  const Icon = config.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${config.className}`}
    >
      <Icon className={`w-3 h-3 ${state !== 'offline' ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span>{config.label}</span>
    </div>
  );
}
