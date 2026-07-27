/**
 * Metrics Aggregator
 * ──────────────────
 * Lightweight in-memory metrics with Prometheus-compatible text output.
 * 
 * Metric types:
 * - Counter: monotonic, only increases (requests_total, errors_total)
 * - Gauge: current value (active_connections, queue_depth)
 * - Histogram: distribution (request_duration_ms, response_size_bytes)
 */

export interface Counter {
  type: 'counter';
  name: string;
  help: string;
  values: Map<string, number>; // labels -> value
}

export interface Gauge {
  type: 'gauge';
  name: string;
  help: string;
  values: Map<string, number>;
}

export interface Histogram {
  type: 'histogram';
  name: string;
  help: string;
  buckets: number[]; // upper bounds
  counts: Map<string, Map<number, number>>; // labels -> bucket -> count
  sums: Map<string, number>;
  totals: Map<string, number>;
}

export type Metric = Counter | Gauge | Histogram;

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  counter(name: string, help: string): Counter {
    if (this.metrics.has(name)) return this.metrics.get(name) as Counter;
    const c: Counter = { type: 'counter', name, help, values: new Map() };
    this.metrics.set(name, c);
    return c;
  }

  gauge(name: string, help: string): Gauge {
    if (this.metrics.has(name)) return this.metrics.get(name) as Gauge;
    const g: Gauge = { type: 'gauge', name, help, values: new Map() };
    this.metrics.set(name, g);
    return g;
  }

  histogram(name: string, help: string, buckets: number[] = DEFAULT_BUCKETS): Histogram {
    if (this.metrics.has(name)) return this.metrics.get(name) as Histogram;
    const h: Histogram = {
      type: 'histogram', name, help, buckets, counts: new Map(), sums: new Map(), totals: new Map(),
    };
    this.metrics.set(name, h);
    return h;
  }

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const m = this.metrics.get(name);
    if (!m || m.type !== 'counter') return;
    const key = labelsToKey(labels);
    m.values.set(key, (m.values.get(key) ?? 0) + value);
  }

  set(name: string, value: number, labels: Record<string, string> = {}): void {
    const m = this.metrics.get(name);
    if (!m || m.type !== 'gauge') return;
    m.values.set(labelsToKey(labels), value);
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const m = this.metrics.get(name);
    if (!m || m.type !== 'histogram') return;
    const key = labelsToKey(labels);
    let counts = m.counts.get(key);
    if (!counts) {
      counts = new Map();
      m.counts.set(key, counts);
      m.sums.set(key, 0);
      m.totals.set(key, 0);
    }
    for (const bucket of m.buckets) {
      if (value <= bucket) {
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      }
    }
    counts.set(Infinity, (counts.get(Infinity) ?? 0) + 1);
    m.sums.set(key, (m.sums.get(key) ?? 0) + value);
    m.totals.set(key, (m.totals.get(key) ?? 0) + 1);
  }

  /**
   * Export in Prometheus text format.
   */
  toPrometheus(): string {
    const lines: string[] = [];
    for (const m of this.metrics.values()) {
      lines.push(`# HELP ${m.name} ${m.help}`);
      lines.push(`# TYPE ${m.name} ${m.type}`);
      if (m.type === 'counter' || m.type === 'gauge') {
        for (const [labels, value] of m.values) {
          lines.push(`${m.name}${formatLabels(labels)} ${value}`);
        }
      } else if (m.type === 'histogram') {
        for (const [labels, counts] of m.counts) {
          const parsedLabels = keyToLabels(labels);
          for (const bucket of m.buckets) {
            const labelSet = { ...parsedLabels, le: String(bucket) };
            lines.push(`${m.name}_bucket${formatLabelsObj(labelSet)} ${counts.get(bucket) ?? 0}`);
          }
          const labelSetInf = { ...parsedLabels, le: '+Inf' };
          lines.push(`${m.name}_bucket${formatLabelsObj(labelSetInf)} ${counts.get(Infinity) ?? 0}`);
          lines.push(`${m.name}_sum${formatLabels(labels)} ${m.sums.get(labels) ?? 0}`);
          lines.push(`${m.name}_count${formatLabels(labels)} ${m.totals.get(labels) ?? 0}`);
        }
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Export as JSON for internal monitoring.
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, m] of this.metrics) {
      if (m.type === 'histogram') {
        result[name] = {
          type: m.type,
          buckets: m.buckets,
          counts: Object.fromEntries(
            [...m.counts.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
          ),
          sums: Object.fromEntries(m.sums),
          totals: Object.fromEntries(m.totals),
        };
      } else {
        result[name] = {
          type: m.type,
          values: Object.fromEntries(m.values),
        };
      }
    }
    return result;
  }

  getAll(): Metric[] {
    return Array.from(this.metrics.values());
  }
}

function labelsToKey(labels: Record<string, string>): string {
  if (Object.keys(labels).length === 0) return '';
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

function keyToLabels(key: string): Record<string, string> {
  if (!key) return {};
  const result: Record<string, string> = {};
  for (const pair of key.split(',')) {
    const [k, v] = pair.split('=');
    if (k && v !== undefined) result[k] = v;
  }
  return result;
}

function formatLabels(labelKey: string): string {
  if (!labelKey) return '';
  const labels = keyToLabels(labelKey);
  return formatLabelsObj(labels);
}

function formatLabelsObj(labels: Record<string, string | number>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  return '{' + keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',') + '}';
}

// Singleton registry
export const registry = new MetricsRegistry();

// Pre-register common metrics
export const httpRequestsTotal = registry.counter(
  'http_requests_total',
  'Total HTTP requests'
);
export const httpRequestDurationMs = registry.histogram(
  'http_request_duration_ms',
  'HTTP request duration in milliseconds'
);
export const httpErrorsTotal = registry.counter(
  'http_errors_total',
  'Total HTTP errors'
);
export const activeConnections = registry.gauge(
  'active_connections',
  'Currently active connections'
);
export const dbQueriesTotal = registry.counter(
  'db_queries_total',
  'Total database queries'
);
export const dbQueryDurationMs = registry.histogram(
  'db_query_duration_ms',
  'Database query duration in milliseconds'
);
export const cacheHitsTotal = registry.counter(
  'cache_hits_total',
  'Total cache hits'
);
export const cacheMissesTotal = registry.counter(
  'cache_misses_total',
  'Total cache misses'
);
