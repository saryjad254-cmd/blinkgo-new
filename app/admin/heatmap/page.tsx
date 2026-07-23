import { requireApiRole } from '@/lib/auth-helper';
import HeatmapClient from './HeatmapClient';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage() {
  // Verify admin
  await requireApiRole(['admin', 'super_admin']);

  return <HeatmapClient />;
}
