import 'server-only';

import type { createServiceClient } from '@/lib/supabase/service';
import { haversineKm } from '@/lib/delivery-zone';
import { deliveryZonePricing, type DeliverySurgeRule } from '@/lib/delivery-zone-pricing';
export { deliveryZonePricing, normalizeSurgePolicy } from '@/lib/delivery-zone-pricing';

type ServiceClient = ReturnType<typeof createServiceClient>;
export type ZonePoint = [number, number];

export type DeliveryZoneRule = DeliverySurgeRule & {
  id?: string;
  name: string;
  polygon?: unknown;
  center_lat?: number | string | null;
  center_lng?: number | string | null;
  radius_km?: number | string | null;
  delivery_fee?: number | string | null;
  min_order_amount?: number | string | null;
  priority?: number | null;
  version?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
};

export class ZoneConfigurationError extends Error {
  constructor(message = 'Delivery-zone configuration is unavailable') { super(message); this.name = 'ZoneConfigurationError'; }
}

function normalizedPoint(value: unknown): ZonePoint | null {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]); const lng = Number(value[1]);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? [lat, lng] : null;
  }
  if (value && typeof value === 'object') {
    const row = value as { lat?: unknown; lng?: unknown };
    return normalizedPoint([row.lat, row.lng]);
  }
  return null;
}

function orientation(a: ZonePoint, b: ZonePoint, c: ZonePoint) {
  return Math.sign((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]));
}

function intersects(a: ZonePoint, b: ZonePoint, c: ZonePoint, d: ZonePoint) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

export function normalizeValidPolygon(value: unknown): ZonePoint[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points = value.map(normalizedPoint);
  if (points.some((point) => point === null)) return null;
  const polygon = points as ZonePoint[];
  if (polygon.length < 3) return null;
  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[1] * next[0] - next[1] * point[0];
  }, 0);
  if (Math.abs(area) < 1e-10) return null;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    for (let j = i + 1; j < polygon.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === polygon.length - 1)) continue;
      const c = polygon[j]; const d = polygon[(j + 1) % polygon.length];
      if (intersects(a, b, c, d)) return null;
    }
  }
  return polygon;
}

export function pointInPolygon(lat: number, lng: number, polygon: ZonePoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0]; const xi = polygon[i][1];
    const yj = polygon[j][0]; const xj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function circleRulesOverlap(a: DeliveryZoneRule, b: DeliveryZoneRule) {
  const aLat = Number(a.center_lat); const aLng = Number(a.center_lng); const aRadius = Number(a.radius_km);
  const bLat = Number(b.center_lat); const bLng = Number(b.center_lng); const bRadius = Number(b.radius_km);
  if (![aLat, aLng, aRadius, bLat, bLng, bRadius].every(Number.isFinite) || aRadius <= 0 || bRadius <= 0) return false;
  return haversineKm(aLat, aLng, bLat, bLng) < aRadius + bRadius;
}

function activeAt(rule: DeliveryZoneRule, now: Date) {
  if (rule.is_active === false) return false;
  if (rule.effective_from && new Date(rule.effective_from) > now) return false;
  if (rule.effective_to && new Date(rule.effective_to) <= now) return false;
  return true;
}

export async function loadActiveZoneRules(client: ServiceClient, now = new Date()): Promise<DeliveryZoneRule[]> {
  const { data, error } = await client.from('delivery_zones').select('*').eq('is_active', true).order('priority', { ascending: false });
  if (error) throw new ZoneConfigurationError();
  return ((data ?? []) as DeliveryZoneRule[]).filter((rule) => activeAt(rule, now));
}

export async function resolveConfiguredDeliveryZone(client: ServiceClient, lat: number, lng: number, now = new Date()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ZoneConfigurationError('Invalid delivery coordinates');
  const rules = await loadActiveZoneRules(client, now);
  let nearestDistanceKm: number | null = null;
  for (const rule of rules) {
    if (!rule.id) continue;
    const polygon = normalizeValidPolygon(rule.polygon);
    const centerLat = Number(rule.center_lat); const centerLng = Number(rule.center_lng); const radiusKm = Number(rule.radius_km);
    const distanceKm = Number.isFinite(centerLat) && Number.isFinite(centerLng) ? haversineKm(centerLat, centerLng, lat, lng) : null;
    if (distanceKm !== null && (nearestDistanceKm === null || distanceKm < nearestDistanceKm)) nearestDistanceKm = distanceKm;
    const matches = polygon ? pointInPolygon(lat, lng, polygon) : distanceKm !== null && Number.isFinite(radiusKm) && radiusKm > 0 && distanceKm <= radiusKm;
    if (matches) return { ok: true as const, zone: rule, pricing: deliveryZonePricing(rule, now), distanceKm, ruleId: rule.id, ruleVersion: Number(rule.version ?? 1) };
  }
  return { ok: false as const, distanceKm: nearestDistanceKm, reason: rules.length ? 'out_of_zone' as const : 'no_active_zone' as const };
}
