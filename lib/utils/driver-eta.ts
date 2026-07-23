/**
 * Driver ETA calculation utilities.
 *
 * Computes:
 * - Haversine distance
 * - ETA using realistic average speeds (city vs highway)
 * - Confidence intervals based on conditions
 * - Delivery zone arrival detection
 */

import { haversineDistance, type LatLng } from '@/lib/maps/distance';

export type TravelMode = 'walking' | 'cycling' | 'driving' | 'driving-traffic';

const AVG_SPEEDS_KMH: Record<TravelMode, number> = {
  walking: 5,
  cycling: 15,
  driving: 30, // city average
  'driving-traffic': 22, // dense urban
};

export interface ETAResult {
  distanceMeters: number;
  distanceKm: number;
  /** ETA in seconds. */
  etaSeconds: number;
  /** ETA formatted as "12 min" or "1h 5min". */
  etaLabel: string;
  /** Confidence: 0-1 based on distance. Higher distance = higher confidence. */
  confidence: number;
}

export function computeETA(from: LatLng, to: LatLng, mode: TravelMode = 'driving-traffic'): ETAResult {
  const distanceMeters = haversineDistance(from, to);
  const distanceKm = distanceMeters / 1000;
  const speed = AVG_SPEEDS_KMH[mode];
  // Add 30% buffer for stops, traffic lights, etc.
  const etaHours = (distanceKm / speed) * 1.3;
  const etaSeconds = Math.max(60, Math.round(etaHours * 3600));
  const confidence = Math.max(0, Math.min(1, distanceKm / 5));
  return {
    distanceMeters,
    distanceKm,
    etaSeconds,
    etaLabel: formatETA(etaSeconds),
    confidence,
  };
}

export function formatETA(seconds: number): string {
  if (seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function isWithinRadius(center: LatLng, point: LatLng, radiusMeters: number): boolean {
  return haversineDistance(center, point) <= radiusMeters;
}
