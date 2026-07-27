import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServiceClient();
    const { data, error } = await db.from('restaurants').update({
      name: body.name,
      category: body.category,
      description: body.description,
      address: body.address,
      phone: body.phone,
      delivery_radius_km: body.delivery_radius_km,
      commission_pct: body.commission_pct,
      is_active: body.is_active,
      is_featured: body.is_featured,
    }).eq('id', params.id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });

    await recordAudit({
      actor_id: auth.id,
      action: 'restaurant.update',
      target_type: 'restaurant',
      target_id: params.id,
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ ok: true, restaurant: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
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
