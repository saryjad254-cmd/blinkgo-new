/**
 * Server Metrics — Lightweight APM
 * ────────────────────────────────
 * Collects:
 *  - Endpoint latency (p50, p95, p99)
 *  - Error rate per endpoint
 *  - Active connections
 *  - Memory usage
 *  - Cache hit rate
 */

import { logger } from '@/lib/logging';

interface EndpointStats {
  count: number;
  totalMs: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  lastUpdated: number;
}

const stats = new Map<string, EndpointStats>();
const RECENT_WINDOW = 100; // last 100 requests

class RingBuffer {
  private buffer: number[] = [];
  private capacity: number;
  constructor(capacity: number = RECENT_WINDOW) {
    this.capacity = capacity;
  }
  push(v: number) {
    if (this.buffer.length >= this.capacity) this.buffer.shift();
    this.buffer.push(v);
  }
  percentile(p: number): number {
    if (this.buffer.length === 0) return 0;
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
  sum(): number {
    return this.buffer.reduce((s, v) => s + v, 0);
  }
  count(): number {
    return this.buffer.length;
  }
}

const latencyBuffers = new Map<string, RingBuffer>();
const errorCounts = new Map<string, number>();

export function recordEndpointLatency(endpoint: string, durationMs: number, isError: boolean) {
  let buf = latencyBuffers.get(endpoint);
  if (!buf) {
    buf = new RingBuffer();
    latencyBuffers.set(endpoint, buf);
  }
  buf.push(durationMs);

  if (isError) {
    errorCounts.set(endpoint, (errorCounts.get(endpoint) || 0) + 1);
  }

  // Periodically log
  if (buf.count() % 50 === 0) {
    logger.debug('Endpoint stats', {
      endpoint,
      p50: buf.percentile(50),
      p95: buf.percentile(95),
      p99: buf.percentile(99),
      errors: errorCounts.get(endpoint) || 0,
    });
  }
}

export function getAllEndpointStats(): Record<string, {
  count: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
}> {
  const result: Record<string, any> = {};
  for (const [ep, buf] of latencyBuffers.entries()) {
    result[ep] = {
      count: buf.count(),
      avgMs: buf.count() > 0 ? Math.round(buf.sum() / buf.count()) : 0,
      p50: Math.round(buf.percentile(50)),
      p95: Math.round(buf.percentile(95)),
      p99: Math.round(buf.percentile(99)),
      errors: errorCounts.get(ep) || 0,
    };
  }
  return result;
}

export function getSystemStats() {
  const mem = process.memoryUsage();
  return {
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024),
    },
    uptime: process.uptime(),
    pid: process.pid,
    node_version: process.version,
  };
}
