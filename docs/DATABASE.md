# Database

The BlinkGo database is **PostgreSQL 15** hosted on **Supabase**. It uses Row Level Security (RLS) for authorization and includes 25+ tables, 33 SQL migrations, and realtime subscriptions.

**Project:** `rhdaffhlrglyknxtucux.supabase.co`

---

## 📊 Tables Overview

### Core User Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | All user accounts (mirror of auth.users + profile) | id, email, role, name, is_active |
| `auth.users` | Supabase auth (managed) | id, email, encrypted_password |
| `user_addresses` | Saved delivery addresses | user_id, address, lat, lng, is_default |
| `customer_addresses` | Customer-specific addresses | customer_id, address, lat, lng |

### Restaurant & Product Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `restaurants` | Restaurant profiles | name, address, lat, lng, cuisine, type, is_active |
| `products` | Menu items | restaurant_id, name, price, category, is_available |
| `categories` | Product categories | name, icon, sort_order |
| `cuisine_types` | Available cuisines | name, code, icon |

### Order Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `orders` | Order records | customer_id, restaurant_id, status, total, delivery_address |
| `order_items` | Order line items | order_id, product_id, quantity, price |
| `order_tracking_events` | Status change history | order_id, status, created_at |
| `ratings` | Order/restaurant/driver ratings | order_id, restaurant_id, rating, review |

### Driver Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `driver_status` | Real-time driver state | driver_id, is_online, lat, lng, last_seen |
| `driver_working_hours` | Driver schedules | driver_id, day_of_week, start_time, end_time |
| `driver_location_history` | GPS history (for analytics) | driver_id, lat, lng, recorded_at |

### Marketing & Loyalty

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `coupons` | Discount coupons | code, discount_type, discount_value, expires_at |
| `coupon_redemptions` | Coupon usage tracking | coupon_id, user_id, order_id, used_at |
| `loyalty_accounts` | User loyalty balances | user_id, points, tier, lifetime_points |
| `loyalty_transactions` | Points history | user_id, points, type, reason |
| `loyalty_rewards` | Redeemable rewards | name, points_cost, is_active |
| `loyalty_redemptions` | Reward claims | user_id, reward_id, redeemed_at |
| `referrals` | Referral program | referrer_id, referee_id, code, status |
| `promotions` | Time-based promos | restaurant_id, name, discount, valid_from, valid_to |

### Notifications & Communication

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notifications` | In-app notifications | user_id, type, title, body, data, read_at |
| `push_subscriptions` | Web push subscriptions | user_id, endpoint, p256dh, auth |
| `share_links` | Order share tokens | order_id, token, expires_at |

### Favorites & History

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `favorites` | Customer favorite restaurants | user_id, restaurant_id, created_at |
| `recently_viewed` | Browsing history | user_id, product_id, viewed_at |
| `search_history` | Search analytics | user_id, query, result_count |

### Auth Support Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `email_otps` | OTP verification codes | email, code_hash, expires_at, used_at |
| `magic_link_tokens` | Magic link tokens | user_id, email, token_hash, expires_at |
| `login_attempts` | Login attempt log | email, ip_address, success, created_at |
| `audit_log` | Sensitive action log | user_id, action, resource, ip, created_at |

### Operational

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `payments` | Stripe payment records | order_id, amount, status, stripe_payment_intent_id |
| `daily_metrics` | Aggregated daily stats | date, orders, revenue, new_users |
| `restaurants.type` (added) | restaurant | market | pharmacy | |

---

## 🔗 Entity Relationships

```
auth.users (Supabase managed)
    ↓ mirrors
public.users
    ├── role: customer | driver | restaurant_owner | admin | manager
    ├── has many → orders (as customer)
    ├── has many → driver_status (if driver)
    ├── has many → user_addresses
    ├── has many → favorites
    ├── has many → loyalty_accounts
    └── has many → notifications

