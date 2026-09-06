/**
 * Driver Order Delivery Confirmation
 * ───────────────────────────────────
 * POST /api/driver/orders/[id]/complete
 * Body: { delivery_photo?: string (base64 or URL) }
 *
 * Marks the order as 'delivered' when the driver hands it to the customer.
 * Sets delivered_at timestamp, optional delivery_photo for proof of delivery.
 *
 * Side effects:
 *  - Updates order status to 'delivered' + delivered_at
 *  - Frees the driver (driver_status.is_on_delivery = false)
 *  - Triggers loyalty points award (DB trigger)
 *  - Sends customer + restaurant notifications
 *
 * Driver-only. Driver must be the assigned driver for this order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { withSecurity, HandlerContext } from '@/lib/api/security';
import { verifyDeliveryPin } from '@/lib/services/delivery-pin';
import { sanitizeDeliveryPreferences } from '@/lib/delivery-preferences';
import { DELIVERY_PROOF_BUCKET, deliveryEvidencePolicy, parseDeliveryPhoto } from '@/lib/driver/delivery-outcome-policy';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM = ['picked_up', 'delivering'];

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  return withErrorHandling(async () => {
    // v81 SECURITY: wrapped in withSecurity so the driver role + JWT
    // signature are verified centrally. The inner authorisation check
    // (driver_id === user.id) is preserved.
    const wrapped = withSecurity(
      { roles: ['driver', 'admin', 'super_admin'] },
      async (ctx: HandlerContext) => {
        const supabase = createServiceClient();
        const orderId = params.id;

        // 2) Parse body (optional delivery photo). v81: cap base64
        //    payload at 100KB to avoid abuse (500KB was overly
        //    generous for a proof-of-delivery image).
        const body = await ctx.req.json().catch(() => ({}));
        const deliveryPin = typeof body.delivery_pin === 'string' ? body.delivery_pin.trim() : '';
        let deliveryPhoto: ReturnType<typeof parseDeliveryPhoto> = null;
        try {
          deliveryPhoto = parseDeliveryPhoto(body.delivery_photo);
        } catch (photoError) {
          throw new ValidationError(photoError instanceof Error ? photoError.message : 'DELIVERY_PHOTO_INVALID');
        }

        // 3) Load order
        const { data: order, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        if (error || !order) throw new NotFoundError('Order');

        // 4) Verify driver owns the order
        if (order.driver_id !== ctx.auth.user.id) {
          throw new AuthorizationError('You are not the assigned driver');
        }

        // 5) Verify state transition is valid
        if (!ALLOWED_FROM.includes(order.status)) {
          throw new ConflictError(
            `Cannot complete order in status: ${order.status}`,
            { meta: { current_status: order.status }, code: 'INVALID_TRANSITION' },
          );
        }

        const [{ data: dropoffArrival }, { data: preferenceRow }] = await Promise.all([
          supabase.from('order_tracking_events').select('id').eq('order_id', orderId).eq('event_type', 'driver_arrived_dropoff').limit(1).maybeSingle(),
          supabase.from('order_delivery_preferences').select('preferences').eq('order_id', orderId).maybeSingle(),
        ]);
        const preferences = sanitizeDeliveryPreferences(preferenceRow?.preferences);
        const evidencePolicy = deliveryEvidencePolicy(preferences.handoff, Boolean(dropoffArrival));
        if (!dropoffArrival) throw new ValidationError('Record arrival at the customer before completing delivery');
        if (evidencePolicy.pinRequired && !verifyDeliveryPin({ orderId, customerId: order.customer_id, createdAt: order.created_at }, deliveryPin)) {
          throw new ValidationError('Invalid delivery PIN');
        }
        if (evidencePolicy.photoRequired && !deliveryPhoto) {
          throw new ValidationError('A delivery photo is required for leave-at-door orders');
        }

        // 6) Atomic update (only if still in expected state)
        const proofPath = deliveryPhoto ? `${orderId}/${Date.now()}-${crypto.randomUUID()}.${deliveryPhoto.extension}` : null;
        if (deliveryPhoto && proofPath) {
          const { error: uploadError } = await supabase.storage.from(DELIVERY_PROOF_BUCKET).upload(proofPath, deliveryPhoto.bytes, {
            contentType: deliveryPhoto.mimeType,
            cacheControl: '0',
            upsert: false,
          });
          if (uploadError) throw new ConflictError('Delivery proof upload failed', { code: 'PROOF_UPLOAD_FAILED' });
        }
        const { data: updatedRow, error: updErr } = await supabase
          .rpc('complete_driver_delivery', {
            p_order_id: orderId,
            p_driver_id: ctx.auth.user.id,
            p_proof_path: proofPath,
            p_proof_mime_type: deliveryPhoto?.mimeType ?? null,
            p_proof_byte_size: deliveryPhoto?.bytes.byteLength ?? null,
          })
          .single();
        if (updErr || !updatedRow) {
          if (proofPath) await supabase.storage.from(DELIVERY_PROOF_BUCKET).remove([proofPath]).catch(() => undefined);
          throw new ConflictError('Order state changed — please refresh');
        }
        const updated = updatedRow as { order_number: string; restaurant_id: string; [key: string]: unknown };

        // 8) Log tracking event
        try {
          await supabase.from('order_tracking_events').insert({
            order_id: orderId,
            driver_id: ctx.auth.user.id,
            event_type: 'status_change',
            status: 'delivered',
            metadata: { has_photo: Boolean(deliveryPhoto), delivery_pin_verified: evidencePolicy.pinRequired, handoff: preferences.handoff, proof_retention_days: deliveryPhoto ? 30 : null },
          });
        } catch (e) {
          logger.warn('Tracking event insert failed (non-fatal)', { orderId }, e);
        }

        // 9) Notify customer
        try {
          await supabase.from('notifications').insert({
            user_id: order.customer_id,
            type: 'delivered',
            title: 'Bestellung geliefert!',
            body: `Ihre Bestellung #${updated.order_number} wurde geliefert. Guten Appetit!`,
            data: { order_id: orderId, order_number: updated.order_number },
            is_read: false,
          });
        } catch (e) {
          logger.warn('Customer notification failed (non-fatal)', { orderId }, e);
        }

        // 10) Notify restaurant
        try {
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('owner_id')
            .eq('id', updated.restaurant_id)
            .single();
          if (restaurant?.owner_id) {
            await supabase.from('notifications').insert({
              user_id: restaurant.owner_id,
              type: 'delivered',
              title: 'Bestellung geliefert',
              body: `Bestellung #${updated.order_number} wurde erfolgreich zugestellt`,
              data: { order_id: orderId, order_number: updated.order_number },
              is_read: false,
            });
          }
        } catch (e) {
          logger.warn('Restaurant notification failed (non-fatal)', { orderId }, e);
        }

        return ok({ order: updated });
      },
    );
    return wrapped(req);
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
