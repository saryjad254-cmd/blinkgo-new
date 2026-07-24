import Link from 'next/link';
import { Home, Search, MapPin } from 'lucide-react';
import { BlinkButton } from '@/components/brand';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-9xl font-black text-brand-red mb-2 tracking-tighter">404</div>
        <h1 className="text-2xl font-extrabold text-text-primary mb-3">Seite nicht gefunden</h1>
        <p className="text-text-secondary mb-8 leading-relaxed">
          Die gesuchte Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <BlinkButton variant="primary" icon={<Home className="w-4 h-4" />}>
              Startseite
            </BlinkButton>
          </Link>
          <Link href="/search">
            <BlinkButton variant="outlined" icon={<Search className="w-4 h-4" />}>
              Suchen
            </BlinkButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