restaurants
    ├── owned by → users (restaurant_owner role)
    ├── has many → products
    ├── has many → orders
    ├── has many → promotions
    └── has many → driver_status (drivers that delivered here)

products
    ├── belongs to → restaurants
    ├── has many → order_items
    └── can be in → recently_viewed (per user)

orders
    ├── belongs to → customers (users)
    ├── belongs to → restaurants
    ├── has many → order_items
    ├── has many → order_tracking_events
    ├── has one → payment
    └── has one → rating

driver_status
    ├── belongs to → users (driver)
    └── tracks → current location + online state

coupons
    ├── has many → coupon_redemptions
    └── applies to → orders (or restaurants)

loyalty_accounts
    ├── belongs to → users
    ├── has many → loyalty_transactions
    └── can claim → loyalty_rewards → loyalty_redemptions
```

---

## 🔒 Row Level Security (RLS)

**Every table has RLS enabled.** This means database-level authorization — even if application code is compromised, users can only access their own data.

### Common RLS Policies

```sql
-- Users can only read their own data
CREATE POLICY "Users read own" ON users
  FOR SELECT USING (auth.uid() = id);

-- Drivers can read their own status
CREATE POLICY "Drivers read own status" ON driver_status
  FOR SELECT USING (auth.uid() = driver_id);

-- Customers can only see their own orders
CREATE POLICY "Customers read own orders" ON orders
  FOR SELECT USING (auth.uid() = customer_id);

-- Restaurants can read orders for their restaurant
CREATE POLICY "Restaurants read their orders" ON orders
  FOR SELECT USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Admins can read everything
CREATE POLICY "Admins read all" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
```

The `auth_role()` function returns `'anon'` for unauthenticated users (NOT NULL), simplifying policy logic.

---

## 🔄 Migration Strategy

All migrations live in `deploy/supabase/` and must be applied **in numerical order**.

### Migration Index

| File | Purpose | Size |
|------|---------|------|
| `00-auth-sync.sql` | Sync auth.users → public.users (trigger) | Small |
| `01-rls-fixes.sql` | RLS policy fixes | Medium |
| `02-aggregations.sql` | Auto-update triggers for stats | Small |
| `03-helpers.sql` | RPC functions (auth_role, etc.) | Medium |
| `04-fix-coupon.sql` | Coupon bug fix | Small |
| `05-fix-ambiguous.sql` | Fix SQL ambiguity | Small |
| `06-fix-column-name.sql` | Rename column | Small |
| `07-orders-rls.sql` | Orders RLS policies | Small |
| `08-orders-status-enum.sql` | Add orders status enum | Small |
| `09-driver-accept-rls.sql` | Driver accept RLS | Small |
| `10-perf-features.sql` | Performance features | Small |
| `11-fix-is-visible.sql` | Visibility fix | Small |
| `12-users-select.sql` | Users select policy | Small |
| `13-users-no-recursion.sql` | No-infinite-recursion policy | Small |
| `14-complete-schema.sql` | **Complete schema (use as base)** | Large (596 lines) |
| `15-activity-log-and-reset.sql` | Activity log + reset | Medium |
| `16-enhanced-products.sql` | Product enhancements | Medium |
| `17-apply-now.sql` | Critical missing columns | Small |
| `18-fix-duplicate-users.sql` | User uniqueness | Small |
| `19-production-upgrade.sql` | Production-grade schema | Medium |
| `20-create-driver-status.sql` | Driver status table | Small |
| `21-create-remaining-tables.sql` | Missing tables | Small |
| `22-missing-features-v29.sql` | v29 features | Medium |
| `23-perf-indexes-v31.sql` | Performance indexes | Small |
| `24-helper-functions-v33.sql` | Helper functions | Small |
| `25-maps-perf-v36.sql` | Maps performance | Small |
| `26-ops-v38.sql` | Operations features | Large (737 lines) |
| `27-qa-fixes-v40.sql` | QA fixes | Medium |
| `28-restaurant-type.sql` | Restaurant type column | Small |
| `29-magic-link-tokens.sql` | Magic link tokens | Small |
| `30-login-attempts.sql` | Login attempt log | Small |
| `31-restaurant-quick-filters.sql` | Quick filter columns | Small |
| `32-oauth-support.sql` | OAuth support | Small |

### Applying Migrations

**Option 1: Supabase SQL Editor (recommended for small projects)**

1. Open Supabase Dashboard → SQL Editor
2. For each file in `deploy/supabase/` in order:
   - Click "New query"
   - Copy file contents
   - Click "Run"

**Option 2: Migration script**

```bash
# Requires psql and DIRECT_DATABASE_URL
psql "$DATABASE_URL" -f deploy/supabase/00-auth-sync.sql
psql "$DATABASE_URL" -f deploy/supabase/01-rls-fixes.sql
# ... etc
```

**Option 3: Apply helper script (prints SQL for manual application)**

```bash
node scripts/apply-migrations.js deploy/supabase/00-auth-sync.sql
```

### Verifying Migrations

After applying all migrations, verify:

```sql
-- Should be 25+ tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Should be 50+ policies
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- All migrations should have succeeded
-- If you see errors, check the order and re-apply
```

---

## 📈 Database Performance

### Indexes

Critical indexes are defined in migrations:

- `idx_orders_customer_id` — Customer order lookups
- `idx_orders_restaurant_id` — Restaurant order lookups
- `idx_orders_status` — Filter by status
- `idx_orders_created_at` — Date-based queries
- `idx_products_restaurant_id` — Menu lookups
- `idx_driver_status_online` — Find available drivers
- `idx_users_email` — Login lookups
- `idx_notifications_user_id` — User notification feed
- `idx_restaurants_type` — Type filter
- `idx_restaurants_promoted` — Featured restaurants

### Query Patterns

Most queries use the following pattern:

```typescript
// Service-role client for system operations
const svc = createServiceClient();
const { data } = await svc.from('orders')
  .select('*, order_items(*), restaurants(*)')
  .eq('customer_id', userId)
  .order('created_at', { ascending: false })
  .limit(20);
