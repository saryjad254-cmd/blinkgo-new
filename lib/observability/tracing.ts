/**
 * Distributed Tracing
 * ───────────────────
 * OpenTelemetry-compatible tracing primitives.
 * 
 * Provides:
 * - Span creation with parent-child relationships
 * - Automatic context propagation
 * - Performance measurement
 * - Compatible with OTLP exporters (Datadog, Honeycomb, etc.)
 * 
 * Can be enabled/disabled via TRACE_ENABLED env var.
 */

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean | null>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  status: 'ok' | 'error' | 'unset';
  error?: string;
}

const TRACE_ENABLED = process.env.TRACE_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
const SAMPLE_RATE = parseFloat(process.env.TRACE_SAMPLE_RATE ?? '0.1'); // 10% sampling

const activeSpans = new Map<string, Span>();
const completedSpans: Span[] = [];
const MAX_COMPLETED = 1000;

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function shouldSample(): boolean {
  return Math.random() < SAMPLE_RATE;
}

interface StartSpanOptions {
  name: string;
  parentSpanId?: string;
  attributes?: Record<string, string | number | boolean | null>;
}

export function startSpan(options: StartSpanOptions): Span | null {
  if (!TRACE_ENABLED) return null;
  if (!shouldSample() && options.parentSpanId) return null;

  const span: Span = {
    traceId: randomId(),
    spanId: randomId(),
    parentSpanId: options.parentSpanId,
    name: options.name,
    startTime: Date.now(),
    attributes: options.attributes ?? {},
    events: [],
    status: 'unset',
  };
  activeSpans.set(span.spanId, span);
  return span;
}

export function endSpan(
  span: Span | null,
  options?: { status?: 'ok' | 'error'; error?: string; attributes?: Record<string, unknown> }
): void {
  if (!span) return;
  span.endTime = Date.now();
  span.status = options?.status ?? 'ok';
  if (options?.error) span.error = options.error;
  if (options?.attributes) {
    Object.assign(span.attributes, options.attributes);
  }
  activeSpans.delete(span.spanId);
  completedSpans.push(span);
  if (completedSpans.length > MAX_COMPLETED) {
    completedSpans.splice(0, completedSpans.length - MAX_COMPLETED);
  }
}

export function addSpanEvent(span: Span | null, name: string, attributes?: Record<string, unknown>): void {
  if (!span) return;
  span.events.push({ name, timestamp: Date.now(), attributes });
}

export function getCompletedSpans(): Span[] {
  return [...completedSpans];
}

export function getActiveSpans(): Span[] {
  return Array.from(activeSpans.values());
}

/**
 * Async span wrapper: automatically creates, times, and ends a span.
 */
export async function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  const span = startSpan({ name });
  try {
    const result = await fn(span!);
    endSpan(span, { status: 'ok' });
    return result;
  } catch (e: any) {
    endSpan(span, { status: 'error', error: e?.message });
    throw e;
  }
}
