import { Suspense } from 'react';
import { requireRole } from '@/lib/rbac';
import IntegrationsConsole from '@/components/admin/IntegrationsConsole';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Integrations | BlinkGo Admin',
  description: 'Manage enterprise integrations and automation',
};

export default async function IntegrationsPage() {
  await requireRole('admin');
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <IntegrationsConsole />
    </Suspense>
  );
}
