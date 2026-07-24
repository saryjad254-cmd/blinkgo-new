/**
 * Finance Service
 * ───────────────
 * Revenue, commission, and payout analytics for admin dashboards.
 * Reads PLATFORM_COMMISSION_RATE, COMMISSION_RATE from config/fees.
 */

import {
  COMMISSION_RATE,
  PLATFORM_COMMISSION_RATE,
  STANDARD_DELIVERY_FEE,
  SERVICE_FEE_RATE,
} from '@/lib/config/fees';
import { createServiceClient } from '@/lib/supabase/service';
import { computeEarnings } from './driver-earnings';

const RESTAURANT_PAYOUT_RATE = 0.85; // 85% of subtotal to restaurant

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

export interface FinanceSummary {
  revenue: {
    today: number;
    week: number;
    month: number;
    year: number;
    allTime: number;
  };
  orders: {
    today: number;
    week: number;
    month: number;
    year: number;
    allTime: number;
  };
  commission: {
    today: number;
    week: number;
    month: number;
    year: number;
    allTime: number;
    rate: number;
  };
  deliveryFees: {
    today: number;
    week: number;
    month: number;
    year: number;
    allTime: number;
  };
  tips: {
    today: number;
    week: number;
    month: number;
    year: number;
    allTime: number;
  };
  refunds: {
    total: number;
    count: number;
  };
  couponImpact: {
    totalDiscount: number;
    orderCount: number;
  };
  payouts: {
    restaurants: number; // total payout to restaurants
    drivers: number; // total payout to drivers
  };
  dailySeries: Array<{
    date: string;
    revenue: number;
    orders: number;
    commission: number;
  }>;
  monthlySeries: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const cached = cacheGet<FinanceSummary>('ops:finance');
  if (cached) return cached;

