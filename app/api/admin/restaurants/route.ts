import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    const { data, error } = await db.from('restaurants')
      .select('id, name, category, rating, total_orders, is_active, is_featured, address, phone')
      .order('name')
      .limit(200);
    if (error) return NextResponse.json({ ok: false, error: error.message, restaurants: [] }, { status: 200 });
    return NextResponse.json({ ok: true, restaurants: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed', restaurants: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServiceClient();
    const { data, error } = await db.from('restaurants').insert({
      name: body.name,
      category: body.category,
      description: body.description,
      address: body.address,
      phone: body.phone,
      delivery_radius_km: body.delivery_radius_km || 5,
      commission_pct: body.commission_pct || 15,
      is_active: body.is_active ?? true,
      is_featured: body.is_featured ?? false,
    }).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    await recordAudit({
      actor_id: auth.id,
      action: 'restaurant.create',
      target_type: 'restaurant',
      target_id: data.id,
      metadata: { name: body.name, category: body.category },
    });

    return NextResponse.json({ ok: true, restaurant: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
