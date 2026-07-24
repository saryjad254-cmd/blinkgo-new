import { requireRole } from '@/lib/rbac';
import { AdminLayout } from '@/components/AdminLayout';
// AddressCard unused from '@/components/shared/AddressCard';
import { DeliveryAddressCard } from '@/components/shared/DeliveryAddressCard';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createServiceClient();
}

async function getOrderDetail(id: string) {
  const admin = getAdminClient();
  const { data: order, error } = await admin
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !order) return null;

  const [customer, restaurant, driver, items] = await Promise.all([
    admin.from('users').select('id, name, email, phone, role').eq('id', order.customer_id).single(),
    admin.from('restaurants').select('id, name, phone').eq('id', order.restaurant_id).single(),
    order.driver_id ? admin.from('users').select('id, name, email, phone').eq('id', order.driver_id).single() : { data: null },
    admin.from('order_items').select('*').eq('order_id', id),
  ]);

  return {
    order,
    customer: customer.data,
    restaurant: restaurant.data,
    driver: driver.data,
    items: items.data || [],
  };
}

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole('admin');
  const data = await getOrderDetail(params.id);

  if (!data) {
    return (
      <AdminLayout user={user}>
        <div className="card text-center">
          <h2 className="text-xl font-bold mb-2">الطلب غير موجود</h2>
          <Link href="/admin/orders" className="btn-primary inline-block mt-4">
            العودة للقائمة
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const { order, customer, restaurant, driver, items } = data;

  return (
    <AdminLayout user={user}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="text-text-muted hover:text-text-secondary">
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-text">
              الطلب {order.order_number || `#${order.id.slice(0, 8)}`}
            </h1>
            <p className="text-sm text-text-secondary">
              {new Date(order.created_at).toLocaleString('de-DE')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="card">
              <h3 className="font-bold mb-3">العناصر</h3>
              {items.length === 0 ? (
                <p className="text-text-muted text-sm">لا توجد عناصر</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-text-muted text-xs">
                    <tr>
                      <th className="text-end py-2">المنتج</th>
                      <th className="text-end py-2">الكمية</th>
                      <th className="text-end py-2">السعر</th>
                      <th className="text-end py-2">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any) => (
                      <tr key={it.id} className="border-t border-edge-light">
                        <td className="py-2">{it.product_name}</td>
                        <td className="py-2">{it.quantity}</td>
                        <td className="py-2">{Number(it.product_price || 0).toFixed(2)}</td>
                        <td className="py-2 font-semibold">{Number(it.subtotal || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h3 className="font-bold mb-3">ملخص مالي</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>المجموع الفرعي</span><span>{Number(order.subtotal || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>رسوم التوصيل</span><span>{Number(order.delivery_fee || 0).toFixed(2)}</span></div>
                {order.service_fee && <div className="flex justify-between"><span>رسوم الخدمة</span><span>{Number(order.service_fee).toFixed(2)}</span></div>}
                {order.tax && <div className="flex justify-between"><span>الضريبة</span><span>{Number(order.tax).toFixed(2)}</span></div>}
                {order.tip && <div className="flex justify-between"><span>البقشيش</span><span>{Number(order.tip).toFixed(2)}</span></div>}
                {order.discount && <div className="flex justify-between text-emerald-400"><span>الخصم</span><span>-{Number(order.discount).toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold pt-2 border-t border-edge">
                  <span>الإجمالي</span>
                  <span>{Number(order.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="font-bold mb-3">الحالة</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-text-muted">حالة الطلب:</span> <span className="font-semibold">{order.status}</span></div>
                <div><span className="text-text-muted">حالة الدفع:</span> <span className="font-semibold">{order.payment_status}</span></div>
                <div><span className="text-text-muted">طريقة الدفع:</span> <span>{order.payment_method || '—'}</span></div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-bold mb-3">الزبون</h3>
              {customer ? (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{customer.name}</div>
                  <div className="text-text-muted">{customer.email}</div>
                  {customer.phone && <div className="text-text-muted" dir="ltr">{customer.phone}</div>}
                </div>
              ) : <p className="text-text-muted text-sm">غير متوفر</p>}
            </div>

            <div className="card">
              <h3 className="font-bold mb-3">المطعم</h3>
              {restaurant ? (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{restaurant.name}</div>
                  {restaurant.phone && <div className="text-text-muted" dir="ltr">{restaurant.phone}</div>}
                </div>
              ) : <p className="text-text-muted text-sm">غير متوفر</p>}
            </div>

            <div className="card">
              <h3 className="font-bold mb-3">السائق</h3>
              {driver ? (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{driver.name}</div>
                  <div className="text-text-muted">{driver.email}</div>
                  {driver.phone && <div className="text-text-muted" dir="ltr">{driver.phone}</div>}
                </div>
              ) : <p className="text-text-muted text-sm">لم يُعيّن بعد</p>}
            </div>

            {order.delivery_address && (
              <DeliveryAddressCard
                address={typeof order.delivery_address === 'string' ? order.delivery_address : (order.delivery_address as any).address}
                lat={order.customer_latitude}
                lng={order.customer_longitude}
                instructions={order.delivery_instructions ?? ''}
                variant="customer"
                title="عنوان التوصيل"
              />
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
