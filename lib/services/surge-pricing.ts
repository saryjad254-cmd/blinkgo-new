/**
 * Surge Pricing Engine
 * ────────────────────
 * Dynamic delivery fee calculation based on demand.
 *
 * Inputs:
 *  - Current time (peak hours)
 *  - Active drivers in zone
 *  - Pending orders in zone
 *  - Weather conditions (future)
 *  - Special events (future)
 *
 * Formula:
 *   multiplier = base × time_factor × demand_factor
 *   surge_fee = base_fee × max(1, multiplier)
 */

const TIME_FACTORS: Record<string, number> = {
  // Peak hours: 11-13 (lunch), 18-21 (dinner)
  '00': 1.0, '01': 1.0, '02': 1.0, '03': 1.0, '04': 1.0, '05': 1.0,
  '06': 1.0, '07': 1.0, '08': 1.0, '09': 1.0, '10': 1.0,
  '11': 1.3, '12': 1.4, '13': 1.3, '14': 1.1, '15': 1.0, '16': 1.0,
  '17': 1.2, '18': 1.4, '19': 1.5, '20': 1.4, '21': 1.3, '22': 1.1, '23': 1.0,
};

export interface SurgeInput {
  /** Current pending orders in zone (high = high demand) */
  pendingOrders: number;
  /** Currently online drivers in zone (low = surge) */
  onlineDrivers: number;
  /** Base delivery fee (EUR) */
  baseFee?: number;
  /** Manual override (e.g. weather event) */
  manualMultiplier?: number;
  /** Disable surge entirely */
  enabled?: boolean;
}

export interface SurgeResult {
  baseFee: number;
  surgeMultiplier: number;
  surgeFee: number;
  totalFee: number;
  isPeakHour: boolean;
  reason: string;
}

const DEFAULT_BASE_FEE = 3.99;

/**
 * Calculate surge pricing for an order.
 */
export function calculateSurge(input: SurgeInput): SurgeResult {
  const baseFee = input.baseFee ?? DEFAULT_BASE_FEE;

  if (input.enabled === false) {
    return {
      baseFee,
      surgeMultiplier: 1.0,
      surgeFee: baseFee,
      totalFee: baseFee,
      isPeakHour: false,
      reason: 'Surge disabled',
    };
  }

  // Time factor (peak hours)
  const hour = String(new Date().getHours()).padStart(2, '0');
  const timeFactor = TIME_FACTORS[hour] ?? 1.0;
  const isPeakHour = timeFactor > 1.0;

  // Demand factor: orders per driver ratio
  // 2+ orders per driver = surge
  let demandFactor = 1.0;
  if (input.onlineDrivers > 0) {
    const ratio = input.pendingOrders / input.onlineDrivers;
    if (ratio >= 4) demandFactor = 1.8;
    else if (ratio >= 3) demandFactor = 1.5;
    else if (ratio >= 2) demandFactor = 1.3;
    else if (ratio >= 1.5) demandFactor = 1.15;
  } else if (input.pendingOrders > 0) {
    // No drivers available, big surge
    demandFactor = 2.0;
  }

  // Combine
  const rawMultiplier = timeFactor * demandFactor;
  const surgeMultiplier = input.manualMultiplier ?? Math.min(2.0, rawMultiplier);

  const totalFee = baseFee * surgeMultiplier;

  let reason = 'Normal';
  if (surgeMultiplier > 1.0) {
    const reasons: string[] = [];
    if (isPeakHour) reasons.push('peak hour');
    if (demandFactor > 1.0) reasons.push('high demand');
    reason = reasons.join(' + ');
  }

  return {
    baseFee,
    surgeMultiplier: Math.round(surgeMultiplier * 100) / 100,
    surgeFee: Math.round(totalFee * 100) / 100,
    totalFee: Math.round(totalFee * 100) / 100,
    isPeakHour,
    reason,
  };
}

/**
 * Get human-readable label for surge level.
 */
export function getSurgeLabel(multiplier: number, locale: 'de' | 'ar' | 'en' = 'de'): string {
  if (multiplier <= 1.0) {
    return locale === 'ar' ? 'سعر عادي' : locale === 'en' ? 'Regular price' : 'Normalpreis';
  }
  if (multiplier < 1.3) {
    return locale === 'ar' ? 'طلب مرتفع قليلاً' : locale === 'en' ? 'Slightly high demand' : 'Leicht erhöhte Nachfrage';
  }
  if (multiplier < 1.6) {
    return locale === 'ar' ? 'طلب مرتفع' : locale === 'en' ? 'High demand' : 'Hohe Nachfrage';
  }
  return locale === 'ar' ? 'طلب مرتفع جداً' : locale === 'en' ? 'Very high demand' : 'Sehr hohe Nachfrage';
}
