'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LockKeyhole from 'lucide-react/dist/esm/icons/lock-keyhole';
import Zap from 'lucide-react/dist/esm/icons/zap';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { AUTH_COPY } from './auth-copy';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

export const authInputClass =
  'h-14 w-full rounded-2xl border border-white/14 bg-white/[0.045] px-4 text-[15px] text-white outline-none backdrop-blur-xl transition placeholder:text-white/35 hover:border-white/25 focus:border-[#FFC107] focus:ring-4 focus:ring-[#FFC107]/12 disabled:cursor-not-allowed disabled:opacity-55';

export const authPrimaryButtonClass =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFC107] via-[#ff7600] to-[#E10600] px-5 text-[15px] font-black text-black shadow-[0_16px_42px_rgba(225,6,0,.24)] transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[#FFC107]/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55';

export const authSecondaryButtonClass =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-black/45 px-5 text-[15px] font-bold text-white transition hover:border-white/45 hover:bg-white/[0.06] focus:outline-none focus:ring-4 focus:ring-white/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55';

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { locale, setLocale, dir } = useI18n();
  const copy = AUTH_COPY[locale];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black text-white" dir={dir}>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -start-28 -top-40 h-[420px] w-[420px] rounded-full bg-[#E10600]/12 blur-[110px]" />
        <div className="absolute -bottom-48 -end-20 h-[460px] w-[460px] rounded-full bg-[#FFC107]/8 blur-[120px]" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-8 lg:px-10">
        <Link href="/login" className="group inline-flex min-h-11 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC107]">
          <BlinkLogo variant="horizontal" size="md" />
          <span className="hidden leading-none sm:block">
            <span className="mt-1 hidden text-[9px] font-bold uppercase tracking-[0.19em] text-white/45 sm:block">
              {copy.common.tagline}
            </span>
          </span>
        </Link>

        <label className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-white/18 bg-white/[0.04] px-4 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/30 focus-within:border-[#FFC107] focus-within:ring-4 focus-within:ring-[#FFC107]/10">
          <span className="sr-only">{copy.common.language}</span>
          <span aria-hidden="true">◎</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="cursor-pointer appearance-none bg-transparent pe-4 font-semibold text-white outline-none"
            aria-label={copy.common.language}
          >
            {LOCALES.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#15181D] text-white">
                {option.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute end-3 text-[10px] text-white/45" aria-hidden="true">▾</span>
        </label>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1500px] items-stretch px-5 pb-8 sm:px-8 lg:min-h-[calc(100dvh-77px)] lg:grid-cols-[minmax(520px,1.08fr)_minmax(440px,.92fr)] lg:px-0 lg:pb-0">
        <section className="relative hidden min-h-[690px] overflow-hidden border-e border-white/10 bg-[#050505] lg:flex lg:flex-col lg:justify-end">
          <Image
            src="/brand/blinkgo-welcome-hero-official.png"
            alt="BlinkGo Kurier auf einem Motorroller"
            fill
            priority
            sizes="(max-width: 1024px) 0px, 55vw"
            className="object-contain object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_68%,rgba(0,0,0,.92)_100%)]" />
          <div className="relative z-10 p-8 xl:p-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FFC107]/30 bg-[#FFC107]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#FFD44A]">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.common.tagline}
            </div>
            <h2 className="max-w-xl text-4xl font-black leading-[1.04] tracking-[-0.045em] xl:text-5xl">
              {copy.common.brandPromise}
            </h2>
            <div className="mt-7 flex items-center gap-2 text-sm font-semibold text-white/60">
              <LockKeyhole className="h-4 w-4 text-[#FFC107]" aria-hidden="true" />
              {copy.common.secure}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center py-5 lg:bg-[radial-gradient(circle_at_80%_0%,rgba(225,6,0,.10),transparent_34%)] lg:px-10 lg:py-10 xl:px-16">
          <div className={`w-full ${wide ? 'max-w-[590px]' : 'max-w-[500px]'}`}>
            <div className="mb-7 lg:hidden">
              <div className="relative mb-6 aspect-[16/7.5] overflow-hidden rounded-[24px] border border-white/12 bg-[radial-gradient(circle_at_70%_50%,rgba(225,6,0,.22),transparent_48%),#060606]">
                <div className="absolute inset-0 grid place-items-center p-5">
                  <BlinkLogo variant="horizontal" size="xl" priority />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/14 bg-white/[0.035] p-5 shadow-[0_32px_100px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-8">
              <div className="mb-7">
                <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FFC107]">{eyebrow}</div>
                <h1 className="text-[32px] font-black leading-[1.05] tracking-[-0.045em] sm:text-[40px]">{title}</h1>
                <p className="mt-3 max-w-lg text-[15px] leading-6 text-white/58">{subtitle}</p>
              </div>
              {children}
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-white/38">
              {copy.common.legalPrefix}{' '}
              <Link href="/legal/agb" className="inline-flex min-h-11 items-center underline decoration-white/30 underline-offset-4 transition hover:text-white">{copy.common.terms}</Link>
              {' · '}
              <Link href="/legal/datenschutz" className="inline-flex min-h-11 items-center underline decoration-white/30 underline-offset-4 transition hover:text-white">{copy.common.privacy}</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export function AuthAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const tones = {
    error: 'border-red-400/30 bg-red-500/10 text-red-100',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
    info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
  };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 rounded-2xl border px-4 py-3 text-sm leading-5 ${tones[tone]}`}>{children}</div>;
}

export function FieldLabel({ children, optional }: { children: ReactNode; optional?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-[13px] font-bold text-white/78">
      <span>{children}</span>
      {optional && <span className="text-[11px] font-medium text-white/35">{optional}</span>}
    </span>
  );
}
