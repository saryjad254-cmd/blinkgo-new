'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BlinkButton, BlinkLogo } from '@/components/brand';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="de" dir="ltr">
      <body className="bg-bg text-text-primary">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-bg via-bg-subtle to-bg-elevated">
          <BlinkLogo size="lg" variant="mark" className="mb-6" />
          <div className="w-16 h-16 rounded-2xl bg-brand-red/15 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-brand-red" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary mb-2">Etwas ist schiefgelaufen</h1>
          <p className="text-text-secondary mb-6 max-w-md text-center">Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.</p>
          <BlinkButton variant="primary" size="lg" icon={<RefreshCw className="w-5 h-5" />} onClick={reset}>
            Erneut versuchen
          </BlinkButton>
        </div>
      </body>
    </html>
  );
}
