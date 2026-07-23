import { notFound } from 'next/navigation';
import { Phone, MapPin, User as UserIcon, Clock, Navigation } from 'lucide-react';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressCard } from '@/components/shared/AddressCard';
import { DeliveryAddressCard } from '@/components/shared/DeliveryAddressCard';
import { RestaurantOrderActions } from '@/components/restaurant/RestaurantOrderActions';
import type { Order, OrderItem } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

async function getOrder(id: string, restaurantId: string) {
  const supabase = createServerClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total, subtotal, delivery_fee, tax, tip, discount, payment_method, payment_status, delivery_address, delivery_instructions, customer_id, driver_id, customer_latitude, customer_longitude, driver_latitude, driver_longitude, restaurant_latitude, restaurant_longitude, created_at')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single();

  if (error || !order) return null;

  const [{ data: items }, { data: customer }, { data: driver }] = await Promise.all([
    supabase.from('order_items').select('id, product_id, product_name, product_price, quantity, subtotal').eq('order_id', id),
    supabase.from('users').select('name, phone').eq('id', order.customer_id).single(),
    order.driver_id
      ? supabase.from('users').select('name, phone').eq('id', order.driver_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    order: order as unknown as Order,
    items: (items ?? []) as OrderItem[],
    customer,
    driver,
  };
}

export default async function RestaurantOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { restaurantId } = await requireRestaurantId();
  const data = await getOrder(params.id, restaurantId);
  if (!data) notFound();

  const { order, items, customer, driver } = data;
  const { t, locale } = await getServerTranslations();

  // Localized strings (all 3 locales — never hardcoded)
  const labels = {
    status:        locale === 'ar' ? 'الحالة'           : locale === 'en' ? 'Status'        : 'Status',
    total:         locale === 'ar' ? 'الإجمالي'         : locale === 'en' ? 'Total'         : 'Gesamt',
    customer:      locale === 'ar' ? 'الزبون'           : locale === 'en' ? 'Customer'      : 'Kunde',
    call:          locale === 'ar' ? 'اتصال'            : locale === 'en' ? 'Call'          : 'Anrufen',
    driver:        locale === 'ar' ? 'السائق'           : locale === 'en' ? 'Driver'        : 'Fahrer',
    address:       locale === 'ar' ? 'عنوان التوصيل'    : locale === 'en' ? 'Delivery addr.' : 'Lieferadresse',
    itemsCount:    locale === 'ar' ? 'العناصر'          : locale === 'en' ? 'Items'         : 'Artikel',
    discount:      locale === 'ar' ? 'خصم'              : locale === 'en' ? 'Discount'      : 'Rabatt',
    deliveryFee:   locale === 'ar' ? 'رسوم التوصيل'    : locale === 'en' ? 'Delivery fee'  : 'Liefergebühr',
    paymentMethod: locale === 'ar' ? 'طريقة الدفع'      : locale === 'en' ? 'Payment'       : 'Zahlung',
    payCash:       locale === 'ar' ? '💵 نقدي'          : locale === 'en' ? '💵 Cash'       : '💵 Bargeld',
    payCard:       locale === 'ar' ? '💳 بطاقة'         : locale === 'en' ? '💳 Card'       : '💳 Karte',
    payWallet:     locale === 'ar' ? '👛 محفظة'         : locale === 'en' ? '👛 Wallet'     : '👛 Wallet',
    orderPrefix:   locale === 'ar' ? 'طلب'              : locale === 'en' ? 'Order'         : 'Bestellung',
  };

  const dateLocale = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  const dateStr = new Date(order.created_at).toLocaleString(dateLocale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <>
      <PageHeader
        title={`${labels.orderPrefix} #${order.order_number}`}
        subtitle={dateStr}
        back
      />

      <div
        className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-32"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Status & Total */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted mb-1">{labels.status}</p>
            <StatusBadge status={order.status} />
          </div>
          <div className="text-end">
            <p className="text-xs text-text-muted mb-1">{labels.total}</p>
            <p className="text-2xl font-bold text-brand">
              {Number(order.total).toFixed(2)} <span className="text-sm">€</span>
            </p>
          </div>
        </div>

        {/* Customer */}
        {customer && (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-info/15 text-info flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">{labels.customer}</p>
                <p className="font-bold text-text truncate">{customer.name}</p>
              </div>
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-edge hover:border-brand hover:bg-surface-light text-text text-sm font-bold transition-all"
                >
                  <Phone className="w-4 h-4" />
                  {labels.call}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Driver */}
        {driver && (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/15 text-success flex items-center justify-center flex-shrink-0">
                <Navigation className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">{labels.driver}</p>
                <p className="font-bold text-text truncate">{driver.name}</p>
              </div>
              {driver.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-edge hover:border-brand hover:bg-surface-light text-text text-sm font-bold transition-all"
                >
                  <Phone className="w-4 h-4" />
                  {labels.call}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Delivery Address */}
        {typeof order.delivery_address === 'object' && order.delivery_address && (
          <DeliveryAddressCard
            address={(order.delivery_address as any).address ?? ''}
            lat={order.customer_latitude}
            lng={order.customer_longitude}
            instructions={order.delivery_instructions ?? ''}
            contactName={(customer as any)?.name}
            contactPhone={(customer as any)?.phone}
            variant="customer"
            title={labels.address}
          />
        )}

        {/* Items */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
          <h3 className="font-bold text-text mb-3">
            {labels.itemsCount} ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-text-secondary truncate flex-1 min-w-0">
                  <span className="font-bold text-brand me-1">{item.quantity}×</span>
                  {item.product_name}
                </span>
                <span className="font-medium text-text tabular-nums flex-shrink-0">
                  {formatEUR(Number(item.subtotal))}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-edge mt-3 pt-3 space-y-1 text-sm">
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-success">
                <span>{labels.discount}</span>
                <span className="tabular-nums">-{formatEUR(Number(order.discount))}</span>
              </div>
            )}
            <div className="flex justify-between text-text-secondary">
              <span>{labels.deliveryFee}</span>
              <span className="tabular-nums">{formatEUR(Number(order.delivery_fee))}</span>
            </div>
            <div className="flex justify-between font-bold text-text pt-2 border-t border-edge mt-2">
              <span>{labels.total}</span>
              <span className="text-brand tabular-nums">{formatEUR(Number(order.total))}</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">{labels.paymentMethod}</span>
            <span className="font-medium truncate">
              {order.payment_method === 'cash'
                ? labels.payCash
                : order.payment_method === 'stripe'
                ? labels.payCard
                : order.payment_method === 'wallet'
                ? labels.payWallet
                : order.payment_method}
            </span>
          </div>
        </div>

        {/* Order Actions */}
        {['pending', 'confirmed', 'preparing'].includes(order.status) && (
          <div className="fixed bottom-20 md:bottom-6 inset-x-0 px-4 z-20">
            <div className="max-w-3xl mx-auto">
              <RestaurantOrderActions orderId={order.id} currentStatus={order.status} locale={locale as 'ar' | 'de' | 'en'} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
