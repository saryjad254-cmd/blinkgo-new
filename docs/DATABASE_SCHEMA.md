# Database Schema

## Overview

BlinkGo uses PostgreSQL 14+ via Supabase. The schema covers 6 domains:

- **Identity** — users, addresses, OTP
- **Catalog** — restaurants, products, categories
- **Orders** — orders, items, events
- **Delivery** — drivers, locations, hours
- **Engagement** — favorites, ratings, notifications
- **Commerce** — coupons, loyalty, referrals

## Entity Relationship Diagram

```
                ┌──────────┐
                │  users   │
                └────┬─────┘
                     │
        ┌────────────┼────────────┬─────────────┐
        │            │            │             │
        ▼            ▼            ▼             ▼
   ┌────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
   │drivers │  │  orders  │  │ favorites│  │coupons │
   └────┬───┘  └────┬─────┘  └────┬─────┘  └────────┘
        │           │             │
        │           ▼             │
        │      ┌─────────┐        │
        │      │  order_ │        │
        │      │  items  │        │
        │      └────┬────┘        │
        │           │             │
        │           ▼             │
        │      ┌─────────┐        │
        │      │products │◄───────┘
        │      └────┬────┘
        │           │
        ▼           ▼
   ┌──────────┐  ┌──────────┐
   │  driver_ │  │restaurant│
   │ locations│  │  s       │
   └──────────┘  └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
                  │ categories│
                  └──────────┘
```

## Tables

### Identity Domain

#### `users`
Core user table. Mirrors `auth.users` with public profile data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, FK→auth.users | User ID |
| `email` | TEXT | UNIQUE, NOT NULL | Email |
| `name` | TEXT | | Display name |
| `phone` | TEXT | | E.164 format |
| `role` | TEXT | NOT NULL, CHECK | `customer`/`driver`/`restaurant`/`admin`/`super_admin`/`manager` |
| `is_active` | BOOLEAN | DEFAULT true | Account status |
| `is_verified` | BOOLEAN | DEFAULT false | Email verified |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes:** `email`, `role`, `is_active`

#### `user_addresses`
Saved delivery addresses.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users |
| `label` | TEXT | "Home", "Work", etc. |
| `address` | TEXT | Full address |
| `lat` | NUMERIC(10,7) | |
| `lng` | NUMERIC(10,7) | |
| `is_default` | BOOLEAN | Default for orders |
| `created_at` | TIMESTAMPTZ | |

#### `email_otps`
In-memory or DB-stored OTP codes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `email` | TEXT | |
| `code` | TEXT | 6-digit |
| `expires_at` | TIMESTAMPTZ | 10 min |
| `used` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### Catalog Domain

#### `restaurants`
Restaurant profiles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `owner_id` | UUID | FK→users (restaurant role) |
| `name` | TEXT | NOT NULL |
| `description` | TEXT | |
| `cuisine` | TEXT | italian, german, etc. |
| `address` | TEXT | |
| `phone` | TEXT | |
| `lat` | NUMERIC(10,7) | |
| `lng` | NUMERIC(10,7) | |
| `rating` | NUMERIC(3,2) | 0.00–5.00 |
| `review_count` | INTEGER | |
| `delivery_fee` | NUMERIC(6,2) | |
| `min_order_amount` | NUMERIC(6,2) | |
| `is_active` | BOOLEAN | Accepting orders |
| `is_featured` | BOOLEAN | |
| `prep_time_avg_min` | INTEGER | |
| `logo_url` | TEXT | |
| `cover_url` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `cuisine`, `is_active`, GIST(lat, lng) for geo queries

#### `categories`
Menu categories per restaurant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `restaurant_id` | UUID | FK→restaurants |
| `name` | TEXT | |
| `display_order` | INTEGER | |
| `is_active` | BOOLEAN | |

#### `products`
Menu items.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `restaurant_id` | UUID | FK→restaurants |
| `category_id` | UUID | FK→categories (nullable) |
| `name` | TEXT | |
| `description` | TEXT | |
| `price` | NUMERIC(8,2) | |
| `discount_price` | NUMERIC(8,2) | Nullable |
| `image_url` | TEXT | |
| `is_available` | BOOLEAN | In stock |
| `is_featured` | BOOLEAN | Bestseller |
| `is_vegetarian` | BOOLEAN | |
| `is_vegan` | BOOLEAN | |
| `is_halal` | BOOLEAN | |
| `prep_time_min` | INTEGER | |
| `calories` | INTEGER | |
| `allergens` | TEXT[] | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `product_options`
Sizes/extras with price modifiers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `product_id` | UUID | FK→products |
| `name` | TEXT | "Large", "Extra cheese" |
| `price_modifier` | NUMERIC(6,2) | Can be negative |
| `type` | TEXT | `size` / `extra` |
| `is_required` | BOOLEAN | |

