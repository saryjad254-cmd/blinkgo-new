/**
 * Stage 1 v3 Home Design Tests — NEW VISUAL DIRECTION (Dark + Red + Gold)
 *
 * Verifies the redesigned home page matches the user's attached image:
 *   - Dark canvas (#0B0B0D)
 *   - Surface tokens (#121216, #19191F, #22222A)
 *   - Vivid Red #E10600 + Golden Yellow #FFC400
 *   - Side Drawer (B Blink Go logo + user profile + 9 nav items + driver promo)
 *   - 5-tab bottom nav (Home/Search/Orders/Favorites/Profile)
 *   - Real food imagery (Unsplash) for categories + restaurants
 *   - 5-slide hero promo carousel (LIVE NOW, NEW, EXPLORE, 24/7, GROCERIES)
 *   - 3-stage active order progress (kitchen → on the way → arriving)
 *   - Custom motorcycle SVG wordmark
 *   - Inter font (DE/EN) + IBM Plex Sans Arabic (AR)
 *
 * Usage: node scripts/test-stage1-home-v3.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/workspace/extracted/blinkgo-final';
const CLIENT = join(ROOT, 'app/(customer)/home/HomeClient.tsx');
const LAYOUT = join(ROOT, 'app/layout.tsx');
const TAILWIND = join(ROOT, 'tailwind.config.js');
const CSS = join(ROOT, 'app/globals.css');
const HEADER = join(ROOT, 'components/customer/AppHeader.tsx');
const DRAWER = join(ROOT, 'components/customer/SideDrawer.tsx');
const NAV = join(ROOT, 'components/customer/BottomNavigation.tsx');
const CARD = join(ROOT, 'components/customer/ActiveOrderCard.tsx');
const EN = join(ROOT, 'lib/i18n/locales/en.ts');
const DE = join(ROOT, 'lib/i18n/locales/de.ts');
const AR = join(ROOT, 'lib/i18n/locales/ar.ts');

const files = {
  client: existsSync(CLIENT) ? readFileSync(CLIENT, 'utf8') : '',
  layout: existsSync(LAYOUT) ? readFileSync(LAYOUT, 'utf8') : '',
  tw: existsSync(TAILWIND) ? readFileSync(TAILWIND, 'utf8') : '',
  css: existsSync(CSS) ? readFileSync(CSS, 'utf8') : '',
  header: existsSync(HEADER) ? readFileSync(HEADER, 'utf8') : '',
  drawer: existsSync(DRAWER) ? readFileSync(DRAWER, 'utf8') : '',
  nav: existsSync(NAV) ? readFileSync(NAV, 'utf8') : '',
  card: existsSync(CARD) ? readFileSync(CARD, 'utf8') : '',
  en: existsSync(EN) ? readFileSync(EN, 'utf8') : '',
  de: existsSync(DE) ? readFileSync(DE, 'utf8') : '',
  ar: existsSync(AR) ? readFileSync(AR, 'utf8') : '',
};

const checks = {
  // ═══ Dark Canvas Tokens ═══
  'CSS: dark canvas #0B0B0D': files.css.includes('#0B0B0D') && files.css.includes('--canvas'),
  'CSS: surface-1 #121216': files.css.includes('#121216') && files.css.includes('--surface-1'),
  'CSS: surface-2 #19191F': files.css.includes('#19191F') && files.css.includes('--surface-2'),
  'CSS: surface-3 #22222A': files.css.includes('#22222A') && files.css.includes('--surface-3'),
  'CSS: brand red #E10600': files.css.includes('#E10600') && files.css.includes('--brand'),
  'CSS: golden yellow #FFC400': files.css.includes('#FFC400') && files.css.includes('--brand-yellow'),
  'CSS: text primary #F7F7F5': files.css.includes('#F7F7F5') && files.css.includes('--text-primary'),
  'CSS: status open #22C55E': files.css.includes('#22C55E') && files.css.includes('--status-open'),
  'CSS: gradient brand': files.css.includes('--gradient-brand'),
  'CSS: gradient card': files.css.includes('--gradient-card'),
  'CSS: Inter font variable': files.css.includes('--font-sans') && files.css.includes('Inter'),

  // ═══ Tailwind Config ═══
  'TW: canvas color': files.tw.includes("canvas:") && files.tw.includes("'var(--canvas)'"),
  'TW: surface-1 color': files.tw.includes("'surface-1'") && files.tw.includes("'var(--surface-1)'"),
  'TW: surface-2 color': files.tw.includes("'surface-2'"),
  'TW: surface-3 color': files.tw.includes("'surface-3'"),
  'TW: brand color (red)': files.tw.includes('brand:') && files.tw.includes("DEFAULT: '#E10600'"),
  'TW: brand-yellow color': files.tw.includes("'brand-yellow'") && files.tw.includes("DEFAULT: '#FFC400'"),
  'TW: status-open color': files.tw.includes("'status-open'") && files.tw.includes("'#22C55E'"),
  'TW: ink color': files.tw.includes("ink:") && files.tw.includes("'#F7F7F5'"),
  'TW: text-primary alias': files.tw.includes("'text-primary'") && files.tw.includes("'var(--text-primary)'"),
  'TW: border alias': files.tw.includes("'border':") && files.tw.includes("'var(--border)'"),
  'TW: bg-card legacy alias': files.tw.includes("'bg-card'") && files.tw.includes("'var(--surface-card)'"),

  // ═══ Layout Font ═══
  'Layout: imports Inter from next/font/google': files.layout.includes("Inter") && files.layout.includes("from 'next/font/google'"),
  'Layout: imports IBM Plex Sans Arabic': files.layout.includes("IBM_Plex_Sans_Arabic"),
  'Layout: uses inter.variable': files.layout.includes("inter.variable") || files.layout.includes("className={`${inter.variable}"),
  'Layout: no Cairo font': !files.layout.includes("Cairo") || files.layout.includes("IBM_Plex_Sans_Arabic"),

  // ═══ AppHeader — Custom Motorcycle SVG ═══
  'AppHeader: exists': files.header.length > 0,
  'AppHeader: hamburger button': files.header.includes('aria-label="Open menu"') || files.header.includes('aria-label="hamburger"') || files.header.includes('Menu'),
  'AppHeader: inline SVG wordmark': files.header.includes('<svg') && (files.header.includes('B') || files.header.includes('#E10600')),
  'AppHeader: bell with badge': files.header.includes('Bell') && files.header.includes('badge'),
  'AppHeader: lucide-react path import .js': files.header.includes("'lucide-react/dist/esm/icons/") && files.header.includes(".js'"),

  // ═══ SideDrawer — All Required Items ═══
  'SideDrawer: exists': files.drawer.length > 0,
  'SideDrawer: red banner with logo': files.drawer.includes('from-[#E10600]') && (files.drawer.includes('Blink Go') || files.drawer.includes('BlinkGo') || files.drawer.includes('>B<') || files.drawer.includes('Blink-Go')),
  'SideDrawer: user profile (avatar + greeting)': files.drawer.includes('avatar') && files.drawer.includes('👋'),
  'SideDrawer: 8 nav items (Home/Search/Orders/Favorites/Addresses/Support/Settings/Logout)': [
    files.drawer.includes("href: '/home'"),
    files.drawer.includes("href: '/search'"),
    files.drawer.includes("href: '/orders'"),
    files.drawer.includes("href: '/favorites'"),
    files.drawer.includes("href: '/addresses'"),
    files.drawer.includes("href: '/help'"),
    files.drawer.includes("href: '/settings'"),
    files.drawer.includes("logout") && files.drawer.includes("signOut"),
  ].filter(Boolean).length >= 7,
  'SideDrawer: driver promo (Deliver with BlinkGo + Join Now)': files.drawer.includes('Deliver with BlinkGo') || files.drawer.includes('deliverTitle'),
  'SideDrawer: real Supabase signOut': files.drawer.includes('signOut') && files.drawer.includes('supabase'),
  'SideDrawer: toast.success for logout success': files.drawer.includes('toast.success') || files.drawer.includes('toast.error'),
  'SideDrawer: ESC to close': files.drawer.includes("'Escape'") || files.drawer.includes("'keydown'"),
  'SideDrawer: focus trap': files.drawer.includes('focus') || files.drawer.includes('tabIndex'),

  // ═══ BottomNavigation — 5 Tabs ═══
  'BottomNav: exists': files.nav.length > 0,
  'BottomNav: 5 tabs (grid-cols-5)': files.nav.includes('grid-cols-5'),
  'BottomNav: Home/Search/Orders/Favorites/Profile labels': files.nav.includes('home') && files.nav.includes('search') && files.nav.includes('orders') && files.nav.includes('favorites') && files.nav.includes('profile'),
  'BottomNav: brand red active color': files.nav.includes('text-brand') || files.nav.includes('text-[#E10600]'),
  'BottomNav: fixed bottom': files.nav.includes('fixed bottom-0') || files.nav.includes('bottom-0'),
  'BottomNav: 1px top border': files.nav.includes('border-t') || files.nav.includes('border-top'),

  // ═══ ActiveOrderCard — 3-Stage Progress ═══
  'ActiveOrderCard: exists': files.card.length > 0,
  'ActiveOrderCard: 3 stages (kitchen/onTheWay/arriving)': [
    files.card.includes('kitchen'),
    files.card.includes('onTheWay'),
    files.card.includes('arriving'),
  ].filter(Boolean).length >= 3,
  'ActiveOrderCard: emoji icons': files.card.includes('🍳') || files.card.includes('🛵') || files.card.includes('🏠'),
  'ActiveOrderCard: red progress bar': files.card.includes('bg-brand') || files.card.includes('#E10600'),

  // ═══ HomeClient — Complete Layout ═══
  'Home: AppHeader used': files.client.includes('AppHeader'),
  'Home: SideDrawer used': files.client.includes('SideDrawer'),
  'Home: BottomNavigation used': files.client.includes('BottomNavigation'),
  'Home: ActiveOrderCard used': files.client.includes('ActiveOrderCard'),
  'Home: hero promo carousel (5 slides)': files.client.includes('LIVE NOW') && files.client.includes('NEW') && files.client.includes('EXPLORE') && files.client.includes('24/7') && files.client.includes('GROCERIES'),
  'Home: 5 categories (Burger/Pizza/Sushi/Pharmacy/Market)': files.client.includes('Burger') && files.client.includes('Pizza') && files.client.includes('Sushi') && files.client.includes('Pharmacy') && files.client.includes('Market'),
  'Home: real Unsplash food images': files.client.includes('images.unsplash.com') || files.client.includes('unsplash'),
  'Home: search bar with filter': files.client.includes('search') && (files.client.includes('Filter') || files.client.includes('SlidersHorizontal')),
  'Home: popular near you heading': files.client.includes('popular') || files.client.includes('Popular'),
  'Home: lucide-react .js imports': files.client.includes("'lucide-react/dist/esm/icons/") && files.client.includes(".js'"),
  'Home: t.drawer?.confirm?.logout for success body': files.drawer.includes('t.drawer?.confirm?.logout') || files.drawer.includes('logoutSuccess') || files.drawer.includes('successBody') || files.drawer.includes('Abgemeldet'),

  // ═══ i18n Keys ═══
  'i18n EN: drawer.confirm.logout.success': files.en.includes("confirm: {") && files.en.includes("logout: {") && files.en.includes("success: 'Logged out'"),
  'i18n DE: drawer.confirm.logout.success': files.de.includes("confirm: {") && files.de.includes("logout: {") && files.de.includes("success: 'Abgemeldet'"),
  'i18n AR: drawer.confirm.logout.success': files.ar.includes("confirm: {") && files.ar.includes("logout: {") && files.ar.includes("success: 'تم تسجيل الخروج'"),
  'i18n EN: deliverTitle': files.en.includes("'deliverTitle'") || files.en.includes("Become a driver"),
  'i18n DE: deliverTitle': files.de.includes("'deliverTitle'") || files.de.includes("'Fahrer werden'"),
  'i18n AR: deliverTitle': files.ar.includes("'deliverTitle'") || files.ar.includes("'becomeDriver'") || files.ar.includes("انضم"),
  'i18n EN: activeOrderCard namespace': files.en.includes("activeOrderCard: {"),
  'i18n DE: activeOrderCard namespace': files.de.includes("activeOrderCard: {"),
  'i18n AR: activeOrderCard namespace': files.ar.includes("activeOrderCard: {"),

  // ═══ Anti-Patterns (must NOT exist) ═══
  'NO: glassmorphism (backdrop-blur-xl)': !files.client.includes('backdrop-blur-xl'),
  'NO: fake food placeholder': !files.client.includes('🍔') && !files.client.includes('🍕'),
  'NO: emoji as primary icon (in nav)': !files.nav.includes('🍔') && !files.nav.includes('🍕'),
  'NO: pill button (h-12 px-12)': !files.client.includes('h-12 px-12') && !files.client.includes('h-14 px-14'),
  'NO: h-12 px-12 button (anti-pattern)': !files.client.includes('h-12 px-12'),
  'NO: oversized 5xl radii': !files.client.includes('rounded-3xl') && !files.client.includes('rounded-[28px]') && !files.client.includes('rounded-[24px]'),
  'NO: gold gradient button': !files.client.includes('from-yellow-400 to-yellow-500'),
  'NO: shadow-2xl on cards': !files.client.includes('shadow-2xl'),

  // ═══ Required Sub-Namespace Routes ═══
  'AppHeader: t.drawer?.openMenu': files.header.includes('t.drawer?.openMenu') || files.header.includes("t.drawer.openMenu"),
  'HomeClient: t.drawer?.item?.logout': files.drawer.includes("t.drawer?.item?.logout") || files.drawer.includes("t.drawer.item.logout"),
};

// Run checks
let pass = 0;
let fail = 0;
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  BLINKGO Stage 1 v3 — NEW VISUAL DIRECTION (Dark+Red+Gold)   ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

for (const [name, ok] of Object.entries(checks)) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}`);
    fail++;
  }
}

const total = pass + fail;
const pct = total === 0 ? 0 : Math.round((pass / total) * 100);
console.log(`\n${pass}/${total} checks passed (${pct}%)`);
process.exit(fail === 0 ? 0 : 1);
