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
import { getApiUserWithRole } from '@/lib/auth-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_NAMES_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

async function getDriverFromRequest(): Promise<{ user: any; profile: any } | null> {
  // SECURITY: Always use the Supabase server client (signature-verified).
  // Role is read from public.users (NEVER from user_metadata).
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, name, role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile) return null;
    if (profile.is_active === false) return null;
    if (profile.role !== 'driver' && profile.role !== 'admin' && profile.role !== 'super_admin') return null;

    return {
      user: { id: user.id, email: user.email ?? profile.email },
      profile,
    };
  } catch {
    return null;
  }
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isInWorkingHours(hours: any[]): boolean {
  if (!hours || hours.length !== 7) return false;
  const now = new Date();
  const day = now.getDay();
  const currentMinutes = getCurrentMinutes();
  const todayHours = hours.find((h) => h.day_of_week === day);
  if (!todayHours || !todayHours.is_enabled) return false;
  const [startH, startM] = todayHours.start_time.split(':').map(Number);
  const [endH, endM] = todayHours.end_time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getDriverFromRequest();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.role !== 'driver' && auth.profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Driver only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const isOnline = !!body.is_online;
    const driverId = auth.user.id;
    const supabase = createServiceClient();

    // Get current user_metadata
    const { data: userData } = await supabase.auth.admin.getUserById(driverId);
    const existingMeta = userData?.user?.user_metadata || {};

    if (isOnline) {
      // ===== GOING ONLINE =====
      // Validate working hours BEFORE allowing online
      let workingHours = existingMeta.working_hours;

      // If no working hours in metadata, try to load from DB
      if (!workingHours || workingHours.length !== 7) {
        try {
          const { data: dbHours } = await supabase
            .from('driver_working_hours')
            .select('*')
            .eq('driver_id', driverId);
          if (dbHours && dbHours.length === 7) {
            workingHours = dbHours.map((h: any) => ({
              day_of_week: h.day_of_week,
              start_time: h.start_time,
              end_time: h.end_time,
              is_enabled: h.is_enabled,
            }));
          }
        } catch {
          // ignore
        }
      }

      if (!workingHours || workingHours.length !== 7) {
        return NextResponse.json({
          ok: false,
          error: 'working_hours_not_set',
          message: 'Keine Arbeitszeiten definiert. Bitte kontaktiere den Administrator.',
          message_ar: 'لم يتم تحديد ساعات العمل. يرجى التواصل مع الأدمن.',
          message_en: 'No working hours defined. Please contact admin.',
        }, { status: 403 });
      }

      if (!isInWorkingHours(workingHours)) {
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

      // Ensure a driver_status row exists (so the order auto-assign can find this driver)
      try {
        await supabase
          .from('driver_status')
          .upsert({
            driver_id: driverId,
            is_online: true,
            is_on_delivery: false,
            current_order_id: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'driver_id' });
      } catch (e) {
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
            if (ds.latitude && ds.longitude) {
              for (const o of readyOrders) {
                if (!o.restaurant_latitude || !o.restaurant_longitude) continue;
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
            } else {
              bestOrderId = readyOrders[0].id;
            }
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
      } catch (e) {
        // Non-fatal — the driver is still online even if auto-dispatch fails
        console.error('Auto-dispatch on go-online failed (non-fatal)', e);
      }

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

      // Update driver_status so the admin map and auto-dispatch no longer
      // consider this driver online. Clear is_on_delivery/current_order_id
      // for safety, in case a previous delivery was interrupted.
      try {
        await supabase
          .from('driver_status')
          .upsert({
            driver_id: driverId,
            is_online: false,
            is_on_delivery: false,
            current_order_id: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'driver_id' });
      } catch (e) {
        // non-fatal
      }

      return NextResponse.json({
        ok: true,
        is_online: false,
        changed_by: 'driver',
      });
    }
  } catch (err: any) {
    console.error('Online toggle error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await getDriverFromRequest();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: userData } = await supabase.auth.admin.getUserById(auth.user.id);
    const meta = userData?.user?.user_metadata || {};
    let isOnline = !!meta.is_online;
    const changedBy = meta.online_changed_by || null;
    const changedAt = meta.online_changed_at || null;

    // SAFETY: if is_online=true but it's not manual or hours changed, force offline
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
        let workingHours = meta.working_hours;
        if (!workingHours || workingHours.length !== 7) {
          try {
            const { data: dbHours } = await supabase
              .from('driver_working_hours')
              .select('*')
              .eq('driver_id', auth.user.id);
            if (dbHours && dbHours.length === 7) {
              workingHours = dbHours.map((h: any) => ({
                day_of_week: h.day_of_week,
                start_time: h.start_time,
                end_time: h.end_time,
                is_enabled: h.is_enabled,
              }));
            }
          } catch {}
        }
        if (!workingHours || !isInWorkingHours(workingHours)) {
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
  } catch (err: any) {
    console.error('Online GET error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
