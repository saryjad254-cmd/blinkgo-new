'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';

import { Bell, BellOff, Check, X } from 'lucide-react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export function PushOptIn() {
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
    // Check if user already dismissed
    const was = localStorage.getItem('push-dismissed');
    if (was) setDismissed(true);
  }, []);

  const subscribe = async () => {
    if (!supported) return;
    try {
      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
      // Get service worker registration
      const reg = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Get VAPID key from server (would need to be implemented)
      // For now, try with a public key
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // No VAPID key — just mark as enabled
        setSubscribed(true);
        localStorage.setItem('push-dismissed', '1');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setSubscribed(true);
      localStorage.setItem('push-dismissed', '1');
    } catch (e) {
      console.error('Push subscription failed', e);
    }
  };

  if (dismissed || !supported) return null;
  if (permission === 'granted' || subscribed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 start-4 z-50 max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        onClick={() => { setDismissed(true); localStorage.setItem('push-dismissed', '1'); }}
        className="absolute end-2 top-2 rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-racing-red to-golden-yellow text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-ink-1 dark:text-zinc-100">{t.push.title}</h4>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t.push.description}
          </p>
          <button
            onClick={subscribe}
            className="mt-3 rounded-xl bg-gradient-to-r from-racing-red to-golden-yellow px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t.push.enable}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
