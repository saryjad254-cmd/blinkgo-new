import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminOnboardingClient, type RestaurantOption } from '@/components/admin/AdminOnboardingClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminOnboardingPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireRole('admin');
  const requested = (await searchParams).type;
  const initialType = requested === 'restaurant' || requested === 'product' ? requested : 'driver';
  const db = createServiceClient();
  const { data } = await db.from('restaurants').select('id,name,is_active').order('name').limit(500);
  return <AdminOnboardingClient userName={user.name || user.email || 'Admin'} restaurants={(data ?? []) as RestaurantOption[]} initialType={initialType} />;
}
