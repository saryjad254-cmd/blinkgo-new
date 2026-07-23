import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';

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
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

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
