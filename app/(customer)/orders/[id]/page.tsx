import { notFound } from 'next/navigation';
import { Phone, Store as StoreIcon, Receipt, CreditCard } from 'lucide-react';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { OrderTracker } from '@/components/customer/OrderTracker';
import { OrderTimeline } from '@/components/customer/OrderTimeline';
import { CarbonCard } from '@/components/customer/CarbonCard';
import { AddressWithMap } from '@/components/shared/AddressWithMap';
import { DeliveryAddressCard } from '@/components/shared/DeliveryAddressCard';
import { RateOrderTrigger } from '@/components/orders/RateOrderTrigger';
import { OrderPaymentSection } from '@/components/customer/OrderPaymentSection';
import { CancelOrderButton } from '@/components/customer/CancelOrderButton';
import { RefundRequestButton } from '@/components/customer/RefundRequestButton';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import type { Order, OrderItem } from '@/lib/types';
import { formatEUR } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getOrder(id: string): Promise<{ order: Order; items: OrderItem[]; driver: { name: string; phone: string } | null } | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: order, error } = await supabase
    .from('orders')
    .select(`*, restaurants (name, phone, address, latitude, longitude)`)
    .eq('id', id)
    .eq('customer_id', user.id)
    .single();

  if (error || !order) return null;

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id);

  // Fetch driver info from auth.users if assigned
  let driver: { name: string; phone: string } | null = null;
  if (order.driver_id) {
    const { data: driverUser } = await supabase.auth.admin.getUserById(order.driver_id);
    if (driverUser?.user) {
      driver = {
        name: driverUser.user.user_metadata?.name || driverUser.user.email?.split('@')[0] || 'Driver',
        phone: driverUser.user.user_metadata?.phone || driverUser.user.phone || '',
      };
    }
  }

  return {
    order: order as Order,
    items: (items ?? []) as OrderItem[],
    driver,
  };
}

