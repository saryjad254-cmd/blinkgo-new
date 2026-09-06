'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Download from 'lucide-react/dist/esm/icons/download';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Share from 'lucide-react/dist/esm/icons/share';
import X from 'lucide-react/dist/esm/icons/x';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'blinkgo-pwa-install-dismissed-at';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const COPY = {
  de: { install: 'BlinkGo installieren', installBody: 'Schneller öffnen und Bestellungen direkt vom Startbildschirm verfolgen.', action: 'Installieren', ios: 'Auf dem iPhone: Teilen und dann „Zum Home-Bildschirm“ wählen.', update: 'Neue BlinkGo-Version verfügbar', updateBody: 'Jetzt aktualisieren, um Verbesserungen und Fehlerbehebungen zu erhalten.', refresh: 'Aktualisieren', close: 'Schließen' },
  en: { install: 'Install BlinkGo', installBody: 'Open faster and track orders directly from your home screen.', action: 'Install', ios: 'On iPhone: tap Share, then choose “Add to Home Screen”.', update: 'A new BlinkGo version is available', updateBody: 'Update now to get improvements and fixes.', refresh: 'Update', close: 'Dismiss' },
  ar: { install: 'ثبّت BlinkGo', installBody: 'افتح التطبيق أسرع وتابع طلباتك مباشرة من الشاشة الرئيسية.', action: 'تثبيت', ios: 'على iPhone: اضغط مشاركة ثم اختر «إضافة إلى الشاشة الرئيسية».', update: 'يتوفر إصدار جديد من BlinkGo', updateBody: 'حدّث الآن للحصول على التحسينات والإصلاحات.', refresh: 'تحديث', close: 'إغلاق' },
} as const;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaLifecycle() {
  const pathname = usePathname() || '';
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  const dismissInstall = useCallback(() => {
    setShowInstall(false);
    setShowIosHelp(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hiddenRoute = /^\/(admin|driver|restaurant|login|welcome|register|forgot-password|reset-password|auth|legal)(\/|$)/.test(pathname);
    if (hiddenRoute || isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      window.setTimeout(() => setShowInstall(true), 2500);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setShowInstall(false);
      localStorage.removeItem(DISMISS_KEY);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const iosTimer = isIos ? window.setTimeout(() => setShowIosHelp(true), 3500) : undefined;
    return () => {
      if (iosTimer) window.clearTimeout(iosTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_PWA !== 'true') return;

    let disposed = false;
    const observe = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) setUpdateWorker(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateWorker(worker);
        });
      });
    };
    navigator.serviceWorker.register('/sw.js').then(observe).catch(() => undefined);
    const onControllerChange = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    setShowInstall(false);
    if (choice.outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const applyUpdate = () => updateWorker?.postMessage({ type: 'SKIP_WAITING' });

  if (updateWorker) {
    return (
      <aside className="fixed inset-x-3 bottom-3 z-[240] mx-auto max-w-md rounded-2xl border border-brand-yellow/30 bg-[#111216]/95 p-4 text-white shadow-2xl backdrop-blur-xl" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <Image src="/brand/blinkgo-app-icon-192-v2.png" alt="" width={48} height={48} className="size-12 rounded-xl" />
          <div className="min-w-0 flex-1"><h2 className="font-black">{copy.update}</h2><p className="mt-1 text-xs leading-5 text-white/65">{copy.updateBody}</p></div>
        </div>
        <button type="button" onClick={applyUpdate} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e10600] to-[#ff7a00] px-4 text-sm font-black"><RefreshCw className="size-4" />{copy.refresh}</button>
      </aside>
    );
  }

  if (!showInstall && !showIosHelp) return null;
  return (
    <aside className="fixed inset-x-3 bottom-20 z-[230] mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#111216]/95 p-4 text-white shadow-2xl backdrop-blur-xl md:bottom-4 md:end-4 md:start-auto" aria-labelledby="pwa-install-title">
      <button type="button" onClick={dismissInstall} aria-label={copy.close} className="absolute end-1 top-1 grid size-11 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
      <div className="flex items-start gap-3 pe-8">
        <Image src="/brand/blinkgo-app-icon-192-v2.png" alt="" width={52} height={52} className="size-[52px] rounded-[14px]" />
        <div className="min-w-0"><h2 id="pwa-install-title" className="font-black">{copy.install}</h2><p className="mt-1 text-xs leading-5 text-white/65">{showIosHelp ? copy.ios : copy.installBody}</p></div>
      </div>
      {showInstall && promptEvent && <button type="button" onClick={() => void install()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e10600] to-[#ff7a00] px-4 text-sm font-black"><Download className="size-4" />{copy.action}</button>}
      {showIosHelp && <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#ffc107]/25 bg-[#ffc107]/10 px-4 text-center text-xs font-bold text-[#ffd54a]"><Share className="size-4 shrink-0" />{copy.ios}</div>}
    </aside>
  );
}
