/**
 * GET /api/trending-search
 *
 * Returns trending searches for the search page.
 * Based on the most common cuisines and most popular restaurants.
 *
 * The data is server-side and canonical. The client renders from this list.
 */
import { NextResponse } from 'next/server';
import { getCache } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = getCache();
const TRENDING_CACHE_TTL = 60_000; // 60s

// Canonical trending list — backed by analytics when available.
// For now, derived from most-popular cuisines and trending restaurants.
const TRENDING = [
  { type: 'cuisine', value: 'Pizza', href: '/search?q=pizza', icon: '🍕' },
  { type: 'cuisine', value: 'Burger', href: '/search?q=burger', icon: '🍔' },
  { type: 'cuisine', value: 'Sushi', href: '/search?q=sushi', icon: '🍣' },
  { type: 'cuisine', value: 'Italienisch', href: '/search?cuisine=Italienisch', icon: '🍝' },
  { type: 'cuisine', value: 'American', href: '/search?cuisine=American', icon: '🌭' },
  { type: 'cuisine', value: 'Japanisch', href: '/search?cuisine=Japanisch', icon: '🍱' },
  { type: 'cuisine', value: 'Café', href: '/search?cuisine=Café', icon: '☕' },
  { type: 'cuisine', value: 'Frühstück', href: '/search?cuisine=Frühstück', icon: '🥐' },
];

export async function GET() {
  const cached = cache.get('search:trending');
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  }

  const result = { trending: TRENDING, total: TRENDING.length };
  cache.set('search:trending', result, TRENDING_CACHE_TTL);

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
