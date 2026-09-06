import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Keep `/admin` as the stable login destination and serve the live dashboard. */
export default async function AdminIndexPage() {
  await requireRole(['admin', 'super_admin', 'manager']);
  redirect('/admin/dashboard');
}
