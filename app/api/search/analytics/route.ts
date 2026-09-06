/**
 * POST /api/search/analytics
 * GET  /api/search/analytics?type=...
 *
 * Persists search analytics to the database (survives server restart).
 * Privacy-friendly: only query text, counts, no PII.
 *
 * In production, this writes to:
 *   - search_analytics_events (append-only event log, capped at 50K rows)
 *   - search_analytics_aggregates (deduplicated counter table)
 *
 * Frontend dashboard reads aggregates via GET endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getCache } from '@/lib/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminRole } from '@/lib/rbac';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnalyticsEvent {
  type: 'search_submitted' | 'search_zero_result' | 'search_results_clicked' | 'search_to_restaurant' | 'search_to_product';
  query: string;
  resultId?: string;
  resultType?: 'restaurant' | 'product';
  resultCount?: number;
  filterCuisine?: string | null;
  filterSort?: string | null;
  sessionId: string;
}

interface AggregateRow {
  query: string;
  count: number;
  last_seen: string;
}

interface EventRow {
  type: AnalyticsEvent['type'];
  query: string;
}

const VALID_EVENT_TYPES = new Set<AnalyticsEvent['type']>([
  'search_submitted',
  'search_zero_result',
  'search_results_clicked',
  'search_to_restaurant',
  'search_to_product',
]);

const cache = getCache();
const CACHE_TTL = 60_000; // 60s

function getSupabase() {
  // Service-role client (bypasses RLS) for analytics writes
  return createServiceClient();
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned || null;
}

function parseAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const type = typeof source.type === 'string' && VALID_EVENT_TYPES.has(source.type as AnalyticsEvent['type'])
    ? source.type as AnalyticsEvent['type']
    : null;
  const query = cleanText(source.query, 200);
  if (!type || !query) return null;
  const resultType = source.resultType === 'restaurant' || source.resultType === 'product'
    ? source.resultType
    : undefined;
  const resultCount = typeof source.resultCount === 'number' && Number.isInteger(source.resultCount)
    && source.resultCount >= 0 && source.resultCount <= 10_000
    ? source.resultCount
    : undefined;
  return {
    type,
    query,
    resultId: cleanText(source.resultId, 64) ?? undefined,
    resultType,
    resultCount,
    filterCuisine: cleanText(source.filterCuisine, 64),
    filterSort: cleanText(source.filterSort, 32),
    sessionId: cleanText(source.sessionId, 128) ?? 'anonymous',
  };
}

function anonymizedSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  const limited = rateLimit({ limit: 120, windowSec: 60, name: 'search-analytics-write' }, req);
  if (limited) return limited;
  try {
    const event = parseAnalyticsEvent(await req.json() as unknown);
    if (!event) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    const safeQuery = event.query.toLowerCase();

    // Persist to database (mock or real Postgres)
    const supabase = getSupabase();
    const { error: insertError } = await supabase.from('search_analytics_events').insert({
      type: event.type,
      query: safeQuery.toLowerCase().trim(),
      result_id: event.resultId ? String(event.resultId).slice(0, 64) : null,
      result_type: event.resultType || null,
      result_count: event.resultCount ?? null,
      filter_cuisine: event.filterCuisine ?? null,
      filter_sort: event.filterSort ?? null,
      session_id: anonymizedSessionId(event.sessionId),
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      // Log but don't fail (graceful degradation)
      console.warn('[search/analytics] insert error:', insertError.message);
      return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
    }

    // Invalidate cache so next GET shows fresh data
    cache.delete('search:popular-queries');
    cache.delete('search:popular-restaurants');
    cache.delete('search:popular-products');
    cache.delete('search:zero-result-queries');
    cache.delete('search:stats');

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminRole(req, 'manager');
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'popular-queries';

  // Cache hit
  const cacheKey = `search:${type}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=60' },
    });
  }

  try {
    // Read aggregates from database
    const supabase = getSupabase();

    if (type === 'popular-queries' || type === 'zero-result-queries' || type === 'popular-restaurants' || type === 'popular-products') {
      const eventTypeMap: Record<string, string> = {
        'popular-queries': 'search_submitted',
        'zero-result-queries': 'search_zero_result',
        'popular-restaurants': 'search_to_restaurant',
        'popular-products': 'search_to_product',
      };
      const eventType = eventTypeMap[type];

      const { data, error } = await supabase
        .from('search_analytics_aggregates')
        .select('*')
        .eq('event_type', eventType)
        .order('count', { ascending: false })
        .limit(20);

      if (error) {
        logger.error('search.analytics.aggregate_read_failed', { type, error: error.message });
        return NextResponse.json({ error: 'db_error' }, { status: 500 });
      }

      const rows = (data ?? []) as AggregateRow[];
      let result: Record<string, Array<{ query?: string; id?: string; count: number; last_seen: string }>>;
      if (type === 'popular-queries' || type === 'zero-result-queries') {
        result = { queries: rows.map((row) => ({ query: row.query, count: row.count, last_seen: row.last_seen })) };
      } else if (type === 'popular-restaurants') {
        result = { restaurants: rows.map((row) => ({ id: row.query, count: row.count, last_seen: row.last_seen })) };
      } else {
        result = { products: rows.map((row) => ({ id: row.query, count: row.count, last_seen: row.last_seen })) };
      }

      cache.set(cacheKey, result, CACHE_TTL);
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      });
    } else if (type === 'stats') {
      // Compute aggregate stats from events table
      const { data, error } = await supabase
        .from('search_analytics_events')
        .select('type,query')
        .limit(10000);

      if (error) {
        logger.error('search.analytics.event_read_failed', { error: error.message });
        return NextResponse.json({ error: 'db_error' }, { status: 500 });
      }

      const events = (data ?? []) as EventRow[];
      let totalSearches = 0;
      let totalZeroResults = 0;
      let totalClicks = 0;
      let totalConversions = 0;
      const uniqueQueries = new Set<string>();
      for (const event of events) {
        if (event.type === 'search_submitted') {
          totalSearches += 1;
          uniqueQueries.add(event.query);
        }
        if (event.type === 'search_zero_result') totalZeroResults += 1;
        if (event.type === 'search_to_restaurant' || event.type === 'search_to_product') totalClicks += 1;
        if (event.type === 'search_to_restaurant') totalConversions += 1;
      }

      const result = {
        totalSearches,
        totalZeroResults,
        totalClicks,
        totalConversions,
        zeroResultRate: totalSearches > 0 ? (totalZeroResults / totalSearches) : 0,
        clickThroughRate: totalSearches > 0 ? (totalClicks / totalSearches) : 0,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) : 0,
        uniqueQueries: uniqueQueries.size,
        totalEvents: events.length,
      };

      cache.set(cacheKey, result, CACHE_TTL);
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      });
    }

    return NextResponse.json({ error: 'unknown_type' }, { status: 400 });
  } catch (error: unknown) {
    logger.error('search.analytics.unhandled', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
