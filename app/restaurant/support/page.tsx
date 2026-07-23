import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/PageHeader';
import { SupportClient } from '@/components/support/SupportClient';

export const dynamic = 'force-dynamic';

export default async function RestaurantSupportPage() {
  await requireRole('restaurant_owner');
  return (
    <>
      <PageHeader title="Support" back />
      <SupportClient userRole="restaurant_owner" />
    </>
  );
}
