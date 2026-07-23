/**
 * Recent Orders API — for "Order again" section
 * Returns user's recent completed orders (last 30 days)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const ss = createServerClient();
    const { data: { user } } = await ss.auth.getUser();
    if (!user) throw new AuthenticationError('Login required');

    const supabase = getServiceClient();
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);

    // Get recent completed orders with restaurant info
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, status, total, created_at,
        restaurant_id,
        restaurants:restaurant_id(id, name, cover_url:image_url, type, delivery_fee, estimated_delivery_time)
      `)
      .eq('customer_id', user.id)
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
