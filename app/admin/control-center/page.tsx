import { Suspense } from 'react';
import ControlCenterV3 from '@/components/admin/ControlCenterV3';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Control Center | BlinkGo Admin',
  description: 'Enterprise admin control center for BlinkGo',
};

export default function ControlCenterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ControlCenterV3 />
    </Suspense>
  );
}
