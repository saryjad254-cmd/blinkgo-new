import { Suspense } from 'react';
import { requireRole } from '@/lib/rbac';
import ControlCenterV3 from '@/components/admin/ControlCenterV3';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Control Center | BlinkGo Admin',
  description: 'Enterprise admin control center for BlinkGo',
};

export default async function ControlCenterPage() {
  await requireRole('admin');
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ControlCenterV3 />
    </Suspense>
  );
}
