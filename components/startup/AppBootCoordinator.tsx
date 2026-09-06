'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, RotateCcw, WifiOff } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { OFFICIAL_BLINKGO_LOGO_SRC } from '@/components/brand/brand-assets';

type Locale = 'de' | 'ar' | 'en';
type BootPhase = 'running' | 'ready' | 'degraded';

type BootTask = {
  key: 'preferences' | 'network' | 'session' | 'platform' | 'assets';
  weight: number;
  run: () => Promise<void>;
};

const COPY = {
  de: { title: 'BlinkGo wird gestartet', subtitle: 'Schnell. Zuverlässig. Für dich.', preferences: 'Sprache und Darstellung', network: 'Sichere Verbindung', session: 'Sitzung wird geprüft', platform: 'Dienste werden verbunden', assets: 'Oberfläche wird vorbereitet', ready: 'Bereit für deine nächste Lieferung', degraded: 'Einige Dienste sind momentan eingeschränkt.', retry: 'Erneut prüfen', continue: 'App öffnen' },
  en: { title: 'Starting BlinkGo', subtitle: 'Fast. Reliable. For you.', preferences: 'Language and appearance', network: 'Secure connection', session: 'Checking your session', platform: 'Connecting services', assets: 'Preparing the experience', ready: 'Ready for your next delivery', degraded: 'Some services are temporarily limited.', retry: 'Check again', continue: 'Open app' },
  ar: { title: 'يتم تشغيل BlinkGo', subtitle: 'سريع. موثوق. من أجلك.', preferences: 'اللغة والمظهر', network: 'الاتصال الآمن', session: 'التحقق من الجلسة', platform: 'ربط خدمات التطبيق', assets: 'تجهيز تجربة الاستخدام', ready: 'جاهز لتوصيلتك التالية', degraded: 'بعض الخدمات محدودة مؤقتًا.', retry: 'إعادة التحقق', continue: 'فتح التطبيق' },
} as const;

const MINIMUM_VISIBLE_MS = 900;
const REQUEST_TIMEOUT_MS = 4500;
const BOOT_SESSION_KEY = 'blinkgo-boot-complete-v1';

