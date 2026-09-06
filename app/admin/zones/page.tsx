import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminZonesClient, type DeliveryZoneRecord } from '@/components/admin/AdminZonesClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminZonesPage() {
  const user = await requireRole('admin');
  const db = createServiceClient();
  const { data } = await db.from('delivery_zones').select('*').order('priority', { ascending: false }).order('name');
  return <AdminZonesClient initialZones={(data ?? []) as DeliveryZoneRecord[]} userName={user.name || user.email || 'Admin'} />;
}
