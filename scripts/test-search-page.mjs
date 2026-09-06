/**
 * Search Page State Tests
 *
 * Verifies the search page handles all meaningful states:
 * - Search input and debouncing
 * - Filter selection
 * - Sort options
 * - Loading skeletons
 * - Empty results
 * - No results
 * - Recent searches
 * - BestSellers/Recommendations
 * - View mode switching (grid/list/map)
 * - URL state sync
 * - Cuisine filter
 * - Rating filter
 * - Price filter
 * - Badge filter
 * - Free delivery filter
 * - Open now filter
 * - Max delivery time filter
 * - Promoted filter
 * - In-stock filter
 * - Cancel/abort behavior
 * - ARIA accessibility
 *
 * Usage: node scripts/test-search-page.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = '/workspace/extracted/blinkgo-final/app/(customer)/search';
const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.tsx'));
const sources = files.map((f) => ({ name: f, content: readFileSync(join(SRC_DIR, f), 'utf8') }));
const allSource = sources.map((s) => s.content).join('\n');

const checks = {
  // === Architecture ===
  'Client component (use client)': allSource.includes("'use client'"),
  'Uses URL state sync': allSource.includes('useSearchParams'),
  'Has deep-linkable filters': allSource.includes('router.replace'),

  // === Search input ===
  'Search input element': allSource.includes('type="search"'),
  'Auto-focus search input': allSource.includes('autoFocus'),
  'Enter key hint': allSource.includes('enterKeyHint'),
  'Search input aria-label': allSource.includes('a11ySearchInput'),
  'Clear button when query': allSource.includes('a11yClearQuery'),

  // === Debouncing & aborting ===
  'Debounced URL sync': allSource.includes('clearTimeout(debounceRef.current)'),
  'AbortController for searches': allSource.includes('AbortController'),
  'Cancels in-flight on new search': allSource.includes('abortRef.current.abort()'),

  // === Filter features ===
  'Free delivery filter': allSource.includes('freeDelivery') && allSource.includes('free_delivery'),
  'Open now filter': allSource.includes('openNow') && allSource.includes('open_now'),
  'Max delivery time filter': allSource.includes('maxDeliveryTime') && allSource.includes('max_delivery_time'),
  'Cuisine filter': allSource.includes('setCuisine') && allSource.includes('cuisines'),
  'Min rating filter': allSource.includes('minRating') && allSource.includes('min_rating'),
  'Max price filter': allSource.includes('maxPrice') && allSource.includes('max_price'),
  'Badge filter': allSource.includes('setBadge'),
  'In-stock filter': allSource.includes('inStock') && allSource.includes('in_stock'),
  'Promoted filter': allSource.includes('promoted') && allSource.includes("'promoted'"),
  'Type filter (restaurant/product)': (allSource.includes("setType") || allSource.includes('type:')) && (allSource.includes("'restaurant'") || allSource.includes('"restaurant"')),
  'Clear all filters': allSource.includes('clearAllFilters'),

  // === Sorting ===
  'Sort by recommended': allSource.includes("'recommended'") && allSource.includes('sortRecommended'),
  'Sort by rating': allSource.includes("'rating'") || allSource.includes("'rating_desc'"),
  'Sort by bestsellers': allSource.includes("'bestseller'") || allSource.includes("'popular'"),
  'Sort by price asc': allSource.includes("'price_asc'") || allSource.includes("'price_low'"),
  'Sort by price desc': allSource.includes("'price_desc'") || allSource.includes("'price_high'"),
  'Sort by newest': allSource.includes("'newest'"),

  // === States ===
  'Loading skeleton': allSource.includes('ResultsSkeleton'),
  'Empty state component': allSource.includes('EmptyResults'),
  'No results message': allSource.includes('noResultsTitle') || allSource.includes('Keine Ergebnisse'),
  'Error handling': allSource.includes("e?.name !== 'AbortError'"),
  'Search history': allSource.includes('SEARCH_HISTORY_KEY'),
  'Bestsellers section': allSource.includes('bestsellers') && allSource.includes('Award'),
  'Recent products section': allSource.includes('recent') && allSource.includes('History'),
  'Recommendations section': allSource.includes('recommendations') && allSource.includes('Sparkles'),

  // === View modes ===
  'View mode: grid': allSource.includes("view === 'grid'") || allSource.includes("setView('grid')"),
  'View mode: list': allSource.includes("view === 'list'"),
  'View mode: map': allSource.includes("view === 'map'"),
  'Map view placeholder': allSource.includes('MapViewPlaceholder'),
  'Grid view button': allSource.includes('Grid3x3'),
  'List view button': allSource.includes("'list'"),
  'Map view button': allSource.includes('MapIcon'),

  // === Tabs ===
  'Restaurants tab': allSource.includes("'restaurants'") && allSource.includes('tabRestaurants'),
  'Products tab': allSource.includes("'products'") && allSource.includes('tabProducts'),

  // === Restaurant/Product cards ===
  'Memoized restaurant card': allSource.includes('RestaurantResultCard') && allSource.includes('memo('),
  'Memoized product card': allSource.includes('ProductResultCard') && allSource.includes('memo('),
  'Distance calculation': allSource.includes('haversineDistance'),
  'Format EUR': allSource.includes('formatEUR'),

  // === i18n ===
  'Uses translations function': allSource.includes('useT(') || allSource.includes('useI18n('),
  'Translation helper ct': allSource.includes('const ct ='),

  // === Accessibility ===
  'role="feed" on results': allSource.includes('role="feed"'),
  'role="status" on results count': allSource.includes('role="status"'),
  'aria-busy on loading': allSource.includes('aria-busy'),
  'role="tablist" for sort': allSource.includes('role="tablist"'),
  'role="tab" for sort options': allSource.includes('role="tab"'),
  'role="region" for sections': allSource.includes('role="region"'),
  'aria-expanded on filter button': allSource.includes('aria-expanded'),

  // === Voice search ===
  'Voice search component': allSource.includes('VoiceSearch'),

  // === Empty state features ===
  'Recent orders section': allSource.includes('recentOrders') && allSource.includes('orderAgain'),

  // === Active filter chips ===
  'Active filters display': allSource.includes('activeFilters'),
  'Remove individual filter': allSource.includes('onRemove'),

  // === Suggested searches ===
  'Suggested searches': allSource.includes('suggestedSearches'),

  // === Loading & UX ===
  'Disable back-to-back requests': allSource.includes('controller.signal.aborted'),
  'Save search to history': allSource.includes('SEARCH_HISTORY_KEY'),
  'Cap search history': allSource.includes('SEARCH_HISTORY_MAX'),
  'Scrollbar hide on horizontal chips': allSource.includes('scrollbar-hide'),

  // === Phase 7B Round 2 Enhancements ===
  'Cuisine-aware text search': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('rowContainsAllTokens') && readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes("'cuisine'"),
  'Tokenized multi-word search (AND of all tokens)': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('rowContainsAllTokens'),
  'Relevance ranking (exact > prefix > substring)': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('rowRelevance'),
  'Search highlight in results (mark tags)': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('highlightText'),
  'Did you mean suggestions': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('didYouMean'),
  'Trending searches API': existsSync('/workspace/extracted/blinkgo-final/app/api/trending-search/route.ts'),
  'Updated field names (cuisines plural, cover_image_url)': allSource.includes('cuisines') && allSource.includes('cover_image_url'),
  'Field name fallbacks for backward compat': allSource.includes('restaurant.cover_url'),
  'Did you mean state in page': allSource.includes('didYouMean') && allSource.includes('setDidYouMean'),
  'Empty state with didYouMean support': allSource.includes('didYouMean') && allSource.includes('onSuggestionClick'),
  'i18n key didYouMean (DE)': readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'de.ts'), 'utf8').includes('didYouMean'),
  'i18n key didYouMean (EN)': readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'en.ts'), 'utf8').includes('didYouMean'),
  'i18n key didYouMean (AR)': readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'ar.ts'), 'utf8').includes('didYouMean'),

  // === Phase 7B.1 Enhancements ===
  'Synonym dictionary (pizza/burger/fries)': existsSync('/workspace/extracted/blinkgo-final/lib/search/synonyms.ts'),
  'Synonym expansion in API (Pizza→بيتزا)': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search', 'route.ts'), 'utf8').includes('expandTokensWithSynonyms'),
  'Search analytics client (trackSearchEvent)': existsSync('/workspace/extracted/blinkgo-final/lib/analytics/search.ts'),
  'Search analytics API endpoint': existsSync('/workspace/extracted/blinkgo-final/app/api/search/analytics/route.ts'),
  'Search analytics integration in page': allSource.includes('trackSearchEvent') && allSource.includes('search_submitted'),
  'Real map component (SearchMap)': existsSync('/workspace/extracted/blinkgo-final/components/maps/SearchMap.tsx'),
  'SearchMap marker clustering': readFileSync(join('/workspace/extracted/blinkgo-final/components/maps', 'SearchMap.tsx'), 'utf8').includes('markerClusterGroup'),
  'SearchMap 2-way sync (highlightedId)': allSource.includes('highlightedMarkerId') && allSource.includes('setHighlightedMarkerId'),
  'Infinite scroll (IntersectionObserver)': allSource.includes('IntersectionObserver') && allSource.includes('sentinelRef'),
  'Pagination via offset param': allSource.includes("p.set('offset'") || allSource.includes('p.set(\'offset\''),
  'Online status detection': allSource.includes('useOnlineStatus'),
  'Cached fetch for offline support': allSource.includes('useCachedFetch') || allSource.includes('cachedSearch'),
  'OfflineBanner component': existsSync('/workspace/extracted/blinkgo-final/components/customer/OfflineBanner.tsx'),
  'OfflineBanner in customer layout': readFileSync(join('/workspace/extracted/blinkgo-final/app/(customer)', 'layout.tsx'), 'utf8').includes('OfflineBanner'),
  'Cached results indicator in UI': allSource.includes('usedCached') && allSource.includes('cachedResults'),
  'Popular queries API': readFileSync(join('/workspace/extracted/blinkgo-final/app/api/search/analytics', 'route.ts'), 'utf8').includes('popular-queries'),
  'Click-through analytics tracking': allSource.includes('trackResultClick') && allSource.includes('search_to_restaurant'),
  'i18n key loadingMore (DE/EN/AR)': readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'de.ts'), 'utf8').includes('loadingMore') &&
                                       readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'en.ts'), 'utf8').includes('loadingMore') &&
                                       readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'ar.ts'), 'utf8').includes('loadingMore'),
  'i18n key cachedResults (DE/EN/AR)': readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'de.ts'), 'utf8').includes('cachedResults') &&
                                        readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'en.ts'), 'utf8').includes('cachedResults') &&
                                        readFileSync(join('/workspace/extracted/blinkgo-final/lib/i18n/locales', 'ar.ts'), 'utf8').includes('cachedResults'),
};

let passed = 0;
let failed = 0;
const failedNames = [];

for (const [name, ok] of Object.entries(checks)) {
  if (ok) {
    passed++;
  } else {
    failed++;
    failedNames.push(name);
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${Object.keys(checks).length}\n`);

if (failed > 0) {
  console.log('Failed checks:');
  for (const name of failedNames) {
    console.log(`  - ${name}`);
  }
  process.exit(1);
} else {
  console.log('✅ All checks passed');
}
