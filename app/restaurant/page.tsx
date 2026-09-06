/**
 * /restaurant — Root of the restaurant portal
 * ─────────────────────────────────────────────
 * The /restaurant route group only has sub-pages (dashboard, kitchen, …).
 * Visiting /restaurant directly without a sub-page falls through to the
 * catch-all not-found and SKIPS the role check in the layout. So we
 * apply the role check explicitly here, and redirect on success.
 */
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RestaurantIndexPage() {
  await requireRole(['restaurant', 'admin', 'super_admin']);
  redirect('/restaurant/dashboard');
}
