import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { circleRulesOverlap, normalizeSurgePolicy, normalizeValidPolygon, type DeliveryZoneRule } from '@/lib/services/delivery-zone-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bounded(value: unknown, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim().length >= 2) updates.name = body.name.trim().slice(0, 120);
    if (typeof body.description === 'string' || body.description === null) updates.description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null;
    const numericFields = {
      center_lat: [-90, 90], center_lng: [-180, 180], radius_km: [0.1, 200], delivery_fee: [0, 100], min_order_amount: [0, 1000], priority: [-1000, 1000],
    } as const;
    for (const [field, range] of Object.entries(numericFields)) {
      if (body[field] === undefined) continue;
      const value = bounded(body[field], range[0], range[1]);
      if (value === null) return NextResponse.json({ ok: false, error: `Invalid ${field}` }, { status: 400 });
      updates[field] = field === 'priority' ? Math.round(value) : value;
    }
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if (Array.isArray(body.polygon)) {
      const polygon = body.polygon.length ? normalizeValidPolygon(body.polygon) : [];
      if (polygon === null) return NextResponse.json({ ok: false, error: 'Invalid polygon geometry' }, { status: 400 });
      updates.polygon = polygon;
    }
    if (typeof body.effective_from === 'string') {
      const date = new Date(body.effective_from);
      if (!Number.isFinite(date.getTime())) return NextResponse.json({ ok: false, error: 'Invalid effective_from' }, { status: 400 });
      updates.effective_from = date.toISOString();
    }
    if (body.effective_to === null || typeof body.effective_to === 'string') {
      const date = body.effective_to ? new Date(body.effective_to) : null;
      if (date && !Number.isFinite(date.getTime())) return NextResponse.json({ ok: false, error: 'Invalid effective_to' }, { status: 400 });
      updates.effective_to = date?.toISOString() ?? null;
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'No updatable fields' }, { status: 400 });
    updates.updated_at = new Date().toISOString();
    const db = createServiceClient();
    const { data: current, error: currentError } = await db.from('delivery_zones').select('*').eq('id', id).maybeSingle();
    if (currentError) return NextResponse.json({ ok: false, error: safeErrorMessage(currentError) }, { status: 400 });
    if (!current) return NextResponse.json({ ok: false, error: 'Zone not found' }, { status: 404 });
    const candidate = { ...current, ...updates } as DeliveryZoneRule;
    const touchesSurge = ['surge_multiplier', 'surge_days', 'surge_start_local', 'surge_end_local', 'surge_timezone'].some((field) => body[field] !== undefined);
    if (touchesSurge) {
      const surge = normalizeSurgePolicy({ ...current, ...body });
      if (!surge) return NextResponse.json({ ok: false, error: 'Invalid surge policy' }, { status: 400 });
      Object.assign(updates, surge);
      Object.assign(candidate, surge);
    }
    if (candidate.effective_to && candidate.effective_from && new Date(candidate.effective_to) <= new Date(candidate.effective_from)) return NextResponse.json({ ok: false, error: 'Invalid effective window' }, { status: 400 });
    if (candidate.is_active !== false) {
      const { data: active, error: activeError } = await db.from('delivery_zones').select('*').eq('is_active', true);
      if (activeError) return NextResponse.json({ ok: false, error: safeErrorMessage(activeError) }, { status: 503 });
      const conflict = ((active ?? []) as DeliveryZoneRule[]).find((zone) => zone.id !== id && circleRulesOverlap(candidate, zone));
      if (conflict) return NextResponse.json({ ok: false, error: `Zone overlaps active rule: ${conflict.name}` }, { status: 409 });
    }
    const { data, error } = await db.from('delivery_zones').update(updates).eq('id', id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: 'Zone not found' }, { status: 404 });
    await recordAudit({ actor_id: auth.id, action: 'delivery_zone.update', target_type: 'delivery_zone', target_id: id, metadata: { changes: Object.keys(updates).filter((key) => key !== 'updated_at') } });
    return NextResponse.json({ ok: true, zone: data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'PATCH' } });
}
