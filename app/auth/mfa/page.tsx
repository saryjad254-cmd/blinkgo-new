import { Suspense } from 'react';
import { MfaClient } from './MfaClient';

export const dynamic = 'force-dynamic';

export default function MfaPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-black text-white"><p className="font-bold">BlinkGo Security…</p></main>}>
      <MfaClient />
    </Suspense>
  );
}
