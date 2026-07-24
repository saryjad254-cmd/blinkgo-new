/**
 * Delivery Zone Checker
 * ─────────────────────
 * Check if a point is inside a delivery zone.
 * Supports both polygon and radius-based zones.
 */

import { haversineDistance, type LatLng } from './distance';

export interface DeliveryZone {
  id: string;
  name: string;
  /** Polygon points [[lat, lng], ...] (closed) */
  polygon?: [number, number][];
  /** Center for radius zone */
  center?: LatLng;
  /** Radius in km for radius zone */
  radius_km?: number;
  delivery_fee?: number;
  min_order_amount?: number;
  priority?: number;
}

/**
 * Ray-casting point-in-polygon check.
 * https://en.wikipedia.org/wiki/Point_in_polygon
 */
export function pointInPolygon(point: LatLng, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;

  const { lat, lng } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersect = (lngI > lng) !== (lngJ > lng) &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Check if point is within radius of center.
 */
export function pointInRadius(point: LatLng, center: LatLng, radius_m: number): boolean {
  return haversineDistance(point, center) <= radius_m;
}

/**
 * Find the best matching zone for a point.
 * Returns the highest-priority zone that contains the point.
 */
export function findZone(point: LatLng, zones: DeliveryZone[]): DeliveryZone | null {
  let best: DeliveryZone | null = null;
  for (const zone of zones) {
    if (!isInZone(point, zone)) continue;
    if (!best || (zone.priority ?? 0) > (best.priority ?? 0)) {
      best = zone;
    }
  }
  return best;
}

/**
 * Check if a point is in a specific zone.
 */
export function isInZone(point: LatLng, zone: DeliveryZone): boolean {
  if (zone.polygon && zone.polygon.length >= 3) {
    return pointInPolygon(point, zone.polygon);
  }
  if (zone.center && zone.radius_km) {
    return pointInRadius(point, zone.center, zone.radius_km * 1000);
  }
  return false;
}

/**
 * Check if delivery is possible (point in any zone).
 */
export function canDeliverTo(point: LatLng, zones: DeliveryZone[]): boolean {
  return findZone(point, zones) !== null;
}

/**
 * Get all zones containing a point.
 */
export function getZonesFor(point: LatLng, zones: DeliveryZone[]): DeliveryZone[] {
  return zones.filter((z) => isInZone(point, z));
}

/**
 * Encode zone polygon to a compact string (for storage).
 */
export function encodeZonePolygon(polygon: [number, number][]): string {
  // Format: "lat,lng;lat,lng;..."
  return polygon.map(([lat, lng]) => `${lat},${lng}`).join(';');
}

/**
 * Decode zone polygon from string.
 */
export function decodeZonePolygon(encoded: string): [number, number][] {
  return encoded.split(';').map((pair) => {
    const [lat, lng] = pair.split(',').map(Number);
    return [lat, lng];
  });
}

/**
 * Create a circular polygon around a point (for visualization).
 */
export function createCirclePolygon(center: LatLng, radius_m: number, segments: number = 32): [number, number][] {
  const points: [number, number][] = [];
  const earthRadius = 6371000;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const dx = radius_m * Math.cos(angle);
    const dy = radius_m * Math.sin(angle);
    // Convert meters to lat/lng (approximate)
    const newLat = center.lat + (dy / earthRadius) * (180 / Math.PI);
    const newLng = center.lng + (dx / (earthRadius * Math.cos(center.lat * Math.PI / 180))) * (180 / Math.PI);
    points.push([newLat, newLng]);
  }
  return points;
}
