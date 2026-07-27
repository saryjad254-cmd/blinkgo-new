import { requireRole } from '@/lib/rbac';
import HeatmapClient from './HeatmapClient';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage() {
  // F2 fix: page-level gate (redirects to /login on fail). requireRole
  // applies the admin hierarchy so super_admin/manager also pass.
  await requireRole('admin');

  return <HeatmapClient />;
}
