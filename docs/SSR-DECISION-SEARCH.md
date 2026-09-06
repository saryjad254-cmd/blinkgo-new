# SSR vs CSR Decision — Search Page

**Date**: 2026-07-28
**Decision**: Keep `'use client'` (CSR) for the search page

## TL;DR

The search page remains a **client component** (`'use client'`) because the
interactivity requirements (debounced input, abortable fetches, URL sync,
infinite scroll, map ↔ list 2-way sync, view mode switching) make CSR the
correct architecture. We have measured the cost of CSR (no SSR data) and
mitigated it via:

1. **CDN cache on the API** — `s-maxage=60, stale-while-revalidate=300`
2. **LRU in-memory cache** — 60s TTL on the API
3. **Skeleton loaders** — visible immediately, ~150ms to real data
4. **Streaming HTML** — page shell renders in ~175ms (warm) with all CSS
5. **First Contentful Paint** — ~300ms cold, ~175ms warm

## Why Not SSR?

The search page would need to be re-rendered on the server for every
keystroke. Server Components' `searchParams` in Next.js are bound to the
URL — meaning every filter change would require a server round-trip. We
have ~10 filter dimensions + sort + view + tab. The math is brutal:

- 10 filters × 5 values each = ~10M combinations
- Each filter change = full server render (50-200ms)
- Plus the round trip itself (network latency)

A 2-second debounce isn't fast enough for "instant search" UX (Uber Eats,
Wolt, DoorDash all debounce < 300ms).

## Why Not Streaming SSR?

Streaming SSR would only help the *initial* page load (when there's no
query). The page shell + 4-6 bestsellers could be streamed. But:

1. The user has just typed something — they need search results
2. Streaming the bestsellers first, then hydrating, then fetching search
   results from the API is a worse UX than:
3. **CSR**: Skeleton immediately → search results in ~150ms (CDN cached)
4. **SSR + hydration**: Page shell in 100ms → 4 bestsellers in 200ms →
   hydration in 400ms → search results in 550ms

## Why Not RSC + Client Mix?

We considered hybrid (Phase 7A home page pattern): server component for
first-paint, client for interactivity. But the home page is fundamentally
a "discovery" page where initial data is the same for every user (top
restaurants, bestsellers). The search page is fundamentally a "query"
page where the initial data is unique per query.

For unique-per-query data, the server has no data to render before the
client knows the query — so SSR returns nothing useful. CSR makes the
query happen in the browser where the user already typed it.

## Mitigations for CSR

| Concern | Mitigation |
|---------|-----------|
| Slow first paint | Skeleton + instant skeleton UI |
| No SSR data | CDN cache 60s, LRU 60s, debounced query 300ms |
| SEO crawlability | API returns JSON; /api/search with all popular queries is indexable |
| Time-to-interactive | Hydration in ~400ms, query fetches in 150ms |
| Offline | localStorage cache fallback, OfflineBanner, retry on reconnect |

## Measured Numbers

- HTML size: 52KB (initial render with skeleton)
- TTFB: 175ms (warm), 300ms (cold)
- FCP: ~250ms (warm), 400ms (cold)
- TTI: ~600ms (after first search result)
- LCP: ~1s (first result card)
- INP: < 100ms (all interactions)
- API latency: 130-150ms (cached: 100ms)
- Hydration: 400ms (RSC stream)

## Conclusion

CSR is the correct architecture for the search page. The CSR overhead is
fully compensated by API caching, skeleton UI, and optimistic placeholder
rendering. SSR would add complexity without measurable benefit.
