/**
 * Driver Online Status
 * ────────────────────
 * POST: Toggle driver's online status
 *   - Validates working hours before allowing online=true
 *   - Tracks online_changed_by (always 'driver' from this endpoint - manual button press)
 *   - Tracks online_changed_at for offline eligibility check
 * 
 * GET: Returns current online status
 *   - If online=true but out of hours, auto-revert to offline
 *   - This handles edge cases where admin changes hours while driver is online
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { isDriverVerificationComplete } from '@/lib/driver/verification';
import { safeErrorMessage } from '@/lib/api/safe-error';
import {
  isDriverWithinWorkingHours,
  normalizeDriverWorkingHours,
  type DriverWorkingHour,
} from '@/lib/driver/working-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServiceClient = ReturnType<typeof createServiceClient>;
type DriverRole = 'driver' | 'admin' | 'super_admin';

interface DriverAuth {
  user: { id: string; email: string | null };
  profile: {
    id: string;
    email: string | null;
    name: string | null;
    role: DriverRole;
    is_active: boolean;
    is_verified: boolean;
  };
}

async function getDriverFromRequest(): Promise<DriverAuth | null> {
  // SECURITY: Always use the Supabase server client (signature-verified).
  // Role is read from public.users (NEVER from user_metadata).
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, name, role, is_active, is_verified')
      .eq('id', user.id)
      .single();

    if (!profile) return null;
    if (profile.is_active === false) return null;
    if (profile.role !== 'driver' && profile.role !== 'admin' && profile.role !== 'super_admin') return null;

    return {
      user: { id: user.id, email: user.email ?? profile.email },
      profile: profile as DriverAuth['profile'],
    };
  } catch {
    return null;
  }
}

async function loadWorkingHours(client: ServiceClient, driverId: string): Promise<DriverWorkingHour[] | null> {
  const { data, error } = await client
    .from('driver_working_hours')
    .select('day_of_week,start_time,end_time,is_enabled')
    .eq('driver_id', driverId);
  return error ? null : normalizeDriverWorkingHours(data);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getDriverFromRequest();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.role !== 'driver' && auth.profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Driver only' }, { status: 403 });
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).is_online !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'is_online_must_be_boolean' }, { status: 400 });
    }
    const isOnline = (body as { is_online: boolean }).is_online;
    const driverId = auth.user.id;
    const supabase = createServiceClient();

    if (isOnline && auth.profile.role === 'driver') {
      let { data: driverProfile } = await supabase.from('drivers').select('id,user_id,vehicle_type,is_approved,status').eq('user_id', driverId).maybeSingle();
      if (!driverProfile) ({ data: driverProfile } = await supabase.from('drivers').select('id,user_id,vehicle_type,is_approved,status').eq('id', driverId).maybeSingle());
      const { data: documents } = await supabase.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', driverId);
      const evidenceComplete = driverProfile && isDriverVerificationComplete(driverProfile.vehicle_type, documents ?? []);
      if (!auth.profile.is_verified || !driverProfile?.is_approved || driverProfile.status !== 'active' || !evidenceComplete) {
        return NextResponse.json({
          ok: false,
          error: 'driver_verification_required',
          message: 'Ihre Fahrerunterlagen müssen vor der Aktivierung vollständig geprüft werden.',
          message_ar: 'يجب اعتماد جميع مستندات السائق قبل الاتصال واستقبال الطلبات.',
          message_en: 'All driver documents must be approved before going online.',
        }, { status: 403 });
      }
    }

    // Get current user_metadata
    const { data: userData } = await supabase.auth.admin.getUserById(driverId);
    const existingMeta = userData?.user?.user_metadata || {};

    if (isOnline) {
      // ===== GOING ONLINE =====
      // Working hours are authorization data. Never trust user_metadata here;
      // drivers can update their own metadata through Supabase Auth.
      const workingHours = await loadWorkingHours(supabase, driverId);

      if (!workingHours || workingHours.length !== 7) {
        return NextResponse.json({
          ok: false,
          error: 'working_hours_not_set',
          message: 'Keine Arbeitszeiten definiert. Bitte kontaktiere den Administrator.',
          message_ar: 'لم يتم تحديد ساعات العمل. يرجى التواصل مع الأدمن.',
          message_en: 'No working hours defined. Please contact admin.',
        }, { status: 403 });
      }

      if (!isDriverWithinWorkingHours(workingHours)) {
        return NextResponse.json({
          ok: false,
          error: 'outside_working_hours',
          message: 'Sie können sich außerhalb der Arbeitszeiten nicht anmelden. Working hours / ساعات العمل / Working hours are required by the admin.',
          message_ar: 'لا يمكنك الاتصال خارج ساعات العمل.',
          message_en: 'You cannot go online outside working hours.',
        }, { status: 403 });
      }

      // All checks passed - go online
      await supabase.auth.admin.updateUserById(driverId, {
        user_metadata: {
          ...existingMeta,
          is_online: true,
          online_changed_at: new Date().toISOString(),
          online_changed_by: 'driver',  // MANUAL press
          last_online_change: new Date().toISOString(),
        },
      });

      // Preserve an existing assignment when the driver reconnects. The old
      // code reset is_on_delivery/current_order_id to false/null here, which
      // made auto-dispatch assign a second order to an already busy driver.
      try {
        const { data: activeOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('driver_id', driverId)
          .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabase
          .from('driver_status')
          .upsert({
            driver_id: driverId,
            is_online: true,
            is_on_delivery: Boolean(activeOrder),
            current_order_id: activeOrder?.id ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'driver_id' });
      } catch {
        // non-fatal — the order status auto-assign will retry on the next 'ready' transition
      }

      //  AUTO-DISPATCH: When a driver goes online, immediately check for pending
      //  ready orders and assign the closest one to them (if they don't have a
      //  current order already). This ensures drivers don't have to wait on the
      //  available-orders page to receive an order.
      let assignedOrderId: string | null = null;
      try {
        // First, check if this driver already has an active order
        const { data: ds } = await supabase
          .from('driver_status')
          .select('is_on_delivery, current_order_id, latitude, longitude')
          .eq('driver_id', driverId)
          .maybeSingle();
        if (ds && !ds.is_on_delivery && !ds.current_order_id) {
          // Find all ready orders without a driver
          const { data: readyOrders } = await supabase
            .from('orders')
            .select('id, restaurant_id, restaurant_latitude, restaurant_longitude')
            .eq('status', 'ready')
            .is('driver_id', null)
            .order('prepared_at', { ascending: true })
            .limit(20);
          if (readyOrders && readyOrders.length > 0) {
            // Pick closest
            let bestOrderId: string | null = null;
            let bestDistance = Infinity;
            if (Number.isFinite(ds.latitude) && Number.isFinite(ds.longitude)) {
              for (const o of readyOrders) {
                if (!Number.isFinite(o.restaurant_latitude) || !Number.isFinite(o.restaurant_longitude)) continue;
                const R = 6371;
                const dLat = ((ds.latitude - o.restaurant_latitude) * Math.PI) / 180;
                const dLng = ((ds.longitude - o.restaurant_longitude) * Math.PI) / 180;
                const a =
                  Math.sin(dLat / 2) ** 2 +
                  Math.cos((o.restaurant_latitude * Math.PI) / 180) *
                    Math.cos((ds.latitude * Math.PI) / 180) *
                    Math.sin(dLng / 2) ** 2;
                const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                if (dist < bestDistance) {
                  bestDistance = dist;
                  bestOrderId = o.id;
                }
              }
            }
            // GPS is an optimisation, not a prerequisite for dispatch. If no
            // ready order has usable restaurant coordinates, claim the oldest
            // one instead of leaving it permanently unassigned.
            bestOrderId ??= readyOrders[0].id;
            if (bestOrderId) {
              // Atomic assign
              const { data: claimed } = await supabase
                .from('orders')
                .update({ driver_id: driverId, accepted_at: new Date().toISOString() })
                .eq('id', bestOrderId)
                .is('driver_id', null)
                .eq('status', 'ready')
                .select()
                .maybeSingle();
              if (claimed) {
                assignedOrderId = claimed.id;
                // Mark driver as on delivery
                await supabase
                  .from('driver_status')
                  .update({ is_on_delivery: true, current_order_id: bestOrderId })
                  .eq('driver_id', driverId);
                // Notify the driver
                await supabase.from('notifications').insert({
                  user_id: driverId,
                  type: 'new_order_assigned',
                  title: 'Neue Bestellung',
                  body: `Eine Bestellung wurde dir automatisch zugewiesen`,
                  data: {
                    order_id: bestOrderId,
                    auto_dispatched: true,
                    distance_km: bestDistance !== Infinity ? Number(bestDistance.toFixed(2)) : null,
                  },
                  is_read: false,
                });
              }
            }
          }
        }
      } catch (error: unknown) {
        // Non-fatal — the driver is still online even if auto-dispatch fails
        console.error('Auto-dispatch on go-online failed (non-fatal)', error);
      }

      // Keep the legacy profile mirror synchronized for reports and screens
      // that have not yet migrated to driver_status. Dispatch decisions still
      // use driver_status as the authoritative source.
      await supabase
        .from('drivers')
        .update({ is_online: true, is_available: !assignedOrderId })
        .or(`id.eq.${driverId},user_id.eq.${driverId}`);

      return NextResponse.json({
        ok: true,
        is_online: true,
        changed_by: 'driver',
        auto_assigned_order_id: assignedOrderId,
      });
    } else {
      // ===== GOING OFFLINE =====
      // Always allow offline
      await supabase.auth.admin.updateUserById(driverId, {
        user_metadata: {
          ...existingMeta,
          is_online: false,
          online_changed_at: new Date().toISOString(),
          online_changed_by: 'driver',  // MANUAL press
          last_online_change: new Date().toISOString(),
        },
      });

      // v82 fix: if the driver has an in-flight order (picked_up or
      // delivering), do NOT silently clear current_order_id — the order
      // is still the driver's responsibility. We mark the driver as
      // offline in the directory but keep the order assignment, log a
      // tracking event so the admin can see the driver went AWOL
      // mid-delivery, and notify the admin so they can manually
      // re-dispatch the order to another driver.
      let inFlightOrderId: string | null = null;
      try {
        const { data: ds } = await supabase
          .from('driver_status')
          .select('is_on_delivery, current_order_id')
          .eq('driver_id', driverId)
          .maybeSingle();
        inFlightOrderId = (ds?.current_order_id as string | null) ?? null;

        if (ds?.is_on_delivery && inFlightOrderId) {
          // Mark the order so the admin map can highlight it.
          try {
            await supabase.from('order_tracking_events').insert({
              order_id: inFlightOrderId,
              driver_id: driverId,
              event_type: 'driver_went_offline',
              status: 'in_flight',
              metadata: { reason: 'driver_offline_with_active_order' },
            });
          } catch {}
          // Notify all admins so they can re-dispatch.
          try {
            const { data: admins } = await supabase
              .from('users')
              .select('id')
              .in('role', ['admin', 'super_admin', 'manager']);
            if (admins && admins.length) {
              const notifs = admins.map((a) => ({
                user_id: a.id,
                type: 'driver_went_offline',
                title: 'Driver offline mid-delivery',
                body: `Driver went offline with order ${inFlightOrderId}. Re-dispatch needed.`,
                data: { order_id: inFlightOrderId, driver_id: driverId },
                is_read: false,
              }));
              await supabase.from('notifications').insert(notifs);
            }
          } catch {}
        }

        await supabase
          .from('driver_status')
          .upsert({
            driver_id: driverId,
            is_online: false,
            is_on_delivery: !!ds?.is_on_delivery, // KEEP true if a delivery is in flight
            current_order_id: inFlightOrderId,     // KEEP the order id
            updated_at: new Date().toISOString(),
          }, { onConflict: 'driver_id' });
      } catch {
        // non-fatal
      }

      await supabase
        .from('drivers')
        .update({ is_online: false, is_available: false })
        .or(`id.eq.${driverId},user_id.eq.${driverId}`);

      return NextResponse.json({
        ok: true,
        is_online: false,
        changed_by: 'driver',
        in_flight_order_id: inFlightOrderId,
      });
    }
  } catch (err: unknown) {
    console.error('Online toggle error:', err);
    return NextResponse.json({ ok: false, error: safeErrorMessage(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await getDriverFromRequest();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const [{ data: userData }, { data: dispatchStatus }] = await Promise.all([
      supabase.auth.admin.getUserById(auth.user.id),
      supabase.from('driver_status').select('is_online,is_on_delivery,current_order_id').eq('driver_id', auth.user.id).maybeSingle(),
    ]);
    const meta = userData?.user?.user_metadata || {};
    let isOnline = Boolean(dispatchStatus?.is_online);
    const changedBy = meta.online_changed_by || null;
    const changedAt = meta.online_changed_at || null;

    if (auth.profile.role === 'driver') {
      let { data: driverProfile } = await supabase.from('drivers').select('id,user_id,vehicle_type,is_approved,status,is_online').eq('user_id', auth.user.id).maybeSingle();
      if (!driverProfile) ({ data: driverProfile } = await supabase.from('drivers').select('id,user_id,vehicle_type,is_approved,status,is_online').eq('id', auth.user.id).maybeSingle());
      const { data: documents } = await supabase.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', auth.user.id);
      const evidenceComplete = driverProfile && isDriverVerificationComplete(driverProfile.vehicle_type, documents ?? []);
      const verifiedForDispatch = auth.profile.is_verified && driverProfile?.is_approved && driverProfile.status === 'active' && evidenceComplete;
      if (!verifiedForDispatch) {
        isOnline = false;
        await Promise.all([
          supabase.from('driver_status').update({ is_online: false, is_on_delivery: false, current_order_id: null }).eq('driver_id', auth.user.id),
          driverProfile ? supabase.from('drivers').update({ is_online: false, is_available: false, status: 'pending' }).eq('id', driverProfile.id) : Promise.resolve(),
        ]);
      }
    }

    // SAFETY: if the trusted dispatch state is online, the manual action and
    // current working hours must still be valid.
    if (isOnline) {
      // Check 1: must be marked as manual ('driver')
      if (changedBy !== 'driver') {
        // Auto-online - revert
        await supabase.auth.admin.updateUserById(auth.user.id, {
          user_metadata: {
            ...meta,
            is_online: false,
            online_changed_at: new Date().toISOString(),
            online_changed_by: 'system_auto_revert',
          },
        });
        isOnline = false;
      } else {
        // Check 2: must still be within working hours
        const workingHours = await loadWorkingHours(supabase, auth.user.id);
        if (!workingHours || !isDriverWithinWorkingHours(workingHours)) {
          // Out of hours - auto revert
          await supabase.auth.admin.updateUserById(auth.user.id, {
            user_metadata: {
              ...meta,
              is_online: false,
              online_changed_at: new Date().toISOString(),
              online_changed_by: 'system_outside_hours',
            },
          });
          isOnline = false;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      is_online: isOnline,
      changed_by: changedBy,
      changed_at: changedAt,
    });
  } catch (err: unknown) {
    console.error('Online GET error:', err);
    return NextResponse.json({ ok: false, error: safeErrorMessage(err) }, { status: 500 });
  }
}
