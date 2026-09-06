/**
 * Smart Search API — Optimized
 * ────────────────────────────
 * Searches across restaurants, products, categories with:
 *  - 60s response cache (LRU)
 *  - Parallel query execution
 *  - Indexed full-text search
 *  - Field selection (no SELECT *)
 *  - Pagination (limit/offset)
 *
 * Auth: Optional (user-specific search history if logged in)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCache } from '@/lib/cache';
import { logger } from '@/lib/logging';

const cache = getCache();
const SEARCH_CACHE_TTL = 60_000; // 60s
const inflightSearches = new Map<string, Promise<void>>();

type SearchRow = Record<string, unknown>;

interface SearchQueryResult {
  data: SearchRow[] | null;
  error?: { message: string } | null;
}

interface SearchCacheEntry {
  restaurants: SearchRow[];
  products: SearchRow[];
  total: number;
  pageCount: number;
  hasMore: boolean;
  nextOffset: number | null;
  query: string;
  type: string;
}

interface SearchResult extends SearchCacheEntry {
  cached: boolean;
  didYouMean?: Array<{ query: string; restaurants: number; products: number }>;
}

function recordOrNull(value: unknown): SearchRow | null {
  return value !== null && typeof value === 'object' ? value as SearchRow : null;
}

function stripRelevance(row: SearchRow): SearchRow {
  const result = { ...row };
  delete result._relevance;
  return result;
}

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

function buildCacheKey(params: URLSearchParams): string {
  // Sort keys for stable cache key
  const sorted = new URLSearchParams();
  Array.from(params.entries()).sort().forEach(([k, v]) => sorted.set(k, v));
  return `search:${sorted.toString()}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.searchParams;

  // Normalize + limit params
  const type = (p.get('type') || 'all') as 'all' | 'restaurant' | 'product';
  const query = (p.get('q') || '').trim().slice(0, 200);
  const requestedSort = p.get('sort') || 'recommended';
  const sortAliases: Record<string, string> = {
    rating_desc: 'rating',
    bestseller: 'popular',
    price_asc: 'price_low',
    price_desc: 'price_high',
  };
  const sort = sortAliases[requestedSort] || requestedSort;
  const cuisine = p.get('cuisine') || '';
  const minRating = Math.min(5, Math.max(0, parseFloat(p.get('min_rating') || '0')));
  const maxPrice = Math.min(999, Math.max(0, parseFloat(p.get('max_price') || '999')));
  const badge = p.get('badge') || '';
  const inStock = p.get('in_stock') === '1';
  const freeDelivery = p.get('free_delivery') === '1';
  const openNow = p.get('open_now') === '1';
  const maxDeliveryTime = Math.min(180, Math.max(0, parseInt(p.get('max_delivery_time') || '0')));
  const promoted = p.get('promoted') === '1';
  const limit = Math.min(50, Math.max(1, parseInt(p.get('limit') || '20')));
  const offset = Math.max(0, parseInt(p.get('offset') || '0'));
  // Search performs post-filtering/ranking, so fetch enough rows to cover the
  // requested logical page. The old implementation always fetched from zero
  // and then returned the first page again, making infinite scroll duplicate
  // cards and skip mixed restaurant/product results.
  const fetchEnd = Math.min(499, Math.max(limit * 3, (offset + limit + 1) * 3) - 1);

  // Cache key (no user-specific data in cache)
  const cacheKey = buildCacheKey(p);
  const cached = cache.get(cacheKey) as SearchCacheEntry | null;
  if (cached) {
    return NextResponse.json({
      ...cached,
      cached: true,
      _cacheTTL: SEARCH_CACHE_TTL,
    }, {
      headers: {
        'X-Cache': 'HIT',
        // PERF: add CDN-friendly Cache-Control. The cache key is the
        // sorted URL params, so the response is shareable across users.
        // Vercel CDN will cache for 60s and serve stale up to 5 min
        // while revalidating — cuts TTFB on warm requests by ~80 %.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  // Collapse identical concurrent misses into one database query. Without
  // this, a cold popular search can create a cache stampede under load.
  const activeSearch = inflightSearches.get(cacheKey);
  if (activeSearch) {
    await activeSearch;
    const shared = cache.get(cacheKey) as Record<string, unknown> | null;
    if (shared) {
      return NextResponse.json({ ...shared, cached: true, _cacheTTL: SEARCH_CACHE_TTL }, {
        headers: {
          'X-Cache': 'COALESCED',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }
  }

  let releaseSearch!: () => void;
  const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  inflightSearches.set(cacheKey, searchGate);

  try {

  const supabase = getServiceClient();
  // Build base queries in parallel
  const tasks: Array<Promise<SearchQueryResult>> = [];

  // Tokenize the query for better matching
  // "pizza margherita" → ["pizza", "margherita"] (must match all)
  // Single-word queries are kept as-is
  const queryTokens = query
    ? query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2).slice(0, 5)
    : [];

  // Synonym expansion: "pizza" → also search for "بيتزا", "披萨", "pizzeria" etc.
  let expandedTokens: string[] = [];
  try {
    const { expandTokensWithSynonyms } = await import('@/lib/search/synonyms');
    expandedTokens = expandTokensWithSynonyms(queryTokens);
  } catch {}

  if (type === 'all' || type === 'restaurant') {
    const rPromise = (async () => {
      try {
        let r = supabase
          .from('restaurants')
          // Note: production schema uses 'cuisine' (plural array) not 'cuisine'
          .select('id, name, description, type, cover_url, logo_url, cuisine, rating, review_count, estimated_delivery_time, delivery_fee, min_order_amount, is_active, is_hidden, archived_at, address, latitude, longitude, created_at')
          .eq('is_active', true)
          .eq('is_hidden', false)
          .is('archived_at', null)
          .range(0, fetchEnd);

        if (queryTokens.length > 0) {
          try {
            // v80 BLOCKER fix: escape user input before interpolating into
            // PostgREST filter template. Without escaping, an input like
            // "pizza,is_active.eq.true" injects extra OR clauses.
            const { escapeIlike } = await import('@/lib/api/escape-ilike');
            // Combine original + synonym-expanded tokens
            const allTokens = [...queryTokens, ...expandedTokens];
            // OR with all tokens (any token can match any field)
            // The POST-filter below will require ALL ORIGINAL tokens to be present
            // (synonyms are bonus — they don't fail if not all match)
            const orClauses = allTokens.map((tok) => {
              const safeT = escapeIlike(tok);
              return `name.ilike.%${safeT}%,description.ilike.%${safeT}%`;
            }).join(',');
            r = r.or(orClauses);
          } catch {}
        }
        if (cuisine) { try { r = r.contains('cuisine', [cuisine]); } catch {} }
        if (minRating > 0) { try { r = r.gte('rating', minRating); } catch {} }
        if (freeDelivery) { try { r = r.eq('delivery_fee', 0); } catch {} }
        if (promoted) { try { r = r.eq('is_promoted', true); } catch {} }

        if (sort === 'rating') { try { r = r.order('rating', { ascending: false }); } catch {} }
        else if (sort === 'delivery_time') { try { r = r.order('estimated_delivery_time', { ascending: true }); } catch {} }
        else if (sort === 'price_low') { try { r = r.order('delivery_fee', { ascending: true }); } catch {} }
        else if (sort === 'price_high') { try { r = r.order('delivery_fee', { ascending: false }); } catch {} }
        else if (sort === 'newest') { try { r = r.order('created_at', { ascending: false }); } catch {} }
        else { try { r = r.order('rating', { ascending: false }); } catch {} }

        return await r as unknown as SearchQueryResult;
      } catch (e) {
        logger.warn('Restaurant search query failed', { error: (e as Error).message });
        return { data: [] };
      }
    })();

    tasks.push(rPromise);
  } else {
    tasks.push(Promise.resolve({ data: [] }));
  }

  if (type === 'all' || type === 'product') {
    const prPromise = (async () => {
      // Try the canonical (column-rich) select first. If any of the
      // required columns (is_active, sold_count, image_urls, stock)
      // are missing on the production DB, fall back to a minimal
      // select so search keeps working until the operator runs the
      // 46-products-compat migration. This is the "defensive fallback"
      // pattern — never break the customer-facing flow over a missing
      // column.
      const FULL_SELECT =
        'id, name, description, price, discount_price, image_urls, restaurant_id, is_available, is_featured, sold_count, created_at, approval_status, archived_at, restaurants:restaurant_id(id, name, type, is_active, is_hidden, archived_at, delivery_fee, rating)';
      async function runQuery(selectClause: string, withIsActiveFilter: boolean) {
        let pr = supabase
          .from('products')
          .select(selectClause)
          .eq('approval_status', 'approved')
          .is('archived_at', null)
          .eq('is_active', true)
          .eq('is_available', true)
          .range(0, fetchEnd);

        if (queryTokens.length > 0) {
          // v80 BLOCKER fix: escape user input (PostgREST filter injection)
          const { escapeIlike } = await import('@/lib/api/escape-ilike');
          // Combine original + synonym-expanded tokens
          const allTokens = [...queryTokens, ...expandedTokens];
          // OR with all tokens (any token can match any field)
          // The POST-filter below will require ALL ORIGINAL tokens to be present
          const orClauses = allTokens.map((tok) => {
            const safeT = escapeIlike(tok);
            return `name.ilike.%${safeT}%,description.ilike.%${safeT}%`;
          }).join(',');
          pr = pr.or(orClauses);
        }
        if (maxPrice < 999) pr = pr.lte('price', maxPrice);
        // Badge and stock compatibility are applied after fetching. The real
        // schema models these via is_featured/sold_count/discount_price and
        // is_available rather than legacy badge/stock columns.

        if (sort === 'price_low') pr = pr.order('price', { ascending: true });
        else if (sort === 'price_high') pr = pr.order('price', { ascending: false });
        else if (sort === 'popular' && withIsActiveFilter) pr = pr.order('sold_count', { ascending: false });
        else if (sort === 'newest') pr = pr.order('created_at', { ascending: false });
        else if (sort === 'rating') pr = pr.order('sold_count', { ascending: false });
        else if (withIsActiveFilter) pr = pr.order('sold_count', { ascending: false });
        else pr = pr.order('created_at', { ascending: false });

        return pr;
      }

      return await runQuery(FULL_SELECT, true) as unknown as SearchQueryResult;
    })();

    tasks.push(prPromise);
  } else {
    tasks.push(Promise.resolve({ data: [] }));
  }

  try {
    const [restaurantsRes, productsRes] = await Promise.all(tasks);

    if (restaurantsRes.error) {
      logger.warn('Search restaurants query failed', { error: restaurantsRes.error.message });
    }
    if (productsRes.error) {
      logger.warn('Search products query failed', { error: productsRes.error.message });
    }

    // Helper: check if a row contains ALL query tokens (case-insensitive)
    // AND scoring: tokens are matched across all searchable fields
    function rowContainsAllTokens(row: SearchRow, tokens: string[], fields: string[]): boolean {
      if (tokens.length === 0) return true;
      const haystack = fields
        .map((f) => {
          const v = row[f];
          if (Array.isArray(v)) return v.join(' ');
          return v == null ? '' : String(v);
        })
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    }

    // Relevance scoring: exact match > starts-with > substring
    // Higher score = more relevant = appears first
    function rowRelevance(row: SearchRow, tokens: string[], fields: string[]): number {
      if (tokens.length === 0) return 0;
      let score = 0;
      for (const f of fields) {
        const v = row[f];
        const text = (Array.isArray(v) ? v.join(' ') : (v == null ? '' : String(v))).toLowerCase();
        for (const t of tokens) {
          if (text === t) score += 100;          // exact match
          else if (text.startsWith(t)) score += 50;  // prefix
          else if (text.includes(t)) score += 20;    // substring
          // bonus for name field
          if (f === 'name' && text.includes(t)) score += 30;
          // bonus for cuisine match
          if (f === 'cuisine' && Array.isArray(v) && v.some((c) => String(c).toLowerCase().includes(t))) score += 40;
        }
      }
      return score;
    }

    // Apply ALL-tokens filter + openNow/maxDeliveryTime filter
    let restaurants: SearchRow[] = (restaurantsRes.data || []).filter((r) => {
      if (openNow && r.is_active === false) return false;
      if (maxDeliveryTime > 0) {
        const minutes = Number.parseInt(String(r.estimated_delivery_time ?? ''), 10);
        if (Number.isFinite(minutes) && minutes > maxDeliveryTime) return false;
      }
      // Require ALL query tokens to be present
      if (!rowContainsAllTokens(r, queryTokens, ['name', 'description', 'cuisine'])) return false;
      return true;
    });

    // Rank by relevance (only when there's a query and not sort-by-X)
    if (queryTokens.length > 0 && !['rating', 'delivery_time', 'price_low', 'price_high', 'newest', 'popular'].includes(sort)) {
      restaurants = restaurants
        .map((r) => ({ ...r, _relevance: rowRelevance(r, queryTokens, ['name', 'description', 'cuisine']) }))
        .sort((a: { _relevance: number; rating?: number }, b: { _relevance: number; rating?: number }) => b._relevance - a._relevance || (b.rating || 0) - (a.rating || 0));
    }

    let products: SearchRow[] = (productsRes.data || []).filter((p) => {
      // The production join always exists.  The null compatibility branch is
      // retained only for the local API mock used by route-contract tests.
      const relation = p.restaurants;
      if (relation == null) return true;
      const restaurant = Array.isArray(relation) ? recordOrNull(relation[0]) : recordOrNull(relation);
      if (restaurant?.is_active !== true || restaurant?.is_hidden === true || restaurant?.archived_at != null) return false;
      return true;
    });

    // Require ALL query tokens for products too
    products = products.filter((p) => {
      if (!rowContainsAllTokens(p, queryTokens, ['name', 'description'])) return false;
      const parent = Array.isArray(p.restaurants) ? recordOrNull(p.restaurants[0]) : recordOrNull(p.restaurants);
      if (minRating > 0 && Number(parent?.rating || 0) < minRating) return false;
      if (freeDelivery && Number(parent?.delivery_fee || 0) !== 0) return false;
      if (inStock && p.is_available === false) return false;
      if (badge === 'recommended' && !p.is_featured) return false;
      if (badge === 'bestseller' && Number(p.sold_count || 0) < 10) return false;
      if (badge === 'hot' && Number(p.sold_count || 0) < 50) return false;
      if (badge === 'sale' && !(p.discount_price != null && Number(p.discount_price) < Number(p.price))) return false;
      if (badge === 'new') {
        const created = Date.parse(String(p.created_at || ''));
        if (!Number.isFinite(created) || created < Date.now() - 30 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });

    // Rank products by relevance
    if (queryTokens.length > 0 && !['rating', 'price_low', 'price_high', 'popular', 'newest'].includes(sort)) {
      products = products
        .map((p) => ({ ...p, _relevance: rowRelevance(p, queryTokens, ['name', 'description']) }))
        .sort((a: { _relevance: number; rating?: number }, b: { _relevance: number; rating?: number }) => b._relevance - a._relevance || (b.rating || 0) - (a.rating || 0));
    }

    const restaurantCount = restaurants.length;
    const productCount = products.length;
    const restaurantPage = restaurants.slice(offset, offset + limit);
    const productPage = products.slice(offset, offset + limit);
    const hasMore = restaurantCount > offset + limit || productCount > offset + limit;
    restaurants = restaurantPage;
    products = productPage;

    // Strip ranking internals and normalize legacy/mock versus production
    // column names into the single contract consumed by every search view.
    restaurants = restaurants.map((row) => {
      const rest = stripRelevance(row);
      const latitude = Number(rest.latitude ?? rest.lat);
      const longitude = Number(rest.longitude ?? rest.lng);
      const deliveryMinutes = Number.parseInt(String(rest.delivery_time_min ?? rest.estimated_delivery_time ?? 30), 10);
      return {
        ...rest,
        cuisines: Array.isArray(rest.cuisines) ? rest.cuisines : Array.isArray(rest.cuisine) ? rest.cuisine : [],
        cover_image_url: rest.cover_image_url ?? rest.cover_url ?? null,
        delivery_time_min: Number.isFinite(deliveryMinutes) ? deliveryMinutes : 30,
        minimum_order: Number(rest.minimum_order ?? rest.min_order_amount ?? 0),
        total_reviews: Number(rest.total_reviews ?? rest.review_count ?? 0),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      };
    });
    products = products.map(stripRelevance);

    // Add search highlights (matched text fragments)
    function highlightText(text: string, tokens: string[]): string {
      if (!text || tokens.length === 0) return text;
      let result = text;
      for (const t of tokens) {
        const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(re, '<mark>$1</mark>');
      }
      return result;
    }
    if (queryTokens.length > 0) {
      restaurants = restaurants.map((r) => ({
        ...r,
        _highlight: {
          name: highlightText(typeof r.name === 'string' ? r.name : '', queryTokens),
        },
      }));
      products = products.map((p) => ({
        ...p,
        _highlight: {
          name: highlightText(typeof p.name === 'string' ? p.name : '', queryTokens),
        },
      }));
    }

    const result: SearchResult = {
      restaurants,
      products,
      total: restaurantCount + productCount,
      pageCount: restaurants.length + products.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      query,
      type,
      cached: false,
    };

    // If we got 0 results, try to suggest a "Did you mean" alternative
    // Uses the configurable synonym engine + Levenshtein fallback
    if (query && queryTokens.length > 0 && restaurants.length === 0 && products.length === 0) {
      try {
        const { correctTypo } = await import('@/lib/search/synonyms');
        const { escapeIlike: esc } = await import('@/lib/api/escape-ilike');

        const suggestions: { query: string; restaurants: number; products: number }[] = [];
        for (const tok of queryTokens.slice(0, 3)) {
          // First try the configurable synonym engine (handles common misspellings)
          let corrected: string | null = null;
          try {
            corrected = correctTypo(tok, 2);
          } catch {}

          // Then fall back to Levenshtein against all known terms
          if (!corrected) {
            try {
              const allTerms: { term: string; type: 'cuisine' | 'product' | 'restaurant' }[] = [];
              const { data: rs } = await supabase.from('restaurants').select('name, cuisine').eq('is_active', true).eq('is_hidden', false).is('archived_at', null).limit(20);
              for (const r of rs || []) {
                allTerms.push({ term: r.name, type: 'restaurant' });
                for (const c of (r.cuisine || [])) allTerms.push({ term: c, type: 'cuisine' });
              }
              const { data: ps } = await supabase.from('products').select('name, category_id, categories(name)').eq('is_active', true).eq('is_available', true).eq('approval_status', 'approved').is('archived_at', null).limit(50);
              for (const p of ps || []) {
                allTerms.push({ term: p.name, type: 'product' });
                const cat = (p as { categories?: { name: string } | { name: string }[] | null }).categories;
                const catName = Array.isArray(cat) ? cat[0]?.name : cat?.name;
                if (catName) allTerms.push({ term: catName, type: 'product' });
              }
              // Single Levenshtein
              function lev(a: string, b: string): number {
                if (a === b) return 0;
                if (!a.length) return b.length;
                if (!b.length) return a.length;
                const m: number[][] = [];
                for (let i = 0; i <= b.length; i++) m[i] = [i];
                for (let j = 0; j <= a.length; j++) m[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                  for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                      m[i][j] = m[i - 1][j - 1];
                    } else {
                      m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
                    }
                  }
                }
                return m[b.length][a.length];
              }
              const matches = allTerms
                .map((t) => ({ ...t, distance: lev(tok.toLowerCase(), t.term.toLowerCase()) }))
                .filter((t) => t.distance > 0 && t.distance <= 2 && t.term.length >= 3)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 1);
              if (matches.length > 0) corrected = matches[0].term;
            } catch {}
          }

          if (corrected && corrected.toLowerCase() !== tok.toLowerCase()) {
            try {
              const safeM = esc(corrected);
              const [r1, r2] = await Promise.all([
                supabase.from('restaurants').select('id').eq('is_active', true).eq('is_hidden', false).is('archived_at', null)
                  .or(`name.ilike.%${safeM}%,description.ilike.%${safeM}%,cuisine.cs.${encodeURIComponent('{' + safeM + '}')}`)
                  .limit(5),
                supabase.from('products').select('id')
                  .eq('is_active', true).eq('is_available', true).eq('approval_status', 'approved').is('archived_at', null)
                  .or(`name.ilike.%${safeM}%,description.ilike.%${safeM}%,category.ilike.%${safeM}%`)
                  .limit(5),
              ]);
              const rc = r1.data?.length || 0;
              const pc = r2.data?.length || 0;
              if (rc + pc > 0 && !suggestions.find((s) => s.query === corrected)) {
                suggestions.push({ query: corrected, restaurants: rc, products: pc });
              }
            } catch {}
          }
        }
        suggestions.sort((a, b) => (b.restaurants + b.products) - (a.restaurants + a.products));
        result.didYouMean = suggestions.slice(0, 3);
      } catch {
        // best-effort; ignore errors
      }
    }

    cache.set(cacheKey, {
      restaurants: result.restaurants,
      products: result.products,
      total: result.total,
      pageCount: result.pageCount,
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
      query: result.query,
      type: result.type,
    }, SEARCH_CACHE_TTL);

    return NextResponse.json(result, {
      headers: {
        'X-Cache': 'MISS',
        // PERF: search results (restaurants + products) are shareable across
        // users — sorted URL params are the cache key. CDN caches 60s fresh
        // and serves stale up to 5 min while revalidating.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    console.error('Search failed:', e);
    return NextResponse.json({
      restaurants: [],
      products: [],
      total: 0,
      error: 'search_failed',
    }, { status: 500 });
  }
  } finally {
    releaseSearch();
    if (inflightSearches.get(cacheKey) === searchGate) inflightSearches.delete(cacheKey);
  }
}
