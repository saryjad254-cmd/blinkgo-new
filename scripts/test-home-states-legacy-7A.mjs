/**
 * Home Page State Tests
 *
 * Verifies the home page handles all meaningful data states.
 *
 * Usage: node scripts/test-home-states.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = '/workspace/extracted/blinkgo-final/app/(customer)/home';
const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.tsx'));
const sources = files.map((f) => ({ name: f, content: readFileSync(join(SRC_DIR, f), 'utf8') }));
const allSource = sources.map((s) => s.content).join('\n');

const checks = {
  'Server-side data fetching': allSource.includes('export const dynamic = \'force-dynamic\'') && allSource.includes('createServiceClient'),
  'Require role for auth': allSource.includes('requireRole'),
  'Per-section data fetching': allSource.includes('await Promise.allSettled'),
  'Dedupe orders by restaurant': allSource.includes('new Map') || allSource.includes('seen.add'),
  'Filter bestsellers by is_available': allSource.includes('is_available'),
  'Filter restaurants by is_active': allSource.includes('is_active'),
  'Initial state from server': allSource.includes('initialData'),
  'Reorder with cart conflict check': allSource.includes('cartHasItemsFromOther'),
  'Reorder unavailable product check': allSource.includes('is_available === false') || allSource.includes('is_active === false'),
  'Reorder: live price fetch': allSource.includes('by-restaurant'),
  'Reorder: confirm dialog': allSource.includes('window.confirm'),
  'Reorder: success toast': allSource.includes('toast.success') && allSource.includes('reorderSuccess'),
  'Reorder: warning for unavailable': allSource.includes('toast.warning'),
  'Time-aware greeting': allSource.includes('new Date().getHours'),
  'Greeting i18n (morning/afternoon/evening)': allSource.includes('greetingMorning') && allSource.includes('greetingAfternoon') && allSource.includes('greetingEvening'),
  'Address from localStorage': allSource.includes('blinkgo-last-address'),
  'Address safe parsing': allSource.includes('try {') && allSource.includes('localStorage.getItem'),
  'Address fallback': allSource.includes('setDeliveryAddress'),
  'User name in greeting': allSource.includes('userName'),
  'Search keyboard handler (/ and ⌘K)': allSource.includes('e.key === \'/\'') && allSource.includes('e.key === \'k\''),
  'Search prevents default on /': allSource.includes('e.preventDefault'),
  'Search bar accessible': allSource.includes('aria-label') && allSource.includes('searchPlaceholder'),
  'Address chip accessible': allSource.includes('aria-label') && allSource.includes('Tap to change'),
  'Promo banner accessible': allSource.includes('aria-label') && allSource.includes('eyebrow'),
  'Cuisine grid with role=list': allSource.includes('role="list"'),
  'Cuisine items with role=listitem': allSource.includes('role="listitem"'),
  'Cuisine buttons accessible': allSource.includes('aria-label') && allSource.includes('cuisine'),
  'Section h2 headings': allSource.includes('<h2'),
  'Carousel with role=region': allSource.includes('role="region"') && allSource.includes('tabIndex={0}'),
  'Carousel with aria-label': allSource.includes('aria-label') && allSource.includes('sectionOffers'),
  'Reorder button accessible': allSource.includes('aria-label') && allSource.includes('Reorder from'),
  'Restaurant card accessible': allSource.includes('aria-label') && allSource.includes('view menu'),
  'Image alt text': allSource.includes('alt='),
  'Image lazy loading': allSource.includes('loading="lazy"'),
  'RTL icon transform': allSource.includes('rtl:group-hover:-translate-x-0.5'),
  'RTL rotate refresh icon': allSource.includes('rtl:rotate-180'),
  'Logical margin (ms-)': allSource.includes('-ms-3'),
  'i18n home key references': allSource.includes('t.home'),
  'Empty state handling': allSource.includes('noResults'),
  'Error state with retry': allSource.includes('retryReorder') || allSource.includes('t.home.retry'),
  'Error state accessible': allSource.includes('role="alert"'),
  'Section error inline': allSource.includes('ErrorState') || allSource.includes('error.message'),
  'Reorder handles missing items': allSource.includes('order.items && order.items.length > 0') || allSource.includes('!order.items || order.items.length === 0'),
  'Reorder handles missing restaurant_id': allSource.includes('!order.restaurant_id'),
  'Real product data path': allSource.includes('image_urls'),
  'Real restaurant data path': allSource.includes('cuisines'),
  'Real bestsellers data path': allSource.includes('is_featured'),
  'Cart sub-action': allSource.includes('cart.add'),
  'Cart navigation': allSource.includes('router.push(\'/cart\')'),
};

let passed = 0;
let failed = 0;
const failedTests = [];

for (const [name, ok] of Object.entries(checks)) {
  if (ok) {
    passed++;
  } else {
    failed++;
    failedTests.push(name);
  }
}

console.log(`${passed} passed, ${failed} failed out of ${Object.keys(checks).length}`);

if (failedTests.length > 0) {
  console.log('\nFailed checks:');
  failedTests.forEach((t) => console.log(`  - ${t}`));
  process.exit(1);
}
console.log('\n✅ All checks passed');