  const svc = createServiceClient();
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 30);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // Fetch up to 5000 recent orders (covers the year)
  const { data: orders } = await svc
    .from('orders')
    .select('id, total, delivery_fee, tip, discount, created_at, status, refunded_at, refund_amount, customer_id, restaurant_id, driver_id')
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(5000);

  const refundsRes = await svc
    .from('orders')
    .select('id, refund_amount, refunded_at')
    .not('refunded_at', 'is', null)
    .order('refunded_at', { ascending: false })
    .limit(500);

  const ordersList = orders ?? [];
  const refundsList = refundsRes.data ?? [];

  // Compute buckets
  const buckets = {
    today: { revenue: 0, orders: 0, fee: 0, tip: 0 },
    week: { revenue: 0, orders: 0, fee: 0, tip: 0 },
    month: { revenue: 0, orders: 0, fee: 0, tip: 0 },
    year: { revenue: 0, orders: 0, fee: 0, tip: 0 },
    allTime: { revenue: 0, orders: 0, fee: 0, tip: 0 },
  };
  const dailyMap = new Map<string, { revenue: number; orders: number; fee: number; tip: number }>();
  const monthlyMap = new Map<string, { revenue: number; orders: number }>();
  let couponDiscountTotal = 0;
  let couponOrderCount = 0;
  let payoutRestaurants = 0;
  let payoutDrivers = 0;

  for (const o of ordersList) {
    const d = new Date(o.created_at);
    const total = Number(o.total ?? 0);
    const fee = Number(o.delivery_fee ?? 0);
    const tip = Number(o.tip ?? 0);
    const discount = Number(o.discount ?? 0);
    if (d >= todayStart) {
      buckets.today.revenue += total; buckets.today.orders += 1; buckets.today.fee += fee; buckets.today.tip += tip;
    }
    if (d >= weekStart) {
      buckets.week.revenue += total; buckets.week.orders += 1; buckets.week.fee += fee; buckets.week.tip += tip;
    }
    if (d >= monthStart) {
      buckets.month.revenue += total; buckets.month.orders += 1; buckets.month.fee += fee; buckets.month.tip += tip;
    }
    if (d >= yearStart) {
      buckets.year.revenue += total; buckets.year.orders += 1; buckets.year.fee += fee; buckets.year.tip += tip;
    }
    buckets.allTime.revenue += total; buckets.allTime.orders += 1; buckets.allTime.fee += fee; buckets.allTime.tip += tip;

    // Daily series
    const dateKey = d.toISOString().slice(0, 10);
    const dEntry = dailyMap.get(dateKey) ?? { revenue: 0, orders: 0, fee: 0, tip: 0 };
    dEntry.revenue += total; dEntry.orders += 1; dEntry.fee += fee; dEntry.tip += tip;
    dailyMap.set(dateKey, dEntry);

    // Monthly series
    const monthKey = d.toISOString().slice(0, 7);
    const mEntry = monthlyMap.get(monthKey) ?? { revenue: 0, orders: 0 };
    mEntry.revenue += total; mEntry.orders += 1;
    monthlyMap.set(monthKey, mEntry);

    // Coupon discount
    if (discount > 0) {
      couponDiscountTotal += discount;
      couponOrderCount += 1;
    }

    // Payouts: 85% of (total - delivery_fee) to restaurant, 80% of delivery_fee + tip to driver
    const subtotal = total - fee;
    payoutRestaurants += Math.max(0, subtotal * RESTAURANT_PAYOUT_RATE);
    const driverEarnings = computeEarnings({ delivery_fee: fee, tip }).total;
    payoutDrivers += driverEarnings;
  }

  // Refunds
  const totalRefunds = refundsList.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
  const refundCount = refundsList.length;

  // Daily series (last 30 days, fill missing with 0)
  const dailySeries: FinanceSummary['dailySeries'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(todayStart); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(k) ?? { revenue: 0, orders: 0, fee: 0, tip: 0 };
    dailySeries.push({
      date: k,
      revenue: entry.revenue,
      orders: entry.orders,
      commission: entry.revenue * PLATFORM_COMMISSION_RATE,
    });
  }

  // Monthly series
  const monthlySeries: FinanceSummary['monthlySeries'] = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const result: FinanceSummary = {
    revenue: {
      today: buckets.today.revenue,
      week: buckets.week.revenue,
      month: buckets.month.revenue,
      year: buckets.year.revenue,
      allTime: buckets.allTime.revenue,
    },
    orders: {
      today: buckets.today.orders,
      week: buckets.week.orders,
      month: buckets.month.orders,
      year: buckets.year.orders,
      allTime: buckets.allTime.orders,
    },
    commission: {
      today: buckets.today.revenue * PLATFORM_COMMISSION_RATE,
      week: buckets.week.revenue * PLATFORM_COMMISSION_RATE,
      month: buckets.month.revenue * PLATFORM_COMMISSION_RATE,
      year: buckets.year.revenue * PLATFORM_COMMISSION_RATE,
      allTime: buckets.allTime.revenue * PLATFORM_COMMISSION_RATE,
      rate: PLATFORM_COMMISSION_RATE,
    },
    deliveryFees: {
      today: buckets.today.fee,
      week: buckets.week.fee,
      month: buckets.month.fee,
      year: buckets.year.fee,
      allTime: buckets.allTime.fee,
    },
    tips: {
      today: buckets.today.tip,
      week: buckets.week.tip,
      month: buckets.month.tip,
      year: buckets.year.tip,
      allTime: buckets.allTime.tip,
    },
    refunds: { total: totalRefunds, count: refundCount },
    couponImpact: { totalDiscount: couponDiscountTotal, orderCount: couponOrderCount },
    payouts: { restaurants: payoutRestaurants, drivers: payoutDrivers },
    dailySeries,
    monthlySeries,
  };
  // fix: tip allTime
  (result.tips as any).allTime = buckets.allTime.tip;

  cacheSet('ops:finance', result, 60_000);
  return result;
}

// ─────────────────────────────────────────────────────────────

export function clearFinanceCache(): void { cache.clear(); }