### Orders Domain

#### `orders`
Order header.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `order_number` | TEXT | UNIQUE, human-readable |
| `customer_id` | UUID | FK→users |
| `restaurant_id` | UUID | FK→restaurants |
| `driver_id` | UUID | FK→users, nullable |
| `status` | TEXT | See enum below |
| `subtotal` | NUMERIC(8,2) | |
| `delivery_fee` | NUMERIC(6,2) | |
| `service_fee` | NUMERIC(6,2) | |
| `tax` | NUMERIC(6,2) | |
| `tip` | NUMERIC(6,2) | Capped at 500 |
| `discount` | NUMERIC(6,2) | |
| `total` | NUMERIC(8,2) | |
| `commission` | NUMERIC(6,2) | Platform commission |
| `payment_method` | TEXT | `cash`/`card`/`online` |
| `payment_status` | TEXT | `pending`/`paid`/`failed`/`refunded` |
| `payment_intent_id` | TEXT | Stripe reference |
| `delivery_address` | TEXT | |
| `customer_lat` | NUMERIC(10,7) | |
| `customer_lng` | NUMERIC(10,7) | |
| `notes` | TEXT | |
| `coupon_id` | UUID | FK→coupons, nullable |
| `scheduled_for` | TIMESTAMPTZ | Nullable (scheduled orders) |
| `accepted_at` | TIMESTAMPTZ | Driver accepted |
| `picked_up_at` | TIMESTAMPTZ | |
| `delivered_at` | TIMESTAMPTZ | |
| `cancelled_at` | TIMESTAMPTZ | |
| `cancel_reason` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

**Order Status Enum:**
- `pending` — Just placed, awaiting restaurant
- `confirmed` — Restaurant accepted
- `preparing` — In kitchen
- `ready` — Ready for pickup
- `assigned` — Driver assigned
- `picked_up` — Driver picked up
- `on_the_way` — En route to customer
- `delivered` — Completed
- `cancelled` — Cancelled

**Indexes:** `customer_id`, `restaurant_id`, `driver_id`, `status`, `created_at`, `order_number`

#### `order_items`
Line items in an order.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `order_id` | UUID | FK→orders |
| `product_id` | UUID | FK→products |
| `product_name` | TEXT | Denormalized for history |
| `product_price` | NUMERIC(8,2) | Denormalized |
| `quantity` | INTEGER | |
| `subtotal` | NUMERIC(8,2) | |
| `options` | JSONB | Selected extras/sizes |
| `notes` | TEXT | |

#### `order_events`
Audit trail / tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `order_id` | UUID | FK→orders |
| `event_type` | TEXT | `placed`/`confirmed`/`preparing`/`ready`/`picked_up`/`delivered`/`cancelled` |
| `actor_id` | UUID | FK→users (who did it) |
| `actor_role` | TEXT | |
| `metadata` | JSONB | Event-specific data |
| `created_at` | TIMESTAMPTZ | |

### Delivery Domain

#### `drivers` (virtual — extends users)
No dedicated table. Driver data is on `users` (role=driver) plus:

#### `driver_locations`
GPS tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `driver_id` | UUID | FK→users |
| `lat` | NUMERIC(10,7) | |
| `lng` | NUMERIC(10,7) | |
| `heading` | NUMERIC(5,2) | Degrees |
| `speed` | NUMERIC(5,2) | m/s |
| `accuracy` | NUMERIC(6,2) | meters |
| `active_order_id` | UUID | FK→orders, nullable |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `driver_id`, `created_at`, `active_order_id`

#### `working_hours`
Driver/admin-defined shift times.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `driver_id` | UUID | FK→users |
| `day_of_week` | INTEGER | 0–6 (Sun–Sat) |
| `start_time` | TIME | |
| `end_time` | TIME | |
| `is_enabled` | BOOLEAN | |
| `effective_from` | DATE | |

### Engagement Domain

#### `favorites`
User favorited restaurants.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users |
| `restaurant_id` | UUID | FK→restaurants |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE:** `(user_id, restaurant_id)`

#### `ratings`
Reviews for orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `order_id` | UUID | FK→orders |
| `customer_id` | UUID | FK→users |
| `restaurant_id` | UUID | FK→restaurants |
| `driver_id` | UUID | FK→users, nullable |
| `restaurant_rating` | INTEGER | 1–5 |
| `driver_rating` | INTEGER | 1–5, nullable |
| `comment` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

#### `notifications`
In-app notifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users |
| `type` | TEXT | `order`/`promo`/`system` |
| `title` | TEXT | |
| `body` | TEXT | |
| `data` | JSONB | Action payload |
| `is_read` | BOOLEAN | DEFAULT false |
| `created_at` | TIMESTAMPTZ | |

