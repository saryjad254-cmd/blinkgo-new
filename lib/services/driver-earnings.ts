/**
 * Driver earnings — single source of truth.
 *
 * Every driver and admin surface must use this module instead of duplicating
 * the payout formula. The delivery share is a BlinkGo contract value from the
 * platform fee configuration; customer tips are passed through in full.
 */

import {
  DRIVER_DELIVERY_SHARE,
  DRIVER_DISTANCE_RATE_PER_KM,
  DRIVER_MAX_PRICED_DISTANCE_KM,
  DRIVER_MINIMUM_BASE_PAYOUT,
} from '@/lib/config/fees';

export {
  DRIVER_DELIVERY_SHARE,
  DRIVER_DISTANCE_RATE_PER_KM,
  DRIVER_MAX_PRICED_DISTANCE_KM,
  DRIVER_MINIMUM_BASE_PAYOUT,
} from '@/lib/config/fees';

export interface EarningsBreakdown {
  base: number;
  tip: number;
  total: number;
  share: number;
  distanceKm: number | null;
  distancePay: number;
}

interface CoordinateRelation {
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface EarningsInput {
  delivery_fee?: number | string | null;
  tip?: number | string | null;
  restaurant_latitude?: number | string | null;
  restaurant_longitude?: number | string | null;
  customer_latitude?: number | string | null;
  customer_longitude?: number | string | null;
  restaurants?: unknown;
}

export function computeEarnings(input: EarningsInput): EarningsBreakdown {
  const fee = Number(input.delivery_fee ?? 0) || 0;
  const tip = Number(input.tip ?? 0) || 0;
  const relation = Array.isArray(input.restaurants) ? input.restaurants[0] : input.restaurants;
  const restaurant = relation && typeof relation === 'object' ? relation as CoordinateRelation : null;
  const distanceKm = deliveryDistanceKm({
    restaurantLat: input.restaurant_latitude ?? restaurant?.latitude,
    restaurantLng: input.restaurant_longitude ?? restaurant?.longitude,
    customerLat: input.customer_latitude,
    customerLng: input.customer_longitude,
  });
  const distancePay = distanceKm == null ? 0 : DRIVER_MINIMUM_BASE_PAYOUT + distanceKm * DRIVER_DISTANCE_RATE_PER_KM;
  const base = Math.max(fee * DRIVER_DELIVERY_SHARE, DRIVER_MINIMUM_BASE_PAYOUT, distancePay);

  return {
    base: round2(base),
    tip: round2(tip),
    total: round2(base + tip),
    share: DRIVER_DELIVERY_SHARE,
    distanceKm: distanceKm == null ? null : round2(distanceKm),
    distancePay: round2(distancePay),
  };
}

function deliveryDistanceKm(input: {
  restaurantLat: unknown;
  restaurantLng: unknown;
  customerLat: unknown;
  customerLng: unknown;
}): number | null {
  const restaurantLat = coordinate(input.restaurantLat, -90, 90);
  const restaurantLng = coordinate(input.restaurantLng, -180, 180);
  const customerLat = coordinate(input.customerLat, -90, 90);
  const customerLng = coordinate(input.customerLng, -180, 180);
  if (restaurantLat == null || restaurantLng == null || customerLat == null || customerLng == null) return null;
  if ((restaurantLat === 0 && restaurantLng === 0) || (customerLat === 0 && customerLng === 0)) return null;

  const earthRadiusKm = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(customerLat - restaurantLat);
  const lngDelta = radians(customerLng - restaurantLng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(restaurantLat)) * Math.cos(radians(customerLat)) * Math.sin(lngDelta / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, a));
  const distance = earthRadiusKm * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return Number.isFinite(distance) && distance <= DRIVER_MAX_PRICED_DISTANCE_KM ? distance : null;
}

function coordinate(value: unknown, min: number, max: number): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
