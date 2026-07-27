/**
 * Driver Order Acceptance
 * ────────────────────────
 * POST /api/driver/orders/[id]/accept
 *
 * Driver-only. Atomically assigns the driver to an order if:
 *   - driver is online (per user_metadata.is_online)
 *   - order status is one of {confirmed, preparing, ready}
 *   - order has no driver_id yet (prevents double-accept race)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => acceptOrder(ctx, params.id) as any,
  )(_req)) as unknown as NextResponse;
}

async function acceptOrder(
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const user = ctx.auth.user;
    if (!user) throw new AuthenticationError();

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || (profile.role !== 'driver' && profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'manager')) {
      throw new AuthorizationError('Only drivers can accept orders');
    }

    // Check if driver is online (use service client for freshest data)
    const svc = createServiceClient();
    const { data: u } = await svc.auth.admin.getUserById(user.id);
    if (!u?.user?.user_metadata?.is_online) {
      throw new ValidationError('Driver must be online to accept orders', {
        code: 'NOT_ONLINE',
      });
    }

    // Atomic: assign driver to order only if status is one of
    // {confirmed, preparing, ready} and driver_id is null. This prevents
    // two drivers from accepting the same order.
    const { data, error } = await supabase
      .from('orders')
      .update({
        driver_id: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .is('driver_id', null)
      .in('status', ['confirmed', 'preparing', 'ready'])
      .select()
      .single();

    if (error) {
      console.error('[driver/accept] order update error:', error);
      if (error.code === 'PGRST116') {
        throw new ConflictError('This order has already been accepted by another driver', {
          code: 'ALREADY_TAKEN',
        });
      }
      throw new ConflictError('Could not accept this order. Please try again.', {
        code: 'ACCEPT_FAILED',
      });
    }
    if (!data) {
      throw new ConflictError('This order has already been accepted by another driver', {
        code: 'ALREADY_TAKEN',
      });
    }

    await audit('DRIVER_ACCEPTED_ORDER', {
      severity: 'info',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
    });

    return ok({ order: data });
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
