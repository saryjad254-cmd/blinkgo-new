/**
 * Latency tracking — rolling window for performance monitoring.
 */
const latencyBuffer: { ts: number; ms: number; route: string }[] = [];
const LATENCY_BUFFER_MAX = 1000;

export function recordLatency(route: string, ms: number) {
  latencyBuffer.push({ ts: Date.now(), ms, route });
  if (latencyBuffer.length > LATENCY_BUFFER_MAX) {
    latencyBuffer.splice(0, latencyBuffer.length - LATENCY_BUFFER_MAX);
  }
}

export function getLatencyStats() {
  if (latencyBuffer.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, avg: 0, by_route: {} };
  }

  const sorted = [...latencyBuffer].map((l) => l.ms).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const avg = sorted.reduce((s, n) => s + n, 0) / sorted.length;

  // Per-route breakdown
  const byRoute: Record<string, { count: number; avg: number; p95: number }> = {};
  const routeGroups: Record<string, number[]> = {};
  for (const l of latencyBuffer) {
    if (!routeGroups[l.route]) routeGroups[l.route] = [];
    routeGroups[l.route].push(l.ms);
  }
  for (const [route, mss] of Object.entries(routeGroups)) {
    const rSorted = [...mss].sort((a, b) => a - b);
    byRoute[route] = {
      count: mss.length,
      avg: Math.round(rSorted.reduce((s, n) => s + n, 0) / rSorted.length),
      p95: Math.round(rSorted[Math.floor(rSorted.length * 0.95)] ?? 0),
    };
  }

  return {
    count: latencyBuffer.length,
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    avg: Math.round(avg),
    by_route: byRoute,
  };
}
