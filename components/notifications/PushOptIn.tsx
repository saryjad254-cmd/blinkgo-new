'use client';
import { motion } from 'framer-motion';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';

import Bell from 'lucide-react/dist/esm/icons/bell';
import X from 'lucide-react/dist/esm/icons/x';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export function PushOptIn() {
  const { t, locale } = useI18n();
  const pathname = usePathname() || '';
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      const capable = Boolean(VAPID_PUBLIC_KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      setSupported(capable);
      if (localStorage.getItem('push-dismissed')) setDismissed(true);
      if (capable) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const existing = await registration?.pushManager.getSubscription();
          if (!cancelled && existing) setSubscribed(true);
        } catch {
          // The opt-in remains available; subscription errors are handled after user action.
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  const subscribe = async () => {
    if (!supported || !VAPID_PUBLIC_KEY || isSubscribing) return;
    setIsSubscribing(true);
    setErrorMessage('');
    try {
      // Request permission
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setErrorMessage(
          locale === 'ar'
            ? 'الإشعارات محظورة في المتصفح. يمكنك تفعيلها من إعدادات الموقع.'
            : locale === 'en'
              ? 'Notifications are blocked in the browser. Enable them in the site settings.'
              : 'Benachrichtigungen sind im Browser blockiert. Bitte in den Website-Einstellungen freigeben.',
        );
        return;
      }
      // Get service worker registration
      const reg = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const vapidKey = VAPID_PUBLIC_KEY;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      const json = sub.toJSON();
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!response.ok) throw new Error('Push subscription could not be saved');
      setSubscribed(true);
      localStorage.setItem('push-dismissed', '1');
    } catch (e) {
      console.error('Push subscription failed', e);
      setErrorMessage(locale === 'ar' ? 'تعذر تفعيل الإشعارات. حاول مرة أخرى.' : locale === 'en' ? 'Notifications could not be enabled. Please try again.' : 'Benachrichtigungen konnten nicht aktiviert werden. Bitte erneut versuchen.');
    } finally {
      setIsSubscribing(false);
    }
  };

  // Operational portals need their controls unobstructed. Push onboarding is
  // intentionally limited to the customer-facing application.
  if (/^\/(admin|driver|restaurant|login|welcome|register|forgot-password|reset-password|auth|legal|coming-soon)(\/|$)/.test(pathname)) return null;
  if (dismissed || !supported) return null;
  if (subscribed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      role="region"
      aria-labelledby="push-opt-in-title"
    >
      <button
        type="button"
        onClick={() => { setDismissed(true); localStorage.setItem('push-dismissed', '1'); }}
        className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-racing-red dark:hover:bg-zinc-800"
        aria-label={locale === 'ar' ? 'إغلاق' : locale === 'en' ? 'Dismiss' : 'Schließen'}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-racing-red to-golden-yellow text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 id="push-opt-in-title" className="font-bold text-ink-1 dark:text-zinc-100">{t.push.title}</h4>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t.push.description}
          </p>
          <button
            type="button"
            onClick={subscribe}
            disabled={isSubscribing}
            aria-busy={isSubscribing}
            className="mt-3 min-h-11 rounded-xl bg-gradient-to-r from-racing-red to-golden-yellow px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-racing-red focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubscribing
              ? locale === 'ar' ? 'جارٍ التفعيل…' : locale === 'en' ? 'Enabling…' : 'Wird aktiviert…'
              : t.push.enable}
          </button>
          {errorMessage && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{errorMessage}</p>}
        </div>
      </div>
    </motion.div>
  );
}
