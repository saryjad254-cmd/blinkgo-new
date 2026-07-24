import { Suspense } from 'react';
import ExecutiveDashboardV3 from '@/components/admin/ExecutiveDashboardV3';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Executive Dashboard | BlinkGo',
  description: 'Top-level business KPIs and growth metrics',
};

export default function ExecutivePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ExecutiveDashboardV3 />
    </Suspense>
  );
}
