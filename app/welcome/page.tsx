'use client';

import Link from 'next/link';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Check from 'lucide-react/dist/esm/icons/check';
import Compass from 'lucide-react/dist/esm/icons/compass';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Zap from 'lucide-react/dist/esm/icons/zap';
import { AuthShell, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function WelcomePage() {
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale];

  const benefits = [
    { icon: Zap, label: copy.welcome.speed },
    { icon: Compass, label: copy.welcome.local },
    { icon: ShieldCheck, label: copy.welcome.reliable },
  ];

  return (
    <AuthShell
      eyebrow={copy.welcome.eyebrow}
      title={<>{copy.welcome.title}<br /><span className="text-[#FFC107]">{copy.welcome.accent}</span></>}
      subtitle={copy.welcome.body}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {benefits.map(({ icon: Icon, label }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-[#E10600]/12 text-[#ff3b34]">
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="flex items-center gap-2 text-[13px] font-bold text-white/80">
              <Check className="h-3.5 w-3.5 text-[#FFC107]" aria-hidden="true" />
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-7 space-y-3">
        <Link href="/register" className={authPrimaryButtonClass}>
          {copy.welcome.primary}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <Link href="/login" className={authSecondaryButtonClass}>
          {copy.welcome.secondary}
        </Link>
      </div>
    </AuthShell>
  );
}
