import { Suspense } from 'react';
import { requireRole } from '@/lib/rbac';
import ExecutiveDashboardV3 from '@/components/admin/ExecutiveDashboardV3';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Executive Dashboard | BlinkGo',
  description: 'Top-level business KPIs and growth metrics',
};

export default async function ExecutivePage() {
  await requireRole('admin');
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ExecutiveDashboardV3 />
    </Suspense>
  );
}
