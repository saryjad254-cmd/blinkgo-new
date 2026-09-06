import { Suspense } from 'react';
import { AcceptInviteClient } from './AcceptInviteClient';

export const dynamic = 'force-dynamic';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-black text-white"><p className="font-bold">BlinkGo…</p></main>}>
      <AcceptInviteClient />
    </Suspense>
  );
}
