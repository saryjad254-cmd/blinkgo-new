import Link from 'next/link';
import { Home, Search, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { BlinkButton, BlinkLogo } from '@/components/brand';
import type { ReactNode } from 'react';

interface Props {
  variant?: 'default' | 'share' | 'order' | 'expired';
  title?: string;
  message?: string;
  icon?: ReactNode;
}

const COPY = {
  default: { title: 'Seite nicht gefunden', desc: 'Die gesuchte Seite existiert nicht oder wurde verschoben.' },
  share:   { title: 'Link nicht verfügbar',  desc: 'Dieser geteilte Link ist abgelaufen oder wurde widerrufen.' },
  order:   { title: 'Bestellung nicht verfügbar', desc: 'Diese Bestellung existiert nicht mehr.' },
  expired: { title: 'Abgelaufen',  desc: 'Dieser Link ist abgelaufen.' },
};

const DEFAULT_ICONS = {
  default: <Search className="w-10 h-10 text-brand-red" />,
  share:   <XCircle className="w-10 h-10 text-brand-red" />,
  order:   <AlertTriangle className="w-10 h-10 text-brand-red" />,
  expired: <Clock className="w-10 h-10 text-brand-red" />,
};

export function BrandedNotFound({ variant = 'default', title, message, icon }: Props) {
  const c = COPY[variant];
  const displayTitle = title || c.title;
  const displayDesc = message || c.desc;
  const displayIcon = icon || DEFAULT_ICONS[variant];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-bg via-bg-subtle to-bg-elevated text-text-primary">
      <BlinkLogo size="lg" variant="mark" className="mb-6" />
      <div className="w-20 h-20 rounded-3xl bg-brand-red/15 flex items-center justify-center mb-4">
        {displayIcon}
      </div>
      <h1 className="text-2xl font-extrabold mb-2">{displayTitle}</h1>
      <p className="text-text-secondary mb-8 text-center max-w-md">{displayDesc}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/">
          <BlinkButton variant="primary" icon={<Home className="w-4 h-4" />}>Startseite</BlinkButton>
        </Link>
      </div>
    </div>
  );
}
