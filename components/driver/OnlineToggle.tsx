'use client';

import { useEffect, useState } from 'react';
import { Power, PowerOff, Loader2, Zap } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const LABELS = {
  de: {
    online: 'Du bist online',
    offline: 'Du bist offline',
    goOnline: 'Jetzt online gehen',
    goOffline: 'Jetzt offline gehen',
    onlineDesc: 'Du erhältst neue Bestellungen',
    offlineDesc: 'Aktiviere, um Bestellungen zu erhalten',
    loading: 'Status wird geändert…',
  },
  ar: {
    online: 'أنت متصل',
    offline: 'أنت غير متصل',
    goOnline: 'اتصل الآن',
    goOffline: 'قطع الاتصال',
    onlineDesc: 'ستتلقى طلبات جديدة',
    offlineDesc: 'فعّل الخدمة لتلقي الطلبات',
    loading: 'جاري تغيير الحالة…',
  },
  en: {
    online: 'You are online',
    offline: 'You are offline',
    goOnline: 'Go online',
    goOffline: 'Go offline',
    onlineDesc: 'You will receive new orders',
    offlineDesc: 'Activate to start receiving orders',
    loading: 'Updating status…',
  },
};

export function OnlineToggle({ initialOnline = false }: { initialOnline?: boolean }) {
  const { locale } = useI18n();
  const t = LABELS[locale as keyof typeof LABELS] ?? LABELS.de;
  const [online, setOnline] = useState(initialOnline);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t.offline);

      const { error } = await supabase
        .from('driver_status')
        .upsert({
          driver_id: user.id,
          is_online: !online,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'driver_id',
        });

      if (error) throw error;
      setOnline(!online);
    } catch (err: any) {
      alert(err.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.button
      onClick={toggle}
      disabled={loading}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative w-full overflow-hidden rounded-3xl text-left',
        'transition-all duration-300',
        'border-2',
        online
          ? 'bg-success-gradient border-transparent text-white shadow-glow-success'
          : 'bg-bg-elevated border-edge text-text hover:border-edge-strong',
      )}
    >
      {/* Background pattern when offline */}
      {!online && (
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-text/5 blur-2xl" />
        </div>
      )}

      {/* Pulse when online */}
      {online && (
        <span className="absolute top-5 end-5 flex h-3 w-3">
          <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
      )}

      <div className="relative p-6 flex items-center gap-4">
        <div
          className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0',
            online ? 'bg-white/20' : 'bg-surface-light',
          )}
        >
          {loading ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : online ? (
            <Zap className="w-7 h-7" />
          ) : (
            <PowerOff className="w-7 h-7 text-text-muted" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-base font-black">
            {online ? t.online : t.offline}
          </div>
          <div
            className={cn(
              'text-xs mt-0.5',
              online ? 'text-white/85' : 'text-text-muted',
            )}
          >
            {online ? t.onlineDesc : t.offlineDesc}
          </div>
        </div>

        <div
          className={cn(
            'w-14 h-8 rounded-full flex items-center transition-all duration-300 flex-shrink-0',
            online ? 'bg-white/30 justify-end' : 'bg-surface-light justify-start',
          )}
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 700, damping: 30 }}
            className={cn(
              'w-6 h-6 rounded-full shadow-md',
              online ? 'bg-white' : 'bg-text-secondary',
            )}
          />
        </div>
      </div>
    </motion.button>
  );
}
