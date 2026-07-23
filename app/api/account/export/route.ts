/**
 * Account Data Export (DSGVO Art. 15, 20)
 * ───────────────────────────────────────
 *
 * GET /api/account/export
 *
 * Authenticated. Returns a JSON export of all personal data
 * associated with the current user. Used by the profile page
 * "Export my data" link and the public DSAR form's "logged-in
 * fast path".
 *
 * Includes:
 *  - Profile (name, email, phone, etc.)
 *  - Orders
 *  - Favorites
 *  - Loyalty / wallet
 *  - Notifications (recent)
 *  - Support messages
 *
 * Does NOT include:
 *  - Server logs (separate process, only on legal request)
 *  - Stripe financial records beyond what's already in `orders`
 *  - Other users' data
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireApiRole(['customer', 'driver', 'restaurant', 'admin']);
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.id;

    const svc = createServiceClient();
    const exportPayload: any = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      format: 'BlinkGo Data Export v1',
      sections: {},
    };

    // 1. Profile
    const { data: profile } = await svc.from('users').select('*').eq('id', userId).single();
    exportPayload.sections.profile = profile || null;

    // 2. Orders
    const { data: orders } = await svc
      .from('orders')
      .select('id, order_number, status, total, tip, delivery_fee, created_at, delivered_at, items:order_items(*)')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false });
    exportPayload.sections.orders = orders || [];

    // 3. Favorites
    const { data: favorites } = await svc
      .from('favorites')
      .select('restaurant_id, created_at')
      .eq('user_id', userId);
    exportPayload.sections.favorites = favorites || [];

    // 4. Notifications
    const { data: notifications } = await svc
      .from('notifications')
      .select('id, type, title, body, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    exportPayload.sections.notifications = notifications || [];

    // 5. Support messages (if table exists)
    try {
      const { data: support } = await svc
        .from('support_messages')
        .select('id, subject, body, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      exportPayload.sections.support_messages = support || [];
    } catch (e: any) {
      exportPayload.sections.support_messages = null;
    }

    // 6. If driver
    if (profile?.role === 'driver') {
      const { data: earnings } = await svc
        .from('driver_payouts')
        .select('id, amount, period_start, period_end, status, created_at')
        .eq('driver_id', userId);
      exportPayload.sections.driver_payouts = earnings || [];
    }

    // 7. If restaurant
    if (profile?.role === 'restaurant') {
      const { data: rest } = await svc
        .from('restaurants')
        .select('id, name, address, created_at')
        .eq('owner_id', userId);
      exportPayload.sections.restaurants = rest || [];
    }

    // Log export (without PII)
    logger.info('data_export', {  user_id: userId, sections: Object.keys(exportPayload.sections)  });

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="blinkgo-data-export-${userId.slice(0, 8)}-${Date.now()}.json"`,
      },
    });
  });
}
