import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { OrderCard } from '@/components/orders/OrderCard';

export const dynamic = 'force-dynamic';

/**
 * Orders page — premium, defensive.
 *
 * Fetches the current user's last 50 orders, with restaurant info, and
 * shows them as a list of OrderCard components. The OrderCard shows:
 *   - Restaurant image (or placeholder)
 *   - Restaurant name
 *   - Order date
 *   - Status badge
 *   - Total price
 *   - Reorder / Rate / Help actions
 *
 * If the orders table is missing (migration not applied), or any other
 * DB error occurs, we show the empty state instead of a raw error. This
 * is the correct UX for a fresh install where no orders exist yet.
 */
export default async function OrdersPage() {
  const user = await requireRole('customer');
  const { t, locale } = await getServerTranslations();
  const supabase = createServerClient();

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, subtotal, total, created_at,
      restaurant_id,
      restaurants:restaurant_id (*)
    `)
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const tableMissing =
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (error?.message || '').toLowerCase().includes('does not exist');

  if (error && !tableMissing) {
    return (
      <>
        <PageHeader title={t.nav.orders} back />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <EmptyState
            iconName="AlertCircle"
            title={t.errors?.generic ?? 'Fehler beim Laden'}
            description={error.message}
            action={{
              label: locale === 'ar' ? 'تصفّح المطاعم' : locale === 'en' ? 'Discover restaurants' : 'Restaurants entdecken',
              href: '/restaurants',
            }}
          />
        </div>
      </>
    );
  }

  // Fetch items for each order — uses `product_name` (the actual column)
  const orderIds = (orders ?? []).map((o: any) => o.id);
  let itemMap: Record<string, { count: number; preview: string }> = {};
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, product_name, quantity')
      .in('order_id', orderIds);
    for (const it of items ?? []) {
      const id = (it as any).order_id;
      if (!itemMap[id]) itemMap[id] = { count: 0, preview: '' };
      itemMap[id].count += Number((it as any).quantity || 1);
      if (!itemMap[id].preview) itemMap[id].preview = (it as any).product_name || '';
    }
  }

  const hydratedOrders = (orders ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    total: Number(o.total || 0),
    created_at: o.created_at,
    restaurant: o.restaurants || null,
    item_count: itemMap[o.id]?.count || 0,
    preview_name: itemMap[o.id]?.preview || '',
  }));

  return (
    <>
      <PageHeader
        title={t.nav.orders}
        subtitle={
          hydratedOrders.length
            ? locale === 'ar'
              ? `${hydratedOrders.length} ${hydratedOrders.length === 1 ? 'طلب' : 'طلبات'}`
              : locale === 'en'
              ? `${hydratedOrders.length} ${hydratedOrders.length === 1 ? 'order' : 'orders'}`
              : `${hydratedOrders.length} Bestellungen`
            : ''
        }
        back
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {hydratedOrders.length === 0 ? (
          <EmptyState
            iconName="ShoppingBag"
            title={t.customer.noOrders ?? (locale === 'ar' ? 'لا توجد طلبات بعد' : locale === 'en' ? 'No orders yet' : 'Noch keine Bestellungen')}
            description={
              locale === 'ar'
                ? 'تصفّح المطاعم واطلب وجبتك الأولى'
                : locale === 'en'
                ? 'Discover restaurants and order your first meal'
                : 'Entdecke Restaurants und bestelle deine erste Mahlzeit'
            }
            action={{
              label:
                locale === 'ar'
                  ? 'تصفّح المطاعم'
                  : locale === 'en'
                  ? 'Discover restaurants'
                  : 'Restaurants entdecken',
              href: '/restaurants',
            }}
            action2={{
              label:
                locale === 'ar'
                  ? 'ابحث عن طبق'
                  : locale === 'en'
                  ? 'Search dishes'
                  : 'Gerichte suchen',
              href: '/search',
            }}
          />
        ) : (
          <div className="space-y-3">
            {hydratedOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                locale={locale as 'de' | 'ar' | 'en'}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
