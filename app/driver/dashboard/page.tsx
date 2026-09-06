/**
 * Driver Dashboard — Production rebuild
 * ─────────────────────────────────────
 * Modern, focused dashboard inspired by Uber / Wolt driver apps.
 * Shows:
 *   - Online/Offline toggle (big, primary action)
 *   - Today's earnings + week + month
 *   - Active order (if any) with quick actions
 *   - Quick stats (deliveries today, rating, hours online)
 *   - Available orders to accept
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { DriverDashboardClient } from '@/components/driver/DriverDashboardClient';
import { createDriverOfferQuote } from '@/lib/driver/offer-policy';
import { isDriverVerificationComplete } from '@/lib/driver/verification';
import { sanitizeDeliveryPreferences } from '@/lib/delivery-preferences';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EarningsOrder = {
  delivery_fee?: number | null;
  tip?: number | null;
  restaurant_latitude?: number | null;
  restaurant_longitude?: number | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
};

async function loadDriverData(driverId: string) {
  const supabase = createServiceClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setHours(0, 0, 0, 0);
  startOfMonth.setDate(1);

  const dashboardResults = await Promise.all([
    supabase
      .from('drivers')
      .select('id, is_online, is_available, vehicle_type, rating, total_deliveries, current_lat, current_lng')
      .eq('id', driverId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, tip, delivery_fee, payment_method, restaurant_id,
        delivery_address, delivery_instructions, customer_latitude, customer_longitude,
        restaurant_latitude, restaurant_longitude, accepted_at, created_at,
        customer:customer_id(name, phone),
        restaurants:restaurant_id(name, address, phone)
      `)
      .eq('driver_id', driverId)
      .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startOfDay.toISOString()),
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startOfWeek.toISOString()),
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startOfMonth.toISOString()),
    // Available (no driver) orders that the driver can claim
    supabase
      .from('orders')
      .select(`
        id, order_number, total, delivery_fee, tip, delivery_address, driver_id,
        created_at, customer_latitude, customer_longitude,
        restaurant_latitude, restaurant_longitude,
        restaurants:restaurant_id(name, address, latitude, longitude)
      `)
      .is('driver_id', null)
      .eq('fulfillment_type', 'delivery')
      .in('status', ['confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
      .limit(10),
    // Approximate online time today (last 5 minutes worth of location pings)
    supabase
      .from('driver_locations')
      .select('recorded_at')
      .eq('driver_id', driverId)
      .gte('recorded_at', startOfDay.toISOString()),
    supabase
      .from('driver_status')
      .select('latitude, longitude, updated_at, is_online, is_on_delivery, current_order_id')
      .eq('driver_id', driverId)
      .maybeSingle(),
    supabase.from('users').select('is_active,is_verified').eq('id', driverId).maybeSingle(),
    supabase.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', driverId),
  ]);
  let driverResult = dashboardResults[0];
  const activeOrderResult = dashboardResults[1];
  const todayDelivered = dashboardResults[2];
  const weekDelivered = dashboardResults[3];
  const monthDelivered = dashboardResults[4];
  const availableOrders = dashboardResults[5];
  const todayMinutes = dashboardResults[6];
  let driverStatus = dashboardResults[7];
  let publicUserResult = dashboardResults[8];
  let documentsResult = dashboardResults[9];

  // The driver cockpit must not silently switch a courier offline because one
  // critical Supabase read hit a short network interruption. Retry only the
  // identity/verification/live-state reads; order mutations remain single-shot.
  for (const delayMs of [120, 350]) {
    if (!driverResult.error && !driverStatus.error && !publicUserResult.error && !documentsResult.error) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    [driverResult, driverStatus, publicUserResult, documentsResult] = await Promise.all([
      supabase
        .from('drivers')
        .select('id, is_online, is_available, vehicle_type, rating, total_deliveries, current_lat, current_lng')
        .eq('id', driverId)
        .maybeSingle(),
      supabase
        .from('driver_status')
        .select('latitude, longitude, updated_at, is_online, is_on_delivery, current_order_id')
        .eq('driver_id', driverId)
        .maybeSingle(),
      supabase.from('users').select('is_active,is_verified').eq('id', driverId).maybeSingle(),
      supabase.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', driverId),
    ]);
  }

  const verificationRequired = !publicUserResult.data?.is_active
    || !publicUserResult.data?.is_verified
    || !driverResult.data
    || !isDriverVerificationComplete(driverResult.data.vehicle_type, documentsResult.data ?? []);

  const sumEarnings = (orders: EarningsOrder[] | null) => {
    if (!orders) return 0;
    return orders.reduce(
      (s, o) => s + computeEarnings(o).total,
      0,
    );
  };

  const todayEarnings = sumEarnings(todayDelivered.data);
  const weekEarnings = sumEarnings(weekDelivered.data);
  const monthEarnings = sumEarnings(monthDelivered.data);

  const driverLatitude = driverStatus.data?.latitude ?? driverResult.data?.current_lat ?? null;
  const driverLongitude = driverStatus.data?.longitude ?? driverResult.data?.current_lng ?? null;
  const rankedAvailableOrders = (verificationRequired ? [] : (availableOrders.data || []))
    .filter((order: { driver_id?: string | null }) => !order.driver_id)
    .map((order) => ({
      ...order,
      driver_offer: createDriverOfferQuote({ ...order, driver_latitude: driverLatitude, driver_longitude: driverLongitude }),
    }))
    .filter((order) => order.driver_offer.eligible)
    .sort((left, right) => left.driver_offer.score - right.driver_offer.score);

  let activeOrder = activeOrderResult.data as (typeof activeOrderResult.data & {
    delivery_preferences?: ReturnType<typeof sanitizeDeliveryPreferences>;
    arrived_pickup_at?: string | null;
    arrived_dropoff_at?: string | null;
  });
  if (activeOrder?.id) {
    const [{ data: arrivalEvents }, { data: deliveryPreferenceRow }] = await Promise.all([
      supabase
        .from('order_tracking_events')
        .select('event_type, created_at')
        .eq('order_id', activeOrder.id)
        .in('event_type', ['driver_arrived_pickup', 'driver_arrived_dropoff'])
        .order('created_at', { ascending: false }),
      supabase
        .from('order_delivery_preferences')
        .select('preferences')
        .eq('order_id', activeOrder.id)
        .maybeSingle(),
    ]);
    activeOrder = {
      ...activeOrder,
      delivery_preferences: sanitizeDeliveryPreferences(deliveryPreferenceRow?.preferences),
      arrived_pickup_at: arrivalEvents?.find((event) => event.event_type === 'driver_arrived_pickup')?.created_at ?? null,
      arrived_dropoff_at: arrivalEvents?.find((event) => event.event_type === 'driver_arrived_dropoff')?.created_at ?? null,
    };
  }

  return {
    driver: driverResult.data ? {
      ...driverResult.data,
      // driver_status is the authoritative live dispatch state. The profile
      // value remains a compatibility mirror for reports and legacy screens.
      is_online: verificationRequired ? false : Boolean(driverStatus.data?.is_online),
      is_available: verificationRequired
        ? false
        : Boolean(driverStatus.data?.is_online && !driverStatus.data?.is_on_delivery && !driverStatus.data?.current_order_id),
      current_lat: driverLatitude,
      current_lng: driverLongitude,
      // Online duration is derived from location pings until a dedicated
      // shift ledger is introduced; the removed legacy DB column never
      // existed in the canonical schema.
      working_hours_today: 0,
    } : null,
    activeOrder,
    stats: {
      today: { earnings: todayEarnings, deliveries: todayDelivered.data?.length || 0 },
      week: { earnings: weekEarnings, deliveries: weekDelivered.data?.length || 0 },
      month: { earnings: monthEarnings, deliveries: monthDelivered.data?.length || 0 },
    },
    availableOrders: rankedAvailableOrders,
    pingsCount: todayMinutes.data?.length || 0,
    verificationRequired,
  };
}

export default async function DriverDashboardPage() {
  const user = await requireRole(['driver', 'admin', 'super_admin']);
  const data = await loadDriverData(user.id);

  return <DriverDashboardClient initialData={data} userName={user.name || user.email || 'Driver'} />;
}