export default async function OrderTrackingPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole('customer');
  const data = await getOrder(params.id);
  if (!data) notFound();

  const { order, items, driver } = data;
  const { t, locale } = await getServerTranslations();

  return (
    <>
      <PageHeader
        title={`${t.customer.orderNumber} ${order.order_number ?? order.id.slice(0, 8)}`}
        subtitle={new Date(order.created_at).toLocaleString(
          locale === 'ar' ? 'ar-IQ' : locale === 'en' ? 'en-US' : 'de-DE'
        )}
        back
        action={['pending', 'confirmed'].includes(order.status) ? (
          <CancelOrderButton orderId={order.id} orderStatus={order.status} />
        ) : undefined}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Timeline — Beautiful Step-by-step Tracker */}
        <OrderTimeline order={order} />

        {/* Real-time WebSocket-style Tracker */}
        <OrderTracker initialOrder={order} />

        {/* Driver info if assigned — premium hero card */}
        {order.driver_id && driver && order.status !== 'delivered' && (
          <div className="card-glass p-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-yellow-500 flex items-center justify-center font-extrabold text-xl text-text shadow-speed-glow">
                🚗
                <span className="absolute -top-1 -end-1 w-3 h-3 rounded-full bg-success border-2 border-bg-elevated">
                  <span className="absolute inset-0 rounded-full bg-success animate-ping-soft opacity-75" />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-text truncate">{driver.name}</p>
                <p className="text-xs text-text-muted flex items-center gap-1">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-success inline-block" />
                  {locale === 'ar' ? 'سائقك' : locale === 'en' ? 'Your driver' : 'Ihr Fahrer'}
                </p>
              </div>
              {driver.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  className="w-11 h-11 rounded-xl bg-success/10 text-success hover:bg-success/20 border border-success/20 flex items-center justify-center transition-all duration-200 ease-silk active:scale-95"
                  aria-label={locale === 'ar' ? 'اتصل بالسائق' : locale === 'en' ? 'Call driver' : 'Fahrer anrufen'}
                >
                  <Phone className="w-5 h-5" strokeWidth={2} />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Restaurant info with map */}
        <div className="card-glass p-4">
          <h3 className="font-extrabold text-text mb-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-red-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand">
              <StoreIcon className="w-4 h-4" strokeWidth={2} />
            </div>
            {order.restaurants?.name ?? (locale === 'ar' ? 'مطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant')}
          </h3>
          <AddressWithMap
            address={(order.restaurants as any)?.address}
            lat={(order.restaurants as any)?.latitude}
            lng={(order.restaurants as any)?.longitude}
            phone={(order.restaurants as any)?.phone}
            variant="restaurant"
            label={t.customer.pickupFrom}
            showNavigation={false}
          />
        </div>

        {/* Order items */}
        <div className="card-glass p-4">
          <h3 className="font-extrabold text-text mb-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center text-info">
              <Receipt className="w-4 h-4" strokeWidth={2} />
            </div>
            {t.customer.items} ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-2 border-b border-edge last:border-0">
                <span className="text-text-secondary flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-surface-elevated text-text font-bold text-xs">{item.quantity}×</span>
                  <span className="text-text font-medium">{item.product_name}</span>
                </span>
                <span className="font-extrabold text-text tabular-nums">
                  {formatEUR(item.subtotal, false)} <span className="text-xs text-text-muted">€</span>
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-edge mt-3 pt-3 space-y-2 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>{t.customer.subtotal}</span>
              <span className="font-semibold text-text tabular-nums">{formatEUR(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>{t.customer.delivery}</span>
              <span className="font-semibold text-text tabular-nums">{formatEUR(Number(order.delivery_fee))}</span>
            </div>
            {Number(order.tip) > 0 && (
              <div className="flex justify-between text-text-secondary">
                <span>{t.customer.tip}</span>
                <span className="font-semibold text-text tabular-nums">{formatEUR(Number(order.tip))}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-text pt-3 mt-2 mt-2 border-t border-edge">
              <span>{t.customer.total}</span>
              <span className="bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active bg-clip-text text-transparent text-lg tabular-nums">{formatEUR(Number(order.total))}</span>
            </div>
          </div>
        </div>

        {/* Carbon Footprint */}
        {items.length > 0 && (
          <CarbonCard
            items={items.map((it) => ({ name: it.product_name, quantity: it.quantity }))}
            orderNumber={order.order_number ?? order.id.slice(0, 8)}
          />
        )}

        {/* Payment section — only for stripe orders awaiting payment */}
        {order.status === 'pending' && order.payment_method === 'stripe' && order.payment_status !== 'paid' ? (
          <div className="card-glass p-4">
            <h3 className="font-extrabold text-text mb-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-red-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand">
                <CreditCard className="w-4 h-4" strokeWidth={2} />
              </div>
              {locale === 'ar' ? 'إتمام الدفع' : locale === 'en' ? 'Complete Payment' : 'Zahlung abschließen'}
            </h3>
            <OrderPaymentSection
              orderId={order.id}
              amount={Number(order.total)}
              paymentMethod={order.payment_method ?? 'cash'}
              paymentStatus={order.payment_status ?? 'pending'}
            />
          </div>
        ) : null}

        {/* Customer delivery address with map */}
        {(() => {
          const da: any = order.delivery_address;
          const addr = typeof da === 'object' && da ? (da.address ?? null) : (typeof da === 'string' ? da : null);
          const lat = typeof da === 'object' && da ? (da.lat ?? null) : null;
          const lng = typeof da === 'object' && da ? (da.lng ?? null) : null;
          const directionsFrom = (order.restaurants as any)?.latitude
            ? { lat: (order.restaurants as any).latitude, lng: (order.restaurants as any).longitude }
            : null;
          return (
            <div className="space-y-3">
              <DeliveryAddressCard
                address={addr}
                lat={lat}
                lng={lng}
                instructions={order.delivery_instructions ?? undefined}
                variant="customer"
                title={t.customer.deliveryTo ?? 'Lieferadresse'}
                directionsFrom={directionsFrom}
              />
            </div>
          );
        })()}

        {/* Refund Request — only for delivered or cancelled */}
        {['delivered', 'cancelled'].includes(order.status) && (
          <div className="card-glass p-4">
            <RefundRequestButton
              orderId={order.id}
              orderStatus={order.status}
              orderTotal={Number(order.total ?? 0)}
              orderCreatedAt={order.created_at}
              locale={locale as 'de' | 'ar' | 'en'}
            />
          </div>
        )}

        {/* Rate Order — only show when delivered */}
        {order.status === 'delivered' && (
          <RateOrderTrigger
            orderId={order.id}
            orderNumber={order.order_number ?? order.id.slice(0, 8)}
            restaurantId={order.restaurant_id}
            driverId={order.driver_id ?? undefined}
            locale={locale as 'de' | 'ar' | 'en'}
          />
        )}
      </div>
    </>
  );
}