function request(url: string) {
  return fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).then((response) => {
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  });
}

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function AppBootCoordinator({ children, locale }: { children: ReactNode; locale: Locale }) {
  const copy = COPY[locale];
  const reduceMotion = useReducedMotion();
  const mounted = useRef(true);
  const dismissTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<BootPhase>('running');
  const [progress, setProgress] = useState(0);
  const [activeTask, setActiveTask] = useState<keyof typeof copy>('preferences');
  const [completed, setCompleted] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [visible]);

  const tasks = useMemo<BootTask[]>(() => [
    { key: 'preferences', weight: 10, run: async () => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; await document.fonts?.ready; } },
    { key: 'network', weight: 10, run: async () => { if (!navigator.onLine) throw new Error('offline'); await request('/api/health/live'); } },
    { key: 'session', weight: 25, run: () => request('/api/auth/me') },
    { key: 'platform', weight: 30, run: () => request('/api/health/ready') },
    { key: 'assets', weight: 25, run: () => Promise.all([preloadImage(OFFICIAL_BLINKGO_LOGO_SRC), preloadImage('/brand/blinkgo-official-loader-rider-transparent.png')]).then(() => undefined) },
  ], [locale]);

  const start = useCallback(async () => {
    const startedAt = Date.now();
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    setPhase('running'); setProgress(0); setCompleted([]); setFailed([]);
    const failures: string[] = [];
    let finishedWeight = 0;

    for (const task of tasks) {
      if (!mounted.current) return;
      setActiveTask(task.key);
      try {
        await task.run();
        if (mounted.current) setCompleted((items) => [...items, task.key]);
      } catch {
        failures.push(task.key);
        if (mounted.current) setFailed((items) => [...items, task.key]);
      } finally {
        finishedWeight += task.weight;
        if (mounted.current) setProgress(finishedWeight);
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - startedAt))));
    if (!mounted.current) return;
    // The startup sequence is a session bootstrap, not a route transition.
    // Remember it for this browser tab so normal navigation never replays the
    // splash screen or repeatedly calls health/auth endpoints.
    window.sessionStorage.setItem(BOOT_SESSION_KEY, '1');
    setPhase(failures.length ? 'degraded' : 'ready');
    setActiveTask(failures.length ? 'degraded' : 'ready');
    dismissTimer.current = window.setTimeout(() => mounted.current && setVisible(false), failures.length ? 3200 : 450);
  }, [tasks]);

  useEffect(() => {
    const bootAlreadyCompleted = window.sessionStorage.getItem(BOOT_SESSION_KEY) === '1';
    const timer = window.setTimeout(() => {
      if (bootAlreadyCompleted) setVisible(false);
      else void start();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [start]);

  return <>
    <div aria-hidden={visible || undefined} inert={visible ? true : undefined}>{children}</div>
    <AnimatePresence>
      {visible ? <motion.div key="blinkgo-boot" initial={false} animate={{ opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.015 }} className="fixed inset-0 z-[9999] grid min-h-[100dvh] place-items-center overflow-hidden bg-[#030303] text-white" role="status" aria-live="polite" aria-busy={phase === 'running'}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(139,0,0,.28),transparent_42%),linear-gradient(135deg,#020202_0%,#090303_55%,#020202_100%)]" />
        <motion.div aria-hidden="true" className="absolute left-[-20%] top-[18%] h-24 w-[140%] -skew-y-6 bg-gradient-to-r from-transparent via-[#E10600]/15 to-transparent blur-2xl" animate={reduceMotion ? undefined : { x: ['-8%', '8%', '-8%'] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="relative z-10 flex min-h-[100dvh] w-full max-w-xl flex-col items-center justify-between px-6 py-[7dvh] text-center">
          <BlinkLogo variant="horizontal" size="3xl" priority className="drop-shadow-[0_0_32px_rgba(225,6,0,.2)]" />
          <div className="w-full rounded-[1.75rem] border border-white/10 bg-black/78 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
            <div className="flex items-end justify-between gap-4 text-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/45">{copy.title}</p><p className="mt-1 min-h-6 text-sm font-bold text-white/90">{copy[activeTask]}</p></div><span className="tabular-nums text-2xl font-black text-[#FFC107]">{progress}%</span></div>
            <div className="relative mt-5 h-3 overflow-visible rounded-full bg-white/10" aria-label={`${progress}%`}>
              <motion.div className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-[#E10600] via-[#FF6A00] to-[#FFC107] shadow-[0_0_20px_rgba(255,193,7,.45)]" animate={{ width: `${progress}%` }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }} />
              <motion.div className="absolute top-1/2 h-14 w-20 -translate-y-1/2 overflow-hidden drop-shadow-[0_0_14px_rgba(255,193,7,.55)]" animate={{ insetInlineStart: `clamp(-1rem, calc(${progress}% - 2.5rem), calc(100% - 4rem))` }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }} aria-hidden="true"><Image src="/brand/blinkgo-official-loader-rider-transparent.png" alt="" width={120} height={105} priority className="h-full w-full object-contain object-left" /></motion.div>
            </div>
            <div className="mt-6 grid grid-cols-5 gap-2" aria-hidden="true">{tasks.map((task) => { const isDone = completed.includes(task.key); const hasFailed = failed.includes(task.key); return <div key={task.key} className="flex flex-col items-center gap-2"><span className={`grid size-7 place-items-center rounded-full border ${isDone ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : hasFailed ? 'border-amber-400/50 bg-amber-500/15 text-amber-300' : 'border-white/10 bg-white/5 text-white/30'}`}>{isDone ? <Check className="size-4" /> : hasFailed ? <AlertTriangle className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span></div>; })}</div>
            {phase === 'degraded' ? <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-start"><p className="flex items-center gap-2 text-sm font-bold text-amber-100"><WifiOff className="size-4" />{copy.degraded}</p><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => void start()} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]"><RotateCcw className="me-2 inline size-4" />{copy.retry}</button><button type="button" onClick={() => setVisible(false)} className="min-h-11 rounded-xl bg-gradient-to-r from-[#E10600] to-[#FF6A00] px-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]">{copy.continue}</button></div></div> : null}
          </div>
        </div>
      </motion.div> : null}
    </AnimatePresence>
  </>;
}
