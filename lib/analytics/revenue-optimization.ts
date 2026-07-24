/**
 * Revenue Optimization Library
 * ────────────────────────────
 * Surge, fees, commissions, discount efficiency, coupon abuse.
 */

export interface SurgeOpportunity {
  zone_id: string;
  current_demand: number;
  current_supply: number;
  recommended_surge_multiplier: number;
  expected_revenue_increase: number;
  confidence: number;
}

export function detectSurgeOpportunities(
  zoneMetrics: Array<{ zone_id: string; demand: number; supply: number }>
): SurgeOpportunity[] {
  return zoneMetrics
    .map((z) => {
      const ratio = z.supply > 0 ? z.demand / z.supply : 0;
      let surge = 1.0;
      if (ratio > 1.5) surge = 1.3;
      if (ratio > 2.0) surge = 1.5;
      if (ratio > 2.5) surge = 1.8;
      if (ratio > 3.0) surge = 2.0;

      // Estimated revenue increase: surge-1 × 60% of order count × avg €25
      const increase = (surge - 1) * z.demand * 25 * 0.6;
      const confidence = Math.min(1, ratio / 3);

      return {
        zone_id: z.zone_id,
        current_demand: z.demand,
        current_supply: z.supply,
        recommended_surge_multiplier: surge,
        expected_revenue_increase: increase,
        confidence,
      };
    })
    .filter((s) => s.recommended_surge_multiplier > 1.0);
}

export interface DeliveryFeeRecommendation {
  zone_id: string;
  current_fee: number;
  recommended_fee: number;
  rationale: string;
}

export function recommendDeliveryFees(
  zoneMetrics: Array<{ zone_id: string; demand: number; supply: number; avg_distance_km: number }>
): DeliveryFeeRecommendation[] {
  return zoneMetrics.map((z) => {
    const baseFee = 2.5;
    const distanceCost = z.avg_distance_km * 0.5;
    const dynamicAdj = z.demand > z.supply ? 1.5 : 0;
    const recommended = baseFee + distanceCost + dynamicAdj;

    let rationale = `Base €${baseFee} + distance €${distanceCost.toFixed(2)}`;
    if (dynamicAdj) rationale += ` + surge €${dynamicAdj.toFixed(2)}`;

    return {
      zone_id: z.zone_id,
      current_fee: 2.5, // could be fetched from settings
      recommended_fee: Math.round(recommended * 100) / 100,
      rationale,
    };
  });
}

export interface CouponUsageRow {
  coupon_code: string;
  customer_id: string;
  order_id: string;
  discount_amount: number;
  order_total: number;
  created_at: string;
}

export interface CouponAbuseSignal {
  coupon_code: string;
  customer_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export function detectCouponAbuse(usages: CouponUsageRow[]): CouponAbuseSignal[] {
  const signals: CouponAbuseSignal[] = [];

  // 1. Multiple accounts same coupon
  const byCoupon = new Map<string, CouponUsageRow[]>();
  for (const u of usages) {
    if (!byCoupon.has(u.coupon_code)) byCoupon.set(u.coupon_code, []);
    byCoupon.get(u.coupon_code)!.push(u);
  }

  for (const [code, codeUsages] of byCoupon) {
    // Many uses by single customer
    const byCustomer = new Map<string, CouponUsageRow[]>();
    for (const u of codeUsages) {
      if (!byCustomer.has(u.customer_id)) byCustomer.set(u.customer_id, []);
      byCustomer.get(u.customer_id)!.push(u);
    }
    for (const [cid, cUsages] of byCustomer) {
      if (cUsages.length > 5) {
        signals.push({
          coupon_code: code,
          customer_id: cid,
          reason: `Customer used coupon ${cUsages.length} times`,
          severity: cUsages.length > 10 ? 'high' : 'medium',
        });
      }
    }

    // Order total below coupon value
    for (const u of codeUsages) {
      if (u.discount_amount >= u.order_total * 0.9) {
        signals.push({
          coupon_code: code,
          customer_id: u.customer_id,
          reason: `Discount ${(u.discount_amount / u.order_total * 100).toFixed(0)}% of order total`,
          severity: 'low',
        });
      }
    }
  }

  return signals;
}

export interface DiscountEfficiency {
  campaign: string;
  redemptions: number;
  total_discount: number;
  revenue_attributed: number;
  roi: number;
}

export function computeDiscountROI(
  campaignName: string,
  redemptions: number,
  totalDiscount: number,
  revenueAttributed: number
): DiscountEfficiency {
  return {
    campaign: campaignName,
    redemptions,
    total_discount: totalDiscount,
    revenue_attributed: revenueAttributed,
    roi: totalDiscount > 0 ? (revenueAttributed - totalDiscount) / totalDiscount : 0,
  };
}

export interface CommissionRecommendation {
  restaurant_id: string;
  current_rate: number;
  recommended_rate: number;
  expected_impact: string;
}

export function recommendCommissions(
  restaurants: Array<{ restaurant_id: string; monthly_revenue: number; monthly_orders: number; rating: number }>
): CommissionRecommendation[] {
  return restaurants.map((r) => {
    let rate = 0.15; // base 15%
    let rationale = 'Standard rate';

    if (r.monthly_revenue > 10000) {
      rate = 0.12;
      rationale = 'High-volume restaurant: reduced rate to retain';
    } else if (r.rating < 4) {
      rate = 0.18;
      rationale = 'Low rating: increase to compensate for churn risk';
    } else if (r.monthly_orders < 30) {
      rate = 0.10;
      rationale = 'New/low-volume: incentivize';
    }

    return {
      restaurant_id: r.restaurant_id,
      current_rate: 0.15,
      recommended_rate: rate,
      expected_impact: rationale,
    };
  });
}
