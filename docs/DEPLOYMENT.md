# Deployment

## Recommended: Vercel

Vercel is the recommended deployment target. It provides:
- Auto-scaling serverless functions
- Global edge network
- Zero-config Next.js support
- Preview deployments for PRs
- Built-in analytics

### One-Click Deploy

1. Push code to GitHub
2. Import in [Vercel Dashboard](https://vercel.com/new)
3. Add environment variables (see below)
4. Deploy

### Manual Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (preview)
vercel

# Deploy (production)
vercel --prod
```

### Environment Variables in Vercel

Go to **Project Settings → Environment Variables** and add:

#### Required
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

Add `NEXT_PUBLIC_APP_URL` **AFTER** first deploy (use the auto-generated URL, then update if you have a custom domain).

#### Recommended
```
SUPABASE_PROJECT_REF=your-project-ref
```

#### Optional (for features)
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM=BlinkGo <noreply@yourdomain.com>
```

#### DO NOT set in production
```
ENABLE_DEV_BYPASS  # never in prod
ENABLE_DEV_PAYMENT # never in prod
```

### Custom Domain

1. Go to **Project Settings → Domains**
2. Add your domain (e.g., `blinkgo.de`)
3. Configure DNS (Vercel shows required records)
4. Update `NEXT_PUBLIC_APP_URL` env var to match
5. Redeploy

### Stripe Webhook (Production)

1. In Stripe Dashboard → Webhooks → Add Endpoint
2. URL: `https://your-domain.com/api/stripe/webhook`
3. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET` env var
5. Redeploy

---

## Alternative: Self-Hosted

### Requirements
- Node.js 18.18+ server
- PostgreSQL 14+ (Supabase works)
- Reverse proxy (nginx/Caddy) with HTTPS
- Process manager (PM2/systemd)

### Build

```bash
npm install
npm run build
```

### Run with PM2

```bash
npm install -g pm2
pm2 start npm --name "blinkgo" -- start
pm2 save
pm2 startup
```

### Run with systemd

Create `/etc/systemd/system/blinkgo.service`:

```ini
[Unit]
Description=BlinkGo Next.js App
After=network.target

[Service]
Type=simple
User=blinkgo
WorkingDirectory=/opt/blinkgo
EnvironmentFile=/opt/blinkgo/.env
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable blinkgo
systemctl start blinkgo
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["npm", "start"]
```

```bash
docker build -t blinkgo .
docker run -d -p 3000:3000 --env-file .env --name blinkgo blinkgo
```

---

## Database Migrations

### Apply to Production

```bash
# Option A: psql
psql "$DATABASE_URL" -f deploy/supabase/00-auth-sync.sql
# ... continue for all files in order

# Option B: Helper script
node scripts/apply-migrations.js
```

### Order Matters
Migrations must be applied in alphabetical order (00-, 01-, 02-, ...). The naming convention ensures this.

### Verify After Apply

```sql
-- Check tables exist
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;
-- Should return 0 rows
```

---

## Post-Deployment Checklist

### Smoke Tests

- [ ] Visit `/` — should redirect to login or search
- [ ] Login as `demo@blinkgo.de` — should work
- [ ] Browse restaurants — should show results
- [ ] Add item to cart — should update
- [ ] Logout — should clear session
- [ ] `/admin` — should require admin login

### Health Check

```bash
curl https://your-domain.com/api/health
# Expected: { "ok": true, "status": "healthy" }
```

### Stripe Webhook

```bash
# Use Stripe CLI to test
stripe trigger payment_intent.succeeded
```

### Monitoring

Recommended:
- [Vercel Analytics](https://vercel.com/analytics) — Performance
- [Sentry](https://sentry.io) — Error tracking
- [LogRocket](https://logrocket.com) — Session replay
- [PostHog](https://posthog.com) — Product analytics

---

## CI/CD

### GitHub Actions Example

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Pre-commit Hooks

`.husky/pre-commit`:

```bash
#!/bin/sh
npm run typecheck
npm run lint
```

---

## Rollback

### Vercel
1. Go to Deployments
2. Find last working deployment
3. Click "Promote to Production"

### Self-hosted
```bash
# Keep last 3 builds
ls -la .next/  # check current
mv .next .next.broken
# Restore previous
cp -r .next.previous .next
pm2 restart blinkgo
```

### Database
- Supabase: Use PITR (Point-in-Time Recovery) from dashboard
- Self-hosted: Restore from `pg_dump` backup

---

## Performance Tuning

### Vercel
- Edge functions for middleware (auto)
- Image optimization (auto)
- ISR for static pages (use `revalidate`)

### Database
- Connection pooling: Supabase pooler
- Add indexes for slow queries
- Use `EXPLAIN ANALYZE` to find bottlenecks

### Application
- Enable HTTP/2 (Vercel default)
- Brotli compression (Vercel default)
- TanStack Query for client cache
- Server Components for less JS

---

## Cost Estimation (Vercel)

**Hobby (Free):**
- Up to 100GB bandwidth/month
- 100 serverless function executions/day
- Good for staging

**Pro ($20/seat/month):**
- 1TB bandwidth
- 1M function executions
- Password protection
- Recommended for production

**Supabase:**
- Free tier: 500MB DB, 2GB bandwidth
- Pro ($25/month): 8GB DB, 50GB bandwidth, daily backups

**Stripe:**
- No monthly fee
- 1.4% + €0.25 per EU card transaction

**Estimated total for small production:**
~$70/month + transaction fees
