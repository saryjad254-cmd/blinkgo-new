import Link from 'next/link';
import { ShoppingBag, MapPin, ChevronLeft, ChevronRight, Phone, Store as StoreIcon } from 'lucide-react';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { RestaurantOrderCalendar } from '@/components/orders/RestaurantOrderCalendar';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getOrders(restaurantId: string) {
  const supabase = createServerClient();
  // Fetch all orders (50) for this restaurant
  const { data: orders } = await supabase
    .from('orders')
    .select(
      `
      id, order_number, status, total, created_at,
      delivery_address, customer_id, customer_latitude, customer_longitude
    `,
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch customer names + item counts in batch
  const orderIds = (orders ?? []).map((o: any) => o.id);
  const customerIds = (orders ?? []).map((o: any) => o.customer_id).filter(Boolean);
  let customerMap: Record<string, { name: string; phone?: string }> = {};
  let itemMap: Record<string, { count: number; preview: string }> = {};

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, name, quantity')
      .in('order_id', orderIds);
    for (const it of items ?? []) {
      const id = (it as any).order_id;
      if (!itemMap[id]) itemMap[id] = { count: 0, preview: '' };
      itemMap[id].count += (it as any).quantity ?? 1;
      if (!itemMap[id].preview) {
        const qty = (it as any).quantity ?? 1;
        itemMap[id].preview = qty > 1 ? `${qty}× ${(it as any).name}` : (it as any).name;
      }
    }
  }

  // Resolve customer names from users table
  if (customerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, phone')
      .in('id', customerIds);
    for (const u of users ?? []) {
      customerMap[(u as any).id] = { name: (u as any).name, phone: (u as any).phone };
    }
  }

  // Hydrate
  return (orders ?? []).map((o: any) => {
    const customer = customerMap[o.customer_id];
    const items = itemMap[o.id];
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total: Number(o.total),
      created_at: o.created_at,
      customer_id: o.customer_id,
      customer_name: customer?.name,
      customer_phone: customer?.phone,
      delivery_address: o.delivery_address,
      item_count: items?.count,
      item_summary: items?.preview,
    };
  });
}

export default async function RestaurantOrdersPage() {
  const { restaurantId } = await requireRestaurantId();
  const { locale } = await getServerTranslations();
  const orders = await getOrders(restaurantId);

  const titleByLocale: Record<string, string> = { ar: 'الطلبات', de: 'Bestellungen', en: 'Orders' };
  const subtitleByLocale: Record<string, (n: number) => string> = {
    ar: (n) => `${n} طلب`,
    de: (n) => `${n} Bestellung${n === 1 ? '' : 'en'}`,
    en: (n) => `${n} ${n === 1 ? 'order' : 'orders'}`,
  };
  const emptyTitleByLocale: Record<string, string> = { ar: 'لا توجد طلبات', de: 'Keine Bestellungen', en: 'No orders' };
  const emptyDescByLocale: Record<string, string> = {
    ar: 'ستظهر هنا الطلبات فور وصولها',
    de: 'Neue Bestellungen erscheinen hier sofort',
    en: 'New orders will appear here',
  };

  return (
    <>
      <PageHeader
        title={titleByLocale[locale] || titleByLocale.de}
        subtitle={subtitleByLocale[locale]?.(orders.length) || ''}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {orders.length === 0 ? (
          <EmptyState
            iconName="ShoppingBag"
            title={emptyTitleByLocale[locale] || emptyTitleByLocale.de}
            description={emptyDescByLocale[locale] || emptyDescByLocale.de}
          />
        ) : (
          <RestaurantOrderCalendar orders={orders} locale={locale as 'de' | 'ar' | 'en'} />
        )}
      </div>
    </>
  );
}
