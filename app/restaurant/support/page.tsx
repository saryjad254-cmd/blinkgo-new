import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/PageHeader';
import { SupportClient } from '@/components/support/SupportClient';

export const dynamic = 'force-dynamic';

export default async function RestaurantSupportPage() {
  // F5 fix: 'restaurant_owner' is not a valid role. The AppRole ENUM is
  // 'customer' | 'driver' | 'restaurant' | 'admin' | 'super_admin' | 'manager'.
  // Use 'restaurant' (with admin/super_admin override) matching
  // requireRestaurantId() in lib/rbac.ts.
  await requireRole(['restaurant', 'admin', 'super_admin']);
  return (
    <>
      <PageHeader title="Support" back />
      <SupportClient userRole="restaurant_owner" />
    </>
  );
}
