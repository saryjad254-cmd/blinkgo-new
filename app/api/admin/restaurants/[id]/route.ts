import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiRole(['admin'], req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServiceClient();
    const updates: Record<string, unknown> = {};
    const { data: currentRestaurant } = await db.from('restaurants').select('id,owner_id').eq('id', params.id).is('archived_at', null).maybeSingle();
    if (!currentRestaurant) return NextResponse.json({ ok: false, error: 'Store not found' }, { status: 404 });
    const textFields = ['name', 'category', 'description', 'address', 'phone'] as const;
    for (const field of textFields) {
      if (typeof body[field] === 'string') updates[field] = body[field].trim().slice(0, field === 'description' ? 2000 : 250);
    }
    if (typeof body.cuisine_type === 'string') updates.category = body.cuisine_type.trim().slice(0, 250);
    if (body.delivery_fee !== undefined && Number.isFinite(Number(body.delivery_fee))) updates.delivery_fee = Math.max(0, Math.min(100, Number(body.delivery_fee)));
    if (body.minimum_order !== undefined && Number.isFinite(Number(body.minimum_order))) updates.min_order_amount = Math.max(0, Math.min(1000, Number(body.minimum_order)));
    if (body.min_order_amount !== undefined && Number.isFinite(Number(body.min_order_amount))) updates.min_order_amount = Math.max(0, Math.min(1000, Number(body.min_order_amount)));
    if (body.delivery_radius_km !== undefined && Number.isFinite(Number(body.delivery_radius_km))) {
      updates.delivery_radius_km = Math.max(0.1, Math.min(100, Number(body.delivery_radius_km)));
    }
    if (body.commission_pct !== undefined && Number.isFinite(Number(body.commission_pct))) {
      updates.commission_pct = Math.max(0, Math.min(100, Number(body.commission_pct)));
    }
    if (body.type !== undefined) {
      if (!['restaurant', 'market', 'pharmacy', 'shop'].includes(String(body.type))) return NextResponse.json({ ok: false, error: 'Unsupported store type' }, { status: 400 });
      updates.type = body.type;
    }
    if (body.latitude !== undefined) {
      if (body.latitude === null || body.latitude === '') updates.latitude = null;
      else {
      const latitude = Number(body.latitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return NextResponse.json({ ok: false, error: 'Invalid latitude' }, { status: 400 });
      updates.latitude = latitude;
      }
    }
    if (body.longitude !== undefined) {
      if (body.longitude === null || body.longitude === '') updates.longitude = null;
      else {
      const longitude = Number(body.longitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return NextResponse.json({ ok: false, error: 'Invalid longitude' }, { status: 400 });
      updates.longitude = longitude;
      }
    }
    if (body.opening_hours !== undefined) {
      if (!body.opening_hours || typeof body.opening_hours !== 'object' || Array.isArray(body.opening_hours)) return NextResponse.json({ ok: false, error: 'Invalid opening hours' }, { status: 400 });
      updates.opening_hours = body.opening_hours;
    }
    let nextOwner: { id: string; name: string | null; email: string | null } | null = null;
    if (body.owner_email !== undefined) {
      const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
      if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) return NextResponse.json({ ok: false, error: 'Valid owner email required' }, { status: 400 });
      const { data: owner } = await db.from('users').select('id,name,email,role').ilike('email', ownerEmail).maybeSingle();
      if (!owner || owner.role !== 'restaurant') return NextResponse.json({ ok: false, error: 'An existing restaurant account with this email is required' }, { status: 404 });
      nextOwner = { id: owner.id, name: owner.name, email: owner.email };
      updates.owner_id = owner.id;
    }
    if (updates.name !== undefined && String(updates.name).length < 2) return NextResponse.json({ ok: false, error: 'Valid restaurant name required' }, { status: 400 });
    for (const field of ['is_active', 'is_featured', 'is_paused', 'busy_mode', 'is_hidden'] as const) {
      if (typeof body[field] === 'boolean') updates[field] = body[field];
    }
    if (updates.is_active === true) {
      const { data: verification } = await db.from('restaurant_verifications').select('status').eq('restaurant_id', params.id).maybeSingle();
      if (verification?.status !== 'approved') return NextResponse.json({ ok: false, error: 'Trader verification approval is required before activation' }, { status: 409 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No updatable fields' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db.from('restaurants').update(updates).eq('id', params.id).is('archived_at', null).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });

    if (nextOwner && nextOwner.id !== currentRestaurant.owner_id) {
      const { error: profileError } = await db.from('users').update({ restaurant_id: params.id, updated_at: new Date().toISOString() }).eq('id', nextOwner.id).eq('role', 'restaurant');
      if (profileError) {
        await db.from('restaurants').update({ owner_id: currentRestaurant.owner_id }).eq('id', params.id);
        return NextResponse.json({ ok: false, error: safeErrorMessage(profileError) }, { status: 500 });
      }
      if (currentRestaurant.owner_id) await db.from('users').update({ restaurant_id: null, updated_at: new Date().toISOString() }).eq('id', currentRestaurant.owner_id).eq('restaurant_id', params.id);
    }

    await recordAudit({
      actor_id: auth.id,
      action: 'restaurant.update',
      target_type: 'restaurant',
      target_id: params.id,
      metadata: { changes: Object.keys(updates).filter((field) => field !== 'updated_at') },
    });

    return NextResponse.json({ ok: true, restaurant: { ...(Array.isArray(data) ? data[0] : data), ...(nextOwner ? { owner: nextOwner } : {}) } });
  } catch {
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
    headers: { Allow: 'PATCH, DELETE' },
  });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireApiRole(['admin'], req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from('restaurants').update({ archived_at: now, is_active: false, is_paused: true, is_hidden: true, updated_at: now }).eq('id', id).is('archived_at', null).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Store not found' }, { status: 404 });
  await recordAudit({ actor_id: auth.id, action: 'restaurant.archive', target_type: 'restaurant', target_id: id });
  return NextResponse.json({ ok: true });
}
