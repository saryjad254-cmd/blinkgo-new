# Dependencies

Every production dependency in the project, organized by purpose, with a brief explanation of why each exists.

---

## 📦 Production Dependencies

### Core Framework

| Package | Version | Why it's there |
|---------|---------|----------------|
| `next` | ^14.2.15 | **Core framework.** Next.js 14 with App Router, SSR, image optimization, and middleware support. |
| `react` | ^18.3.1 | UI library. Used by all components. |
| `react-dom` | ^18.3.1 | React's DOM renderer for the browser. |

### Database & Auth (Supabase)

| Package | Version | Why it's there |
|---------|---------|----------------|
| `@supabase/supabase-js` | ^2.45.4 | **Core Supabase client.** Used for database queries, auth, and realtime in the browser. |
| `@supabase/ssr` | ^0.5.2 | **Server-Side Rendering helpers for Supabase.** Provides `createServerClient` for Next.js App Router, handles cookie-based auth in Server Components and middleware. |

### State Management

| Package | Version | Why it's there |
|---------|---------|----------------|
| `zustand` | ^4.5.5 | **Cart state management.** Lightweight client state for the shopping cart, persisted to localStorage. Chosen over Redux for simplicity (no boilerplate, ~1KB). |
| `@tanstack/react-query` | ^5.59.0 | **Server state caching.** Used in the customer layout for data fetching, optimistic updates, and background refetching. |

### Payments (Stripe)

| Package | Version | Why it's there |
|---------|---------|----------------|
| `stripe` | ^22.3.0 | **Server-side Stripe SDK.** Used to create Payment Intents, retrieve charges, and verify webhook signatures. The payment workflow goes Stripe → webhook → order confirmation. |
| `@stripe/stripe-js` | ^9.9.0 | **Client-side Stripe.js.** Loads Stripe Elements in the browser for secure card collection. |

### Email

| Package | Version | Why it's there |
|---------|---------|----------------|
| `resend` | ^6.17.2 | **Transactional email API.** Used for OTP emails, magic links, order confirmations, and password resets. Chosen for simplicity over SMTP. |

### UI & Styling

| Package | Version | Why it's there |
|---------|---------|----------------|
| `tailwindcss` | ^3.4.13 | **Utility-first CSS framework.** All styling uses Tailwind classes. Custom design tokens defined in `tailwind.config.js`. |
| `lucide-react` | ^0.451.0 | **Icon library.** 1000+ clean SVG icons used throughout the UI. Tree-shakeable. |
| `framer-motion` | ^12.42.2 | **Animation library.** Used for page transitions, modal animations, and micro-interactions. |

### Validation

| Package | Version | Why it's there |
|---------|---------|----------------|
| `zod` | ^3.23.8 | **TypeScript-first schema validation.** All API inputs validated with Zod schemas before processing. Auto-generates types from schemas. |

### Maps (loaded at runtime, not in package.json)

| Library | Where | Why |
|---------|-------|-----|
| Google Maps JS | `lib/maps/google-maps.ts` | Loaded via dynamic script tag for the map view. |
| Leaflet (OSM) | Used via CDN | OpenStreetMap fallback when Google Maps is unavailable. |

---

## 🛠️ Dev Dependencies

### TypeScript & Types

| Package | Version | Why |
|---------|---------|-----|
| `typescript` | ^5.6.2 | **TypeScript compiler.** All code is typed. |
| `@types/node` | ^20.16.10 | Type definitions for Node.js APIs. |
| `@types/react` | ^18.3.11 | Type definitions for React. |
| `@types/react-dom` | ^18.3.0 | Type definitions for ReactDOM. |
| `@types/google.maps` | ^3.65.2 | Type definitions for Google Maps JS API. |

### Build & Bundling

| Package | Version | Why |
|---------|---------|-----|
| `autoprefixer` | ^10.4.20 | PostCSS plugin that adds vendor prefixes. |
| `postcss` | ^8.4.47 | CSS transformation tool. |
| `eslint` | ^8.57.1 | JavaScript linter. |
| `eslint-config-next` | ^14.2.15 | Next.js's recommended ESLint config. |

### Environment

| Package | Version | Why |
|---------|---------|-----|
| `dotenv` | ^16.4.5 | Loads `.env` files in Node.js scripts (tests, migration scripts). Next.js has built-in `.env` support so this is only used by scripts. |

---

## 🔄 Dependency Choice Rationale

### Why Supabase (not Firebase / custom backend)?

- **Postgres** — Relational data with joins, perfect for orders + users + restaurants
- **Row Level Security** — Database-level authorization (defense in depth)
- **Realtime** — Built-in WebSocket subscriptions for live order tracking
- **Auth** — Email/Password + OAuth + Magic Link out of the box
- **Open source** — Can self-host if needed
- **Cost** — Generous free tier

### Why Zustand (not Redux / Context)?

- **Zero boilerplate** — No actions, reducers, dispatchers
- **1KB gzipped** — Tiny footprint
- **TypeScript-first** — Excellent type inference
- **Persistence middleware** — Cart auto-saves to localStorage

### Why TanStack Query (not SWR / fetch)?

- **Mutations** — First-class support (critical for cart updates)
- **Optimistic updates** — UI feels instant
- **Cache invalidation** — Smart refetching
- **Devtools** — Excellent debugging

### Why Tailwind (not CSS Modules / styled-components)?

- **No runtime cost** — Compiles to static CSS
- **Consistency** — Design tokens enforced via config
- **Speed** — No need to invent class names
- **Bundle size** — Purged in production

### Why Framer Motion (not CSS transitions)?

- **AnimatePresence** — Exit animations (not possible with CSS alone)
- **Gestures** — Drag, hover, tap with built-in physics
- **Layout animations** — `layout` prop for smooth reordering

### Why Zod (not Yup / Joi)?

- **TypeScript inference** — `z.infer<typeof schema>` gives you the type for free
- **Composability** — Schemas compose easily
- **Error messages** — Excellent DX
- **Bundle size** — 8KB vs Joi's larger footprint

---

## 📊 Dependency Stats

- **Production deps:** 14 packages
- **Dev deps:** 11 packages
- **Total size:** ~50MB with `node_modules`
- **Critical path:** 5 packages (next, react, supabase, zustand, tailwind)

---

## 🔒 Security Considerations

- All production deps are **actively maintained** (no abandoned packages)
- **No known critical CVEs** in current versions
- `stripe` and `resend` are SDK-only — actual API calls go over HTTPS
- `framer-motion` is lazy-loaded for components that need it
- All Supabase calls are over HTTPS by default

---

## 🔄 Updating Dependencies

To update safely:

```bash
# Check outdated packages
npm outdated

# Update all to latest minor/patch
npm update

# Update specific package (carefully)
npm install <package>@latest

# Test after update
npm test
npm run build
```

Always test in a staging environment first, especially for major version bumps.

---

## 🌐 External Services (not npm packages)

| Service | Purpose | Required |
|---------|---------|----------|
| Supabase | Database + Auth + Realtime | ✅ Yes |
| Stripe | Payments | 🟡 Optional (dev mode bypass) |
| Resend | Transactional email | 🟡 Optional (logs to console in dev) |
| Google Maps | Map display | 🟡 Optional (falls back to OSM) |
| OpenStreetMap | Map fallback | 🟢 Free, no key needed |
