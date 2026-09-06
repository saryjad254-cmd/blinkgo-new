import { DRIVER_MAX_OFFER_ROUTE_KM, DRIVER_MAX_PICKUP_DISTANCE_KM } from '@/lib/config/fees';
import { haversineDistanceMeters, validateLocation } from '@/lib/driver/dispatch-policy';
import { computeEarnings, type EarningsBreakdown, type EarningsInput } from '@/lib/services/driver-earnings';

export type OfferPolicyReason = 'location_unavailable' | 'pickup_too_far' | 'route_too_long' | null;
export type OfferMatchLevel = 'excellent' | 'good' | 'standard' | 'unrated';
export type OfferMatchSignal = 'short_pickup' | 'ready_for_pickup' | 'efficient_route' | 'strong_hourly_estimate';

export interface DriverOfferQuote {
  eligible: boolean;
  reason: OfferPolicyReason;
  pickupDistanceKm: number | null;
  deliveryDistanceKm: number | null;
  routeDistanceKm: number | null;
  etaMinutes: number | null;
  earnings: EarningsBreakdown;
  earningsPerHour: number | null;
  earningsPerKm: number | null;
  matchLevel: OfferMatchLevel;
  matchSignals: OfferMatchSignal[];
  score: number;
}

export interface DriverOfferInput extends EarningsInput {
  driver_latitude?: number | string | null;
  driver_longitude?: number | string | null;
  status?: unknown;
}

export function createDriverOfferQuote(input: DriverOfferInput): DriverOfferQuote {
  const earnings = computeEarnings(input);
  const relation = Array.isArray(input.restaurants) ? input.restaurants[0] : input.restaurants;
  const restaurant = relation && typeof relation === 'object' ? relation as Record<string, unknown> : null;
  const driver = point(input.driver_latitude, input.driver_longitude);
  const pickup = point(input.restaurant_latitude ?? restaurant?.latitude, input.restaurant_longitude ?? restaurant?.longitude);
  const dropoff = point(input.customer_latitude, input.customer_longitude);

  if (!driver || !pickup || !dropoff) {
    return {
      eligible: true,
      reason: 'location_unavailable',
      pickupDistanceKm: null,
      deliveryDistanceKm: earnings.distanceKm,
      routeDistanceKm: null,
      etaMinutes: null,
      earnings,
      earningsPerHour: null,
      earningsPerKm: null,
      matchLevel: 'unrated',
      matchSignals: [],
      score: Number.MAX_SAFE_INTEGER,
    };
  }

  const pickupDistanceKm = round2(haversineDistanceMeters(driver, pickup) / 1000);
  const deliveryDistanceKm = round2(haversineDistanceMeters(pickup, dropoff) / 1000);
  const routeDistanceKm = round2(pickupDistanceKm + deliveryDistanceKm);
  const etaMinutes = Math.max(8, Math.round(routeDistanceKm / 0.42));
  const earningsPerHour = round2(earnings.total / (etaMinutes / 60));
  const earningsPerKm = routeDistanceKm > 0 ? round2(earnings.total / routeDistanceKm) : null;
  const status = String(input.status || '').toLowerCase();
  const matchSignals: OfferMatchSignal[] = [];
  if (pickupDistanceKm <= 2.5) matchSignals.push('short_pickup');
  if (status === 'ready') matchSignals.push('ready_for_pickup');
  if (routeDistanceKm <= 8) matchSignals.push('efficient_route');
  if (earningsPerHour >= 15) matchSignals.push('strong_hourly_estimate');
  const matchLevel: OfferMatchLevel = matchSignals.length >= 3
    ? 'excellent'
    : matchSignals.length >= 2
      ? 'good'
      : 'standard';
  const reason: OfferPolicyReason = pickupDistanceKm > DRIVER_MAX_PICKUP_DISTANCE_KM
    ? 'pickup_too_far'
    : routeDistanceKm > DRIVER_MAX_OFFER_ROUTE_KM
      ? 'route_too_long'
      : null;

  return {
    eligible: reason == null,
    reason,
    pickupDistanceKm,
    deliveryDistanceKm,
    routeDistanceKm,
    etaMinutes,
    earnings,
    earningsPerHour,
    earningsPerKm,
    matchLevel,
    matchSignals,
    // A lower score is better. Pickup effort matters most, while readiness and
    // expected earning efficiency improve placement. Acceptance history is
    // deliberately excluded so skipping an offer never penalises the courier.
    score: round2(
      pickupDistanceKm * 2
      + deliveryDistanceKm
      - Math.min(earningsPerHour, 30) * 0.12
      - (status === 'ready' ? 1.25 : 0),
    ),
  };
}

function point(latValue: unknown, lngValue: unknown): { lat: number; lng: number } | null {
  const lat = numeric(latValue);
  const lng = numeric(lngValue);
  const validated = validateLocation(lat, lng);
  return validated.ok ? { lat: validated.lat, lng: validated.lng } : null;
}

function numeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
