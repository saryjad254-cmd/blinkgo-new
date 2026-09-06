/**
 * /driver — Root of the driver portal
 * ─────────────────────────────────────
 * The /driver route group only has sub-pages (dashboard, deliveries, …).
 * Visiting /driver directly without a sub-page falls through to the
 * catch-all not-found and SKIPS the role check in the layout. So we
 * apply the role check explicitly here, and redirect the driver to
 * the dashboard on success.
 */
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DriverIndexPage() {
  // Enforce the role check at the index too. Allow admin/super_admin
  // so operators can view the driver experience.
  await requireRole(['driver', 'admin', 'super_admin']);
  redirect('/driver/dashboard');
}
