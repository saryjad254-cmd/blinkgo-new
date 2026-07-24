/**
 * Advanced ETA Predictor
 * Multi-factor ETA prediction combining:
 * - Time-of-day traffic multipliers
 * - Restaurant prep time prediction (per-restaurant)
 * - Confidence scoring with uncertainty bands
 * - Continuous refinement as more data arrives
 *
 * All deterministic — no ML training, no external APIs.
 * Fails gracefully if historical data is missing.
 */

import { haversineDistance, type LatLng } from '@/lib/maps/distance';

export interface ETAPrediction {
  totalSeconds: number;
  breakdown: {
    prepSeconds: number;
    pickupDriveSeconds: number;
    deliveryDriveSeconds: number;
  };
  distances: {
    toRestaurantMeters: number;
    deliveryMeters: number;
  };
  confidence: number;
  uncertaintySeconds: number;
  display: string;
  rangeDisplay: string;
  factors: {
    trafficMultiplier: number;
    historicalPrepMin: number;
    timeOfDay: 'rush' | 'normal' | 'off-peak';
  };
}

const SPEED_TABLE = {
  driving: { rush: 18, normal: 28, 'off-peak': 35 },
  'driving-traffic': { rush: 15, normal: 22, 'off-peak': 30 },
};

interface PredictOptions {
  driverLocation: LatLng | null;
  restaurantLocation: LatLng;
  customerLocation: LatLng;
  now?: Date;
  historicalPrepMinutes?: number;
  prepVarianceMinutes?: number;
  driverSpeedFactor?: number;
  prepSampleSize?: number;
}

export function getTimeOfDay(date: Date = new Date()): 'rush' | 'normal' | 'off-peak' {
  const hour = date.getHours();
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 'rush';
  if (hour >= 22 || hour < 6) return 'off-peak';
  return 'normal';
}

export function predictETA(opts: PredictOptions): ETAPrediction {
  const now = opts.now ?? new Date();
  const timeOfDay = getTimeOfDay(now);
  const speed = SPEED_TABLE['driving-traffic'][timeOfDay];
  const driverSpeedFactor = opts.driverSpeedFactor ?? 1.0;
  const effectiveSpeed = speed * driverSpeedFactor;

  const distToRestaurant = opts.driverLocation
    ? haversineDistance(opts.driverLocation, opts.restaurantLocation)
    : 0;
  const distDelivery = haversineDistance(opts.restaurantLocation, opts.customerLocation);

  const BUFFER = 1.3;
  const pickupDriveSeconds = opts.driverLocation
    ? Math.max(60, Math.round((distToRestaurant / 1000 / effectiveSpeed) * 3600 * BUFFER))
    : 0;
  const deliveryDriveSeconds = Math.max(
    60,
    Math.round((distDelivery / 1000 / effectiveSpeed) * 3600 * BUFFER)
  );

  const DEFAULT_PREP_MIN = 20;
  const prepMin = opts.historicalPrepMinutes ?? DEFAULT_PREP_MIN;
  const prepVariance = opts.prepVarianceMinutes ?? 5;
  const prepSeconds = Math.max(60, prepMin * 60);

  const totalSeconds = Math.max(pickupDriveSeconds, prepSeconds) + deliveryDriveSeconds;

  let confidence = 0.5;
  if (opts.driverLocation) confidence += 0.15;
  if (opts.historicalPrepMinutes) confidence += 0.15;
  if ((opts.prepSampleSize ?? 0) >= 10) confidence += 0.1;
  if ((opts.prepSampleSize ?? 0) >= 50) confidence += 0.1;
  confidence = Math.min(1, confidence);

  const uncertaintySeconds = Math.round((1 - confidence) * 600 + prepVariance * 60);

  return {
    totalSeconds,
    breakdown: { prepSeconds, pickupDriveSeconds, deliveryDriveSeconds },
    distances: { toRestaurantMeters: distToRestaurant, deliveryMeters: distDelivery },
    confidence,
    uncertaintySeconds,
    display: formatDuration(totalSeconds),
    rangeDisplay: `${formatDuration(Math.max(0, totalSeconds - uncertaintySeconds))} – ${formatDuration(totalSeconds + uncertaintySeconds)}`,
    factors: {
      trafficMultiplier: timeOfDay === 'rush' ? 1.5 : timeOfDay === 'off-peak' ? 0.85 : 1.0,
      historicalPrepMin: prepMin,
      timeOfDay,
    },
  };
}

export function refineETA(
  previous: ETAPrediction,
  newTotalSeconds: number,
  smoothingFactor: number = 0.4
): ETAPrediction {
  const smoothedTotal = Math.round(
    previous.totalSeconds * (1 - smoothingFactor) + newTotalSeconds * smoothingFactor
  );
  const delta = smoothedTotal - previous.totalSeconds;
  return {
    ...previous,
    totalSeconds: smoothedTotal,
    breakdown: {
      prepSeconds: previous.breakdown.prepSeconds,
      pickupDriveSeconds: previous.breakdown.pickupDriveSeconds,
      deliveryDriveSeconds: Math.max(60, previous.breakdown.deliveryDriveSeconds + delta),
    },
    display: formatDuration(smoothedTotal),
    rangeDisplay: `${formatDuration(Math.max(0, smoothedTotal - previous.uncertaintySeconds))} – ${formatDuration(smoothedTotal + previous.uncertaintySeconds)}`,
    confidence: Math.min(1, previous.confidence + 0.02),
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}min`;
}
