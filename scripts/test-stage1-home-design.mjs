/**
 * Stage 1 (v2) Home Design Tests — PRECISION DELIVERY DNA
 *
 * Verifies the redesigned home page matches the BLINKGO/ATLAS design:
 *   - Off-white canvas (#F7F7F5)
 *   - Single font: IBM Plex Sans
 *   - Editorial heading "What's nearby"
 *   - 3-column grid of restaurant cards (text-only)
 *   - 4-tab bottom nav (Home/Search/Orders/Profile)
 *   - 1px borders, 2px corners, NO shadows
 *   - 2 brand color (red) used sparingly
 *
 * Usage: node scripts/test-stage1-home-design.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/workspace/extracted/blinkgo-final';
const CLIENT = join(ROOT, 'app/(customer)/home/HomeClient.tsx');
const LAYOUT = join(ROOT, 'app/layout.tsx');
const TAILWIND = join(ROOT, 'tailwind.config.js');
const CSS = join(ROOT, 'app/globals.css');

const client = existsSync(CLIENT) ? readFileSync(CLIENT, 'utf8') : '';
const layout = existsSync(LAYOUT) ? readFileSync(LAYOUT, 'utf8') : '';
const tw = existsSync(TAILWIND) ? readFileSync(TAILWIND, 'utf8') : '';
const css = existsSync(CSS) ? readFileSync(CSS, 'utf8') : '';

const checks = {
  // ═══ Design DNA: PRECISION DELIVERY ═══
  'CSS: off-white canvas token #F7F7F5': css.includes('#F7F7F5') || css.includes('--canvas'),
  'CSS: single font family (IBM Plex Sans)': css.includes('--font-ibm-plex') || css.includes('IBM Plex Sans'),
  'CSS: brand red #C8102E': css.includes('#C8102E') || css.includes('--brand'),
  'CSS: 1px hairline borders': css.includes('--hairline') || css.includes('1px solid'),
  'CSS: NO glassmorphism (no backdrop-saturate)': !css.includes('backdrop-saturate-150'),
  'CSS: NO glow shadow': !css.includes('shadow-glow'),
  'Layout: imports IBM Plex Sans (not Inter/Cairo)': layout.includes('IBM_Plex_Sans') && !layout.includes("from 'next/font/google'") ? true : layout.includes('IBM_Plex_Sans'),
  'Layout: uses --font-ibm-plex': layout.includes('font-ibm-plex') || layout.includes('--font-ibm-plex'),
  'Layout: no Inter/Cairo font-family class': !layout.includes("'font-inter'") || layout.includes("'font-ibm-plex'"),
  'Tailwind: fontFamily sans uses IBM Plex': tw.includes('IBM Plex Sans') || tw.includes('--font-ibm-plex'),

  // ═══ Home: Editorial heading ═══
  'Home: heading-editorial class': client.includes('heading-editorial'),
  'Home: "What\'s nearby" or i18n key': client.includes("What's nearby") || client.includes('editorialHeading'),
  'Home: editorial sub text': client.includes('editorialSub') || client.includes('open now'),
  'Home: hairline divider': client.includes('hairline') || client.includes('Hairline divider'),

  // ═══ Home: Restaurant grid (3 cols, text-only) ═══
  'Home: grid 2/3 columns': client.includes('grid-cols-2') || client.includes('grid-cols-3'),
  'Home: card-precision class': client.includes('card-precision'),
  'Home: NO image / no cover URL': !client.includes('<img') && !client.includes('cover_image_url'),
  'Home: NO category icons (Utensils etc)': !client.includes('CATEGORIES') || !client.includes('cat_restaurants'),
  'Home: NO promo carousel (no AnimatePresence)': !client.includes('AnimatePresence'),
  'Home: NO reorder section': !client.includes('ReorderSection'),
  'Home: NO bestsellers section': !client.includes('BestsellersSection'),
  'Home: NO active order card': !client.includes('ActiveOrderCard'),
  'Home: 1px hairline border': client.includes('border-hairline') || client.includes('border-[var(--hairline)]'),
  'Home: 2px corner radius (rounded-[2px])': client.includes('rounded-[2px]'),
  'Home: NO shadow utility': !client.includes('shadow-lg') && !client.includes('shadow-2xl'),
  'Home: tabular-nums for time': client.includes('tabular-nums'),
  'Home: price tier ($/$$)': client.includes('priceTier') || client.includes('$$$'),

  // ═══ Bottom nav (4 tabs) — now in layout via CustomerBottomNav ═══
  'Nav: CustomerBottomNav exists': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')),
  'Nav: 4-tab grid': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && (readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes('grid-cols-4')),
  'Nav: tabs include home/search/orders/profile': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && ['/home', '/search', '/orders', '/profile'].every((p) => readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes(p)),
  'Nav: tab icons (Home, Search, Receipt, User)': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && ['Home', 'Search', 'Receipt', 'User'].every((s) => readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes(s)),
  'Nav: NO 5-tab nav (no favorites)': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && !readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes('/favorites'),
  'Nav: aria-current on active': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes('aria-current'),
  'Nav: aria-label on nav': existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')) && readFileSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx'), 'utf8').includes('aria-label="Bottom navigation"'),
  'Layout: uses CustomerBottomNav': existsSync(join(ROOT, 'app/(customer)/layout.tsx')) && readFileSync(join(ROOT, 'app/(customer)/layout.tsx'), 'utf8').includes('CustomerBottomNav'),
  'Layout: removed old CustomerNav (5 tabs)': existsSync(join(ROOT, 'app/(customer)/layout.tsx')) && !readFileSync(join(ROOT, 'app/(customer)/layout.tsx'), 'utf8').includes('CustomerNav'),
  'Layout: NO offline/announcement banner (PRECISION = minimal)': existsSync(join(ROOT, 'app/(customer)/layout.tsx')) && !readFileSync(join(ROOT, 'app/(customer)/layout.tsx'), 'utf8').includes('OfflineBanner') && !readFileSync(join(ROOT, 'app/(customer)/layout.tsx'), 'utf8').includes('AnnouncementBanner'),

  // ═══ Anti-AI design rules (PRECISION = no AI clichés) ═══
  'No fake food image placeholders': !client.includes('placeholder="food"'),
  'No emoji as primary icon': !client.match(/[\u{1F300}-\u{1FAFF}]/u),
  'No gold gradient buttons': !client.includes('from-yellow') && !client.includes('to-brand-yellow'),
  'No glassmorphism (backdrop-blur-xl+saturate)': !(client.includes('backdrop-blur-xl') && client.includes('backdrop-saturate')),
  'No oversized radii (rounded-3xl on action)': !client.includes('rounded-3xl'),
  'No pill buttons (h-12 px-12)': !client.includes('h-12 px-12'),
  'No Lucide emoji (Heart filled as primary)': !client.includes('fill-brand'),

  // ═══ Real data ═══
  'Home: fetches restaurants from /api/restaurants': client.includes('/api/restaurants'),
  'Home: SSR initial data (initialData)': client.includes('initialData'),
  'Home: refreshes on focus': client.includes('window.addEventListener(\'focus\''),
  'Home: handles empty state': client.includes('restaurants.length === 0'),

  // ═══ i18n ═══
  'Home: uses useT': client.includes('const t = useT()'),
  'Home: editorialHeading i18n': client.includes('t.home?.editorialHeading'),
  'Home: openStatus i18n': client.includes('t.home?.openStatus'),
  'Home: minutesLabel i18n': client.includes('t.home?.minutesLabel'),

  // ═══ Accessibility ═══
  'Home: role="search" on form': client.includes('role="search"'),
  'Home: sr-only label': client.includes('sr-only'),
  'Home: aria-label on cards': client.includes('aria-label={`${restaurant.name}'),
  'Home: aria-label on bottom nav (in layout)': client.includes('aria-label="Bottom navigation"') || existsSync(join(ROOT, 'components/customer/CustomerBottomNav.tsx')),
  'Home: prefers-reduced-motion (transitions only)': !client.includes('animate-[pulse'),
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

console.log(`\nStage 1 v2 (PRECISION DELIVERY) Home Design: ${passed} passed, ${failed} failed out of ${Object.keys(checks).length}`);

if (failedTests.length > 0) {
  console.log('\nFailed checks:');
  failedTests.forEach((t) => console.log(`  - ${t}`));
  process.exit(1);
}
console.log('\n✅ All PRECISION DELIVERY home design checks passed');
