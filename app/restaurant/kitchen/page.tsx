import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { RestaurantNav } from '@/components/restaurant/RestaurantNav';
import { KitchenView } from '@/components/restaurant/KitchenView';
import { cookies } from 'next/headers';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

// Cache for 30s to reduce Supabase load
export const revalidate = 30;
export const dynamic = 'force-dynamic';

export default async function RestaurantKitchenPage() {
  const user = await requireRole('restaurant');
  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
  const { data: restaurant } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).maybeSingle();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, items, notes, created_at, total, users!orders_customer_id_fkey(name)')
    .eq('restaurant_id', restaurant?.id ?? '')
    .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
    .order('created_at', { ascending: true });
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  const formatted = (orders ?? []).map((o: any) => ({
    ...o,
    customer_name: o.users?.name ?? '—',
  }));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <RestaurantNav />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <KitchenView initialOrders={formatted} />
      </div>
    </div>
  );
}