```

### Realtime Subscriptions

The following tables have realtime enabled:
- `orders` — Live order status
- `notifications` — In-app notifications
- `driver_status` — Live driver locations

Example subscription:

```typescript
const subscription = supabase
  .channel('order-tracking')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `id=eq.${orderId}`,
  }, (payload) => {
    // Update UI
  })
  .subscribe();
```

---

## 🔐 Security Best Practices

1. **Never expose the service-role key** to the client
2. **Always use RLS** — never disable for "convenience"
3. **Validate all inputs** before queries (use Zod)
4. **Use parameterized queries** (Supabase client does this)
5. **Audit sensitive operations** — log to `audit_log`
6. **Rotate keys regularly** — Service role + database password
7. **Monitor for unusual patterns** — failed logins, large queries, etc.

---

## 🆘 Common Operations

### Reset All Data (DESTRUCTIVE)

```sql
-- WARNING: This deletes all user data
TRUNCATE TABLE orders, order_items, notifications, ratings, favorites, 
  loyalty_accounts, loyalty_transactions, coupon_redemptions, 
  user_addresses, recently_viewed, search_history, audit_log
  CASCADE;
-- Note: users are managed by Supabase Auth, don't truncate them
```

### Seed Demo Data

Use the test scripts (e.g., `customer-journey-test.js`) which create their own test data.

Or manually in Supabase Dashboard → Table Editor → Insert rows.

### Backup

Supabase automatically backs up your database daily. For manual backup:

```bash
# Requires DIRECT_DATABASE_URL
pg_dump "$DIRECT_DATABASE_URL" > backup_$(date +%Y%m%d).sql
```

---

## 📞 Support

For database issues:
- Supabase Dashboard → Logs
- Supabase Discord: https://discord.supabase.com
- Migration issues: check `docs/SECURITY.md` for best practices
