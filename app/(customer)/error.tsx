'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BlinkButton } from '@/components/brand';

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[CustomerError]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-red/15 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-brand-red" />
      </div>
      <h2 className="text-xl font-extrabold text-text-primary mb-2">Ein Fehler ist aufgetreten</h2>
      <p className="text-text-secondary mb-6 max-w-md">Wir konnten diese Seite nicht laden. Bitte versuche es erneut.</p>
      <BlinkButton variant="primary" onClick={reset} icon={<RefreshCw className="w-4 h-4" />}>
        Erneut versuchen
      </BlinkButton>
    </div>
  );
}
