/**
 * Marketplace Health Library
 * ─────────────────────────
 * Supply/demand balance, zone profitability, geographic demand.
 */

export interface ZoneMetric {
  zone_id: string;
  zone_name: string;
  center_lat: number;
  center_lng: number;
  order_count: number;
  revenue: number;
  active_restaurants: number;
  active_drivers: number;
  avg_delivery_distance_km: number;
  supply: number; // capacity (drivers+restaurants)
  demand: number; // orders
  health_score: number; // 0-1
  status: 'balanced' | 'undersupply' | 'oversupply' | 'inactive';
  recommendation: string;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export function computeZoneHealth(
  zoneId: string,
  zoneName: string,
  center: Coordinate,
  orders: Array<{ lat: number; lng: number; total: number; created_at: string }>,
  activeRestaurants: number,
  activeDrivers: number
): ZoneMetric {
  const zoneOrders = orders.filter(
    (o) => Math.abs(o.lat - center.lat) < 0.1 && Math.abs(o.lng - center.lng) < 0.1
  );
  const orderCount = zoneOrders.length;
  const revenue = zoneOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const supply = activeRestaurants + activeDrivers;
  const demand = orderCount;
  // Health: demand/supply ratio → 0-1 score with target=1.0
  const ratio = supply > 0 ? demand / (supply * 10) : 0; // normalized
  const health = Math.max(0, Math.min(1, 1 - Math.abs(ratio - 1) * 0.5));

  let status: ZoneMetric['status'] = 'balanced';
  let recommendation = 'Maintain current supply';
  if (ratio < 0.4) {
    status = 'oversupply';
    recommendation = 'Reduce driver shifts or boost marketing to drive demand';
  } else if (ratio > 1.6) {
    status = 'undersupply';
    recommendation = 'Recruit more drivers and restaurants. Activate surge pricing.';
  } else if (orderCount === 0) {
    status = 'inactive';
    recommendation = 'Investigate: pricing, restaurant coverage, or marketing';
  }

  return {
    zone_id: zoneId,
    zone_name: zoneName,
    center_lat: center.lat,
    center_lng: center.lng,
    order_count: orderCount,
    revenue,
    active_restaurants: activeRestaurants,
    active_drivers: activeDrivers,
    avg_delivery_distance_km: 0, // computed if distance data available
    supply,
    demand,
    health_score: health,
    status,
    recommendation,
  };
}

export interface GeographicHeatmap {
  lat: number;
  lng: number;
  intensity: number; // 0-1
  order_count: number;
}

export function computeHeatmap(
  orders: Array<{ lat: number; lng: number }>,
  cellSize: number = 0.01 // ~1km
): GeographicHeatmap[] {
  const cells = new Map<string, { lat: number; lng: number; count: number }>();
  for (const o of orders) {
    const lat = Math.floor(o.lat / cellSize) * cellSize;
    const lng = Math.floor(o.lng / cellSize) * cellSize;
    const key = `${lat}_${lng}`;
    if (!cells.has(key)) cells.set(key, { lat, lng, count: 0 });
    cells.get(key)!.count += 1;
  }
  const max = Math.max(1, ...Array.from(cells.values()).map((c) => c.count));
  return Array.from(cells.values()).map((c) => ({
    lat: c.lat,
    lng: c.lng,
    intensity: c.count / max,
    order_count: c.count,
  }));
}

export interface SupplyDemandPoint {
  timestamp: string;
  demand: number;
  supply: number;
  ratio: number;
}

export function computeSupplyDemandTimeseries(
  orders: Array<{ created_at: string; restaurant_id: string }>,
  onlineDrivers: Array<{ id: string; online_at: string }>,
  bucketMinutes: number = 60
): SupplyDemandPoint[] {
  const buckets = new Map<number, { demand: number; supply: number }>();
  const bucketSize = bucketMinutes * 60 * 1000;

  for (const o of orders) {
    const t = Math.floor(new Date(o.created_at).getTime() / bucketSize) * bucketSize;
    if (!buckets.has(t)) buckets.set(t, { demand: 0, supply: 0 });
    buckets.get(t)!.demand += 1;
  }
  for (const d of onlineDrivers) {
    const t = Math.floor(new Date(d.online_at).getTime() / bucketSize) * bucketSize;
    if (!buckets.has(t)) buckets.set(t, { demand: 0, supply: 0 });
    buckets.get(t)!.supply += 1;
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({
      timestamp: new Date(t).toISOString(),
      demand: v.demand,
      supply: v.supply,
      ratio: v.supply > 0 ? v.demand / v.supply : 0,
    }));
}
