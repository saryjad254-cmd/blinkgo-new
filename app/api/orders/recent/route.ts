/**
 * Recent Orders API — for "Order again" section
 * Returns user's recent completed orders (last 30 days)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity(
    secureRoute('lenient', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => recentOrders(r as NextRequest, ctx) as any,
  );
  return (await wrapped(req)) as unknown as NextResponse;
}

async function recentOrders(
  req: NextRequest,
  ctx: { auth: { user: { id: string } } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = getServiceClient();
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);

    // Get recent completed orders with restaurant info
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, status, total, created_at,
        restaurant_id,
        restaurants:restaurant_id(id, name, cover_url, type, delivery_fee, estimated_delivery_time)
      `)
      .eq('customer_id', ctx.auth.user.id)
      .in('status', ['delivered', 'completed'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return ok({ orders: [] });
    }

    // Dedupe by restaurant (keep most recent order per restaurant)
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const o of orders || []) {
      if (!o.restaurant_id || seen.has(o.restaurant_id)) continue;
      seen.add(o.restaurant_id);
      unique.push(o);
    }

    return ok({ orders: unique });
  });
}