#### `push_subscriptions`
Web push endpoints.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users |
| `endpoint` | TEXT | UNIQUE |
| `p256dh` | TEXT | |
| `auth` | TEXT | |
| `user_agent` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### Commerce Domain

#### `coupons`
Discount codes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `code` | TEXT | UNIQUE, case-insensitive |
| `type` | TEXT | `percentage` / `fixed` / `free_delivery` |
| `value` | NUMERIC(6,2) | % or € |
| `min_order_amount` | NUMERIC(6,2) | |
| `max_discount` | NUMERIC(6,2) | For percentage |
| `usage_limit` | INTEGER | Total redemptions |
| `usage_count` | INTEGER | Used so far |
| `valid_from` | TIMESTAMPTZ | |
| `valid_until` | TIMESTAMPTZ | |
| `is_active` | BOOLEAN | |
| `restaurant_id` | UUID | NULL = platform-wide |
| `created_at` | TIMESTAMPTZ | |

#### `loyalty_points`
User points balance + history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users |
| `points` | INTEGER | |
| `type` | TEXT | `earned` / `redeemed` / `expired` |
| `reason` | TEXT | |
| `order_id` | UUID | FK→orders, nullable |
| `created_at` | TIMESTAMPTZ | |

#### `referrals`
Referral tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `referrer_id` | UUID | FK→users (inviter) |
| `referred_id` | UUID | FK→users (invitee) |
| `referral_code` | TEXT | |
| `status` | TEXT | `pending` / `completed` / `expired` |
| `reward_points` | INTEGER | |
| `completed_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

## Row-Level Security (RLS)

All tables have RLS enabled. Key policies:

### `users`
- Read: own row OR admin
- Update: own row only (not role/is_active)
- Insert: via signup trigger

### `orders`
- Read: own (as customer) OR own (as driver) OR own (as restaurant) OR admin
- Insert: authenticated customers only
- Update: status only by restaurant/driver/admin (based on ownership)

### `restaurants`
- Read: public (anon OK)
- Update: owner only
- Insert: admin only

### `products`
- Read: public (anon OK)
- Update: restaurant owner only

### `notifications`
- Read: own only
- Update: own only (mark as read)
- Insert: service role only

### `coupons`
- Read: public (for validation)
- Insert/Update: admin only

### `loyalty_points`
- Read: own only
- Insert: service role only

---

## Indexes

Performance indexes (in addition to FK indexes):

```sql
-- Geo search
CREATE INDEX idx_restaurants_geo ON restaurants USING gist (ll_to_earth(lat, lng));
CREATE INDEX idx_drivers_geo ON driver_locations USING gist (ll_to_earth(lat, lng));

-- Order queries
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status, created_at DESC);
CREATE INDEX idx_orders_restaurant_status ON orders (restaurant_id, status, created_at DESC);
CREATE INDEX idx_orders_driver_status ON orders (driver_id, status, created_at DESC);

-- Driver tracking
CREATE INDEX idx_driver_locations_recent ON driver_locations (driver_id, created_at DESC);

-- Favorites / ratings lookup
CREATE INDEX idx_ratings_restaurant ON ratings (restaurant_id, created_at DESC);
CREATE INDEX idx_favorites_user ON favorites (user_id);

-- Notifications
CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE NOT is_read;
```

---

## Triggers

### `on_auth_user_created`
When a new user signs up via Supabase Auth, this trigger:
- Creates a `public.users` row
- Sets default role to `customer`
- Initializes `is_active = true`, `is_verified = false`

### `on_order_status_change`
When `orders.status` changes:
- Inserts a row in `order_events`
- Sends notification to relevant parties
- Updates `accepted_at`/`picked_up_at`/`delivered_at` timestamps

### `on_rating_insert`
When a `ratings` row is added:
- Updates `restaurants.rating` (rolling average)
- Updates `restaurants.review_count`

---

## Helper Functions

### `haversine_km(lat1, lng1, lat2, lng2)`
Returns distance in km between two coordinates.

### `find_nearby_drivers(lat, lng, radius_km)`
Returns active drivers within radius (uses geo index).

### `compute_earnings(order_id, driver_id)`
Returns driver earnings breakdown for an order (base + tip).

### `apply_coupon(code, order_subtotal)`
Validates and returns discount amount (or 0).

---

## Backup & Recovery

- **Automatic:** Supabase daily backups (7-day retention on Pro)
- **Manual:** `pg_dump $DATABASE_URL > backup.sql`
- **Point-in-time recovery:** Available on Pro plan

---

## Future Migrations

When applying future SQL changes:
1. Create file in `deploy/supabase/` with timestamp prefix
2. Test on staging database
3. Apply to production during low traffic
4. Verify with `node scripts/apply-migrations.js --check`
