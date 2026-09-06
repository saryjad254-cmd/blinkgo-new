import { requireRole } from '@/lib/rbac';
import { FavoritesClient } from '@/components/customer/FavoritesClient';

export const dynamic = 'force-dynamic';

/**
 * Favorites page — premium, defensive.
 * If the `favorites` table is missing (PGRST205) or any other DB error
 * occurs, we show the empty state with a friendly message instead of
 * a raw error. The empty state is the correct UX even when the table
 * is missing — there are no favorites to show.
 */
export default async function FavoritesPage() {
  await requireRole('customer');
  return <FavoritesClient />;
}
