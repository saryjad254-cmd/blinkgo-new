# Environment Setup

## Prerequisites

- **Node.js** 18.18+ (LTS recommended)
- **npm** 9+
- **PostgreSQL** 14+ (via Supabase)
- **Git** (for version control)

## Local Development

### 1. Clone & Install

```bash
git clone <repository>
cd blinkgo
npm install
```

### 2. Environment Variables

Create `.env` from the example:

```bash
cp .env.example .env
```

Fill in the values (see [Environment Variables](#environment-variables) below).

### 3. Database Setup

Apply migrations to your Supabase project:

```bash
# Option A: Use the helper script
node scripts/apply-migrations.js

# Option B: Manual via psql
psql "$DATABASE_URL" -f deploy/supabase/00-auth-sync.sql
# ... apply all SQL files in alphabetical order
```

For fresh setup, use `deploy/supabase/COMPLETE_ALL_TABLES.sql` first.

### 4. Start Dev Server

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## Environment Variables

### Required (Critical)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for browser) | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, bypasses RLS) | `eyJ...` |
| `NEXT_PUBLIC_APP_URL` | Public app URL (for CORS, redirects) | `https://blinkgo.de` |

### Recommended

| Variable | Description |
|----------|-------------|
| `SUPABASE_PROJECT_REF` | Project reference (for migrations) |
| `SUPABASE_DB_PASSWORD` | Direct DB password (for psql) |
| `SUPABASE_DB_NAME` | Database name (default: `postgres`) |

### Optional (Features)

| Variable | Description | Feature |
|----------|-------------|---------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key | Maps |
| `STRIPE_SECRET_KEY` | Stripe secret (sk_...) | Payments |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key (pk_...) | Payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Webhooks |
| `RESEND_API_KEY` | Resend API key (re_...) | Email |
| `EMAIL_FROM` | Sender address | Email |

### Never in Production

| Variable | Purpose |
|----------|---------|
| `ENABLE_DEV_BYPASS=true` | Bypass admin auth (dev only!) |
| `ENABLE_DEV_PAYMENT=true` | Use mock Stripe (dev only!) |

### Setup Commands

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM="BlinkGo <noreply@blinkgo.de>"

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000  # dev
# NEXT_PUBLIC_APP_URL=https://blinkgo.de   # prod
```

---

## Demo Accounts

After applying migrations, these accounts exist:

| Role | Email | Password |
|------|-------|----------|
| Customer | `demo@blinkgo.de` | `DemoCustomer!2024` |
| Driver | `driver@blinkgo.de` | `DemoDriver!2024` |
| Restaurant | `restaurant@blinkgo.de` | `DemoRestaurant!2024` |
| Admin | `admin@blinkgo.de` | `DemoAdmin!2024` |

⚠️ **Change these in production!**

---

## Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note the URL, anon key, and service role key
3. Set a strong database password

### Apply Migrations

In order:

```bash
# Auth triggers
psql "$DATABASE_URL" -f deploy/supabase/00-auth-sync.sql

# RLS hardening
psql "$DATABASE_URL" -f deploy/supabase/01-rls-fixes.sql

# Aggregations
psql "$DATABASE_URL" -f deploy/supabase/02-aggregations.sql

# ... continue for all files in alphabetical order
```

Or use the helper:

```bash
node scripts/apply-migrations.js
```

### Enable Realtime

For driver tracking, enable Realtime on these tables in Supabase dashboard:
- `driver_locations`
- `order_events`
- `notifications`

### Storage (Optional)

For delivery proof images:
1. Create bucket `delivery-proofs` (private)
2. Add RLS policy for drivers to upload their own proofs

---

## Stripe Setup

### Test Mode

1. Create Stripe account → get test keys
2. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. For webhooks, install Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### Production

1. Activate Stripe account
2. Switch to live keys
3. Configure webhook in Stripe dashboard:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy webhook signing secret to env

---

## Google Maps Setup

1. Create project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable APIs:
   - Maps JavaScript API
   - Geocoding API
   - Directions API (optional)
3. Create API key, restrict by HTTP referrers (your domain)
4. Add to `.env`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
   ```

**Note:** The app falls back to OpenStreetMap (Leaflet + CARTO tiles) if Google Maps is unavailable or not configured.

---

## Email Setup (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain (or use the test sender for dev)
3. Create API key
4. Add to `.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="BlinkGo <noreply@yourdomain.com>"
   ```

For development, Resend allows sending to your own email only. Use OTP codes in console logs as fallback.

---

## Running Tests

### All Tests

```bash
node scripts/run-all-tests.js
```

This runs all 11 test suites with 15s throttle between them to avoid rate limit interference.

Expected: **221/221 passing**.

### Single Suite

```bash
node scripts/customer-journey-test.js
node scripts/driver-stress-test.js
# ... etc
```

### With Server Restart

If tests fail due to rate limit, restart the server between suites:

```bash
pkill -f "next start"
npx next start -p 3000 &
node scripts/single-suite.js
```

---

## Building for Production

```bash
# Build
npm run build

# Start production server
npm start
```

### Docker (Optional)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t blinkgo .
docker run -p 3000:3000 --env-file .env blinkgo
```

---

## Troubleshooting

### "Module not found" errors

```bash
rm -rf .next node_modules
npm install
npm run build
```

### TypeScript errors after pull

```bash
npm run typecheck
```

### Database connection issues

Check:
- `NEXT_PUBLIC_SUPABASE_URL` is correct
- IP allowlist in Supabase (for direct DB)
- `DATABASE_URL` for psql is set

### PWA not installing

- PWA install requires HTTPS (use ngrok or deploy to staging)
- Manifest must be served at `/manifest.json` (200 status)
- Icons must be at `/brand/icon-{192,512}.png`

### Rate limit issues during tests

- Restart server between test suites (clears in-memory bucket)
- Or wait 15 minutes for window to reset
- Or reduce test concurrency

---

## IDE Setup

### VS Code

Recommended extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)
- Supabase

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### WebStorm / IntelliJ

- Enable TypeScript service
- Set Prettier as default formatter
- Mark `node_modules` and `.next` as excluded
