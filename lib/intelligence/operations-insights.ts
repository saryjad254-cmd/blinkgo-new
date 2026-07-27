/**
 * Operations Intelligence
 * ───────────────────────
 * Platform-wide insights for admin operators.
 * - Predicted demand
 * - Driver shortage detection
 * - Restaurant overload
 * - Delivery hotspots
 * - SLA risk alerts
 */

export interface OrderMetrics {
  hour: number;
  count: number;
  cancelled: number;
  delivered: number;
  averageValue: number;
}

export interface DriverMetrics {
  id: string;
  name: string;
  status: 'online' | 'on_delivery' | 'idle' | 'offline';
  activeOrderCount: number;
  lastDeliveryMinutes: number;
}

export interface OperationsInsight {
  type: 'demand' | 'shortage' | 'overload' | 'hotspot' | 'sla-risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
  action?: { label: string; href?: string };
}

export function predictNextHourDemand(
  historical: OrderMetrics[],
  currentHour: number = new Date().getHours()
): { predicted: number; range: [number, number]; confidence: number } {
  if (historical.length === 0) {
    return { predicted: 0, range: [0, 0], confidence: 0 };
  }
  // Find same hour in historical data
  const sameHour = historical.filter((h) => h.hour === currentHour);
  if (sameHour.length === 0) {
    return { predicted: 0, range: [0, 0], confidence: 0 };
  }
  const avg = sameHour.reduce((s, h) => s + h.count, 0) / sameHour.length;
  const variance = sameHour.reduce((s, h) => s + Math.pow(h.count - avg, 2), 0) / sameHour.length;
  const stdDev = Math.sqrt(variance);
  return {
    predicted: Math.round(avg),
    range: [Math.max(0, Math.round(avg - 1.96 * stdDev)), Math.round(avg + 1.96 * stdDev)],
    confidence: Math.min(1, sameHour.length / 30),
  };
}

export function detectDriverShortage(
  drivers: DriverMetrics[],
  pendingOrders: number
): OperationsInsight | null {
  const onlineDrivers = drivers.filter((d) => d.status === 'online' || d.status === 'idle');
  const availableDrivers = drivers.filter((d) => d.status === 'idle' && d.activeOrderCount === 0);

  if (pendingOrders === 0) return null;
  if (availableDrivers.length === 0 && pendingOrders > 3) {
    return {
      type: 'shortage',
      severity: pendingOrders > 10 ? 'critical' : 'warning',
      title: 'Driver shortage',
      description: `${pendingOrders} pending orders but no available drivers (${onlineDrivers.length} online)`,
      recommendation: 'Send recruitment notifications, activate surge pricing, contact idle drivers',
      confidence: 0.9,
      action: { label: 'View drivers' },
    };
  }
  if (availableDrivers.length < pendingOrders / 2) {
    return {
      type: 'shortage',
      severity: 'warning',
      title: 'Low driver availability',
      description: `Only ${availableDrivers.length} available drivers for ${pendingOrders} pending orders`,
      recommendation: 'Monitor delivery times; consider surge if pending exceeds 10',
      confidence: 0.7,
    };
  }
  return null;
}

export function detectRestaurantOverload(
  restaurants: Array<{
    id: string;
    name: string;
    isOnline: boolean;
    isPaused: boolean;
    busyMode: boolean;
    activeOrders: number;
    pendingOrders: number;
    avgPrepMin: number;
  }>
): OperationsInsight[] {
  const insights: OperationsInsight[] = [];
  for (const r of restaurants) {
    if (!r.isOnline) continue;
    if (r.isPaused) continue;
    // Overload: > 5 active + pending > 3 + slow prep
    if (r.activeOrders >= 6 || (r.activeOrders + r.pendingOrders > 8 && r.avgPrepMin > 25)) {
      insights.push({
        type: 'overload',
        severity: r.activeOrders >= 10 ? 'critical' : 'warning',
        title: `${r.name} is overloaded`,
        description: `${r.activeOrders} active + ${r.pendingOrders} pending (avg prep ${r.avgPrepMin}min)`,
        recommendation: 'Suggest activating busy mode, consider pausing new orders',
        confidence: 0.8,
        action: { label: 'View restaurant' },
      });
    }
  }
  return insights;
}

export interface Hotspot {
  /** Lat, Lng (rounded for privacy). */
  lat: number;
  lng: number;
  orderCount: number;
  /** Average delivery time to this hotspot. */
  avgDeliveryMin: number;
}

export function rankHotspots(hotspots: Hotspot[], limit: number = 5): Hotspot[] {
  return [...hotspots]
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, limit);
}

export function detectSLARisks(
  orders: Array<{
    id: string;
    status: string;
    createdAt: Date;
    estimatedReadyAt: Date;
    customerAddress: string;
  }>,
  now: Date = new Date()
): OperationsInsight[] {
  const insights: OperationsInsight[] = [];
  for (const o of orders) {
    if (o.status === 'delivered' || o.status === 'cancelled') continue;
    const totalSeconds = (now.getTime() - o.createdAt.getTime()) / 1000;
    const estimatedSeconds = (o.estimatedReadyAt.getTime() - o.createdAt.getTime()) / 1000;
    // SLA breach: order taking longer than 1.5x estimate
    if (totalSeconds > estimatedSeconds * 1.5) {
      insights.push({
        type: 'sla-risk',
        severity: 'critical',
        title: `Order ${o.id} at SLA risk`,
        description: `Order is ${Math.round((totalSeconds / estimatedSeconds - 1) * 100)}% over estimated delivery time`,
        recommendation: 'Contact restaurant and driver, consider refund',
        confidence: 1,
        action: { label: 'Open order' },
      });
    } else if (totalSeconds > estimatedSeconds * 1.2) {
      insights.push({
        type: 'sla-risk',
        severity: 'warning',
        title: `Order ${o.id} approaching SLA`,
        description: `Order is ${Math.round((totalSeconds / estimatedSeconds - 1) * 100)}% over estimated time`,
        recommendation: 'Monitor closely, may need intervention',
        confidence: 0.8,
        action: { label: 'Open order' },
      });
    }
  }
  return insights;
}

export function generateOperationsInsights(input: {
  drivers: DriverMetrics[];
  restaurants: Array<{
    id: string;
    name: string;
    isOnline: boolean;
    isPaused: boolean;
    busyMode: boolean;
    activeOrders: number;
    pendingOrders: number;
    avgPrepMin: number;
  }>;
  pendingOrders: number;
  orders: Array<{
    id: string;
    status: string;
    createdAt: Date;
    estimatedReadyAt: Date;
    customerAddress: string;
  }>;
  historicalDemand: OrderMetrics[];
}): OperationsInsight[] {
  const insights: OperationsInsight[] = [];
  const shortage = detectDriverShortage(input.drivers, input.pendingOrders);
  if (shortage) insights.push(shortage);
  insights.push(...detectRestaurantOverload(input.restaurants));
  insights.push(...detectSLARisks(input.orders));
  return insights;
}
