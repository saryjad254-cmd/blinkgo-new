import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { circleRulesOverlap, normalizeSurgePolicy, normalizeValidPolygon, type DeliveryZoneRule } from '@/lib/services/delivery-zone-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function finiteNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function zonePayload(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const centerLat = finiteNumber(body.center_lat, -90, 90);
  const centerLng = finiteNumber(body.center_lng, -180, 180);
  const radiusKm = finiteNumber(body.radius_km, 0.1, 200);
  const deliveryFee = finiteNumber(body.delivery_fee, 0, 100);
  const minOrder = finiteNumber(body.min_order_amount, 0, 1000);
  const priority = finiteNumber(body.priority ?? 0, -1000, 1000);
  const rawPolygon = Array.isArray(body.polygon) ? body.polygon : [];
  const polygon = rawPolygon.length ? normalizeValidPolygon(rawPolygon) : [];
  if (name.length < 2 || centerLat === null || centerLng === null || radiusKm === null || deliveryFee === null || minOrder === null || priority === null || polygon === null) return null;
  const effectiveFrom = typeof body.effective_from === 'string' ? new Date(body.effective_from) : new Date();
  const effectiveTo = typeof body.effective_to === 'string' && body.effective_to ? new Date(body.effective_to) : null;
  if (!Number.isFinite(effectiveFrom.getTime()) || (effectiveTo && (!Number.isFinite(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))) return null;
  const surge = normalizeSurgePolicy(body);
  if (!surge) return null;
  return {
    name,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null,
    polygon,
    center_lat: centerLat,
    center_lng: centerLng,
    radius_km: radiusKm,
    delivery_fee: deliveryFee,
    min_order_amount: minOrder,
    priority: Math.round(priority),
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    effective_from: effectiveFrom.toISOString(),
    effective_to: effectiveTo?.toISOString() ?? null,
    ...surge,
  };
}

export async function GET() {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const db = createServiceClient();
  const { data, error } = await db.from('delivery_zones').select('*').order('priority', { ascending: false }).order('name');
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error), zones: [] }, { status: 500 });
  return NextResponse.json({ ok: true, zones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json() as Record<string, unknown>;
    const payload = zonePayload(body);
    if (!payload) return NextResponse.json({ ok: false, error: 'Invalid zone data' }, { status: 400 });
    const db = createServiceClient();
    if (payload.is_active) {
      const { data: existing, error: existingError } = await db.from('delivery_zones').select('*').eq('is_active', true);
      if (existingError) return NextResponse.json({ ok: false, error: safeErrorMessage(existingError) }, { status: 503 });
      const conflict = ((existing ?? []) as DeliveryZoneRule[]).find((zone) => circleRulesOverlap(payload, zone));
      if (conflict) return NextResponse.json({ ok: false, error: `Zone overlaps active rule: ${conflict.name}` }, { status: 409 });
    }
    const { data, error } = await db.from('delivery_zones').insert(payload).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'delivery_zone.create', target_type: 'delivery_zone', target_id: data.id, metadata: { name: payload.name } });
    return NextResponse.json({ ok: true, zone: data }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
