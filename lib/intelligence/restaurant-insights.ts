/**
 * Restaurant Intelligence
 * ───────────────────────
 * Smart operational insights for restaurants:
 * - Peak hour prediction
 * - Preparation bottleneck detection
 * - Frequently delayed items
 * - Capacity recommendations
 * - Busy-period forecasting
 *
 * All deterministic — uses historical order data to compute statistics.
 */

export interface HourlyVolume {
  hour: number; // 0-23
  orderCount: number;
  averagePrepMin: number;
  averageValue: number;
  cancelledCount: number;
}

export interface DailyPattern {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  totalOrders: number;
  averagePrepMin: number;
}

export interface ItemPerformance {
  productId: string;
  productName: string;
  orderCount: number;
  averagePrepMin: number;
  /** Frequency of being a bottleneck (top 10% slowest orders). */
  bottleneckRate: number;
}

export interface RestaurantInsight {
  type: 'peak-hour' | 'bottleneck' | 'capacity' | 'busy-forecast' | 'preparation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  /** Confidence 0-1. */
  confidence: number;
  /** Suggested action. */
  action?: { label: string; href?: string };
}

export interface PeakHourPrediction {
  hour: number;
  predictedOrders: number;
  isPeak: boolean;
  /** 95% confidence interval. */
  rangeLow: number;
  rangeHigh: number;
}

export function detectPeakHours(hourly: HourlyVolume[]): PeakHourPrediction[] {
  if (hourly.length === 0) return [];
  // Find median to set threshold
  const counts = hourly.map((h) => h.orderCount).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const peakThreshold = Math.max(median * 1.5, 5);
  return hourly.map((h) => {
    const isPeak = h.orderCount >= peakThreshold;
    // 95% CI: ± 1.96 * sqrt(variance)
    const variance = h.orderCount * 0.3; // rough estimate
    const stdDev = Math.sqrt(variance);
    return {
      hour: h.hour,
      predictedOrders: h.orderCount,
      isPeak,
      rangeLow: Math.max(0, Math.round(h.orderCount - 1.96 * stdDev)),
      rangeHigh: Math.round(h.orderCount + 1.96 * stdDev),
    };
  });
}

export function generateInsights(input: {
  hourly: HourlyVolume[];
  daily: DailyPattern[];
  items: ItemPerformance[];
  currentActiveOrders: number;
  maxCapacity: number;
}): RestaurantInsight[] {
  const insights: RestaurantInsight[] = [];

  // 1. Peak hour detection
  const peaks = detectPeakHours(input.hourly).filter((p) => p.isPeak);
  if (peaks.length > 0) {
    const currentHour = new Date().getHours();
    const nextPeak = peaks.find((p) => p.hour > currentHour) ?? peaks[0];
    if (nextPeak) {
      insights.push({
        type: 'peak-hour',
        severity: 'info',
        title: `Peak at ${nextPeak.hour}:00`,
        description: `Expect ${nextPeak.predictedOrders} orders (range ${nextPeak.rangeLow}-${nextPeak.rangeHigh})`,
        recommendation: 'Pre-prep popular items and enable additional staff',
        confidence: 0.75,
      });
    }
  }

  // 2. Capacity warning
  if (input.currentActiveOrders >= input.maxCapacity * 0.8) {
    insights.push({
      type: 'capacity',
      severity: input.currentActiveOrders >= input.maxCapacity ? 'critical' : 'warning',
      title: `${input.currentActiveOrders}/${input.maxCapacity} active orders`,
      description:
        input.currentActiveOrders >= input.maxCapacity
          ? 'You are at capacity — new orders will be rejected'
          : 'Approaching capacity limit',
      recommendation: 'Consider activating busy mode to slow incoming orders',
      confidence: 1,
      action: { label: 'Activate busy mode' },
    });
  }

  // 3. Bottleneck detection
  const bottleneckItems = input.items
    .filter((i) => i.bottleneckRate > 0.3 && i.orderCount >= 5)
    .sort((a, b) => b.bottleneckRate - a.bottleneckRate)
    .slice(0, 3);
  for (const item of bottleneckItems) {
    insights.push({
      type: 'bottleneck',
      severity: 'warning',
      title: `${item.productName} is a bottleneck`,
      description: `${Math.round(item.bottleneckRate * 100)}% of orders containing this item are slow (avg ${item.averagePrepMin} min)`,
      recommendation: 'Consider pre-prep, simplifying recipe, or removing from menu',
      confidence: Math.min(1, item.orderCount / 20),
    });
  }

  // 4. Slowest day detection
  if (input.daily.length >= 7) {
    const avg = input.daily.reduce((s, d) => s + d.totalOrders, 0) / input.daily.length;
    const slowDays = input.daily.filter((d) => d.totalOrders < avg * 0.6);
    if (slowDays.length > 0) {
      insights.push({
        type: 'preparation',
        severity: 'info',
        title: 'Lower volume days',
        description: `${slowDays.length} day(s) with below-average volume — use for prep and rest`,
        recommendation: 'Schedule menu prep and inventory during these windows',
        confidence: 0.6,
      });
    }
  }

  return insights;
}

export function suggestCapacityRecommendation(
  hourly: HourlyVolume[],
  currentMax: number
): { recommendedMax: number; reason: string } {
  if (hourly.length === 0) {
    return { recommendedMax: currentMax, reason: 'Not enough data' };
  }
  const maxHourlyVolume = Math.max(...hourly.map((h) => h.orderCount));
  // Recommend capacity to handle peak with 80% utilization
  const recommended = Math.max(currentMax, Math.ceil(maxHourlyVolume / 0.8));
  if (recommended === currentMax) {
    return { recommendedMax: currentMax, reason: 'Current capacity is optimal' };
  }
  return {
    recommendedMax: recommended,
    reason: `Peak demand of ${maxHourlyVolume} orders suggests ${recommended} as optimal capacity`,
  };
}
