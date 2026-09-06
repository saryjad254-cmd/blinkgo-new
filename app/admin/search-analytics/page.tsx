/**
 * Search Analytics Dashboard
 * Admin-only view of search behaviour across the platform.
 *
 * Read-only consumer of `/api/search/analytics` GET endpoints.
 * Backend persistence is now DB-backed (Phase 7B.2).
 */

import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchAnalyticsClient } from './SearchAnalyticsClient';
import type { Locale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

export const revalidate = 60; // 60s cache
export const dynamic = 'force-dynamic';

async function detectLocale(): Promise<Locale> {
  const c = (await cookies()).get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

async function getInitialStats() {
  try {
    const supabase = createServiceClient();
    const [eventsResult, aggregatesResult] = await Promise.all([
      supabase.from('search_analytics_events').select('type,query').limit(10_000),
      supabase.from('search_analytics_aggregates').select('event_type,query,count,last_seen').order('count', { ascending: false }).limit(100),
    ]);
    const events = eventsResult.data ?? [];
    const aggregates = aggregatesResult.data ?? [];
    const totalSearches = events.filter((event) => event.type === 'search_submitted').length;
    const totalZeroResults = events.filter((event) => event.type === 'search_zero_result').length;
    const totalClicks = events.filter((event) => event.type === 'search_to_restaurant' || event.type === 'search_to_product').length;
    const totalConversions = events.filter((event) => event.type === 'search_to_restaurant').length;
    const list = (eventType: string) => aggregates
      .filter((row) => row.event_type === eventType)
      .slice(0, 20)
      .map((row) => ({ query: row.query, count: row.count, last_seen: row.last_seen }));
    const stats = {
      totalSearches,
      totalZeroResults,
      totalClicks,
      totalConversions,
      zeroResultRate: totalSearches > 0 ? totalZeroResults / totalSearches : 0,
      clickThroughRate: totalSearches > 0 ? totalClicks / totalSearches : 0,
      conversionRate: totalClicks > 0 ? totalConversions / totalClicks : 0,
      uniqueQueries: new Set(events.filter((event) => event.type === 'search_submitted').map((event) => event.query)).size,
      totalEvents: events.length,
    };
    const popularQueries = { queries: list('search_submitted') };
    const zeroResultQueries = { queries: list('search_zero_result') };
    const popularRestaurants = { restaurants: list('search_to_restaurant').map((row) => ({ id: row.query, count: row.count, last_seen: row.last_seen })) };
    const popularProducts = { products: list('search_to_product').map((row) => ({ id: row.query, count: row.count, last_seen: row.last_seen })) };
    return { stats, popularQueries, popularRestaurants, popularProducts, zeroResultQueries };
  } catch {
    return {
      stats: {
        totalSearches: 0,
        totalZeroResults: 0,
        totalClicks: 0,
        totalConversions: 0,
        zeroResultRate: 0,
        clickThroughRate: 0,
        conversionRate: 0,
        uniqueQueries: 0,
        totalEvents: 0,
      },
      popularQueries: { queries: [] },
      popularRestaurants: { restaurants: [] },
      popularProducts: { products: [] },
      zeroResultQueries: { queries: [] },
    };
  }
}

export default async function SearchAnalyticsPage() {
  const user = await requireRole(['admin']);
  const locale = await detectLocale();
  const initial = await getInitialStats();

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="Search Analytics" subtitle="Real-time search behaviour dashboard" />
      <main className="container mx-auto px-4 py-6">
        <SearchAnalyticsClient initial={initial} user={user} locale={locale} />
      </main>
    </div>
  );
}
