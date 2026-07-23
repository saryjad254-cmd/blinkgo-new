# API Overview

The project has **78 API endpoints** organized by domain. All endpoints return JSON. All write operations (POST/PUT/PATCH/DELETE) are protected by CSRF validation in the global middleware.

**Base URL:** `https://your-domain.com/api`

---

## 🔐 Authentication Endpoints (`/api/auth/*`)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | ❌ | Email + password login |
| `/api/auth/logout` | POST | ✅ | Clear session |
| `/api/auth/register` | POST | ❌ | New customer registration |
| `/api/auth/me` | GET | ✅ | Get current user |
| `/api/auth/reset-password` | POST | ❌ | Request password reset |
| `/api/auth/verify` | POST | ❌ | Verify email OTP |
| `/api/auth/get-otp` | POST | ❌ | Get latest OTP (dev mode only) |
| `/api/auth/magic-link` | POST | ❌ | Request passwordless login link |
| `/api/auth/magic-link/verify` | GET | ❌ | Verify magic link token |
| `/api/auth/oauth` | GET | ❌ | Initiate Google/Apple OAuth |

**Rate limits:**
- Login: 20 requests / 15 min / IP+email
- Register: 10 requests / 15 min / IP
- Magic link: 5 requests / 1 hour / email
- Password reset: 5 requests / 15 min / IP

---

## 🛡️ Admin Endpoints (`/api/admin/*`)

All admin endpoints require `role=admin` or `role=manager`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/admins` | GET, POST | List/create admins |
| `/api/admin/analytics` | GET | System-wide analytics |
| `/api/admin/audit` | GET | Audit log |
| `/api/admin/config` | GET, PATCH | System config |
| `/api/admin/coupons` | GET, POST, PATCH | Coupon management |
| `/api/admin/daily-reset` | POST | Daily reset operations |
| `/api/admin/daily-reset/history` | GET | Reset history |
| `/api/admin/db-state` | GET | Database state (dev) |
| `/api/admin/driver-hours` | GET | Driver working hours |
| `/api/admin/drivers` | GET | List drivers |
| `/api/admin/finance` | GET | Financial reports |
| `/api/admin/geocode-orders` | POST | Batch geocode orders |
| `/api/admin/inspect-schema` | GET | DB schema (dev) |
| `/api/admin/list-orders` | GET | List all orders |
| `/api/admin/map` | GET | Live admin map data |
| `/api/admin/notifications` | POST | Send admin notifications |
| `/api/admin/operations` | GET | Operations dashboard |
| `/api/admin/operations/tools` | POST | Operations tools |
| `/api/admin/orders` | GET, PATCH | Manage all orders |
| `/api/admin/promotions` | GET, POST, PATCH | Promotions |
| `/api/admin/refunds` | POST | Process refunds |
| `/api/admin/restaurants` | GET, POST, PATCH | Manage restaurants |
| `/api/admin/stats` | GET | System stats |
| `/api/admin/users` | GET, PATCH | Manage users |

---

## 🚗 Driver Endpoints (`/api/driver/*`)

All driver endpoints require `role=driver`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/driver/active-order` | GET | Get current active order |
| `/api/driver/history` | GET | Driver's order history |
| `/api/driver/location` | POST | Update GPS location |
| `/api/driver/online` | POST | Toggle online status |
| `/api/driver/orders` | GET | List available orders |
| `/api/driver/orders/[id]/accept` | POST | Accept order |
| `/api/driver/orders/[id]/pickup` | POST | Mark as picked up |
| `/api/driver/orders/[id]/complete` | POST | Mark as delivered |
| `/api/driver/orders/[id]/reject` | POST | Reject order |
| `/api/driver/stats` | GET | Driver stats |
| `/api/driver/working-hours` | GET, POST | Working hours |

---

## 🏪 Restaurant Endpoints (`/api/restaurant/*`)

All restaurant endpoints require `role=restaurant_owner`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/restaurant/dashboard` | GET | Restaurant dashboard data |
| `/api/restaurant/busy-mode` | POST | Toggle busy mode |
| `/api/restaurant/pause` | POST | Pause orders |
| `/api/restaurant/working-hours` | GET, POST | Set working hours |

---

## 🍽️ Order Endpoints (`/api/orders/*`)

Customer-facing order management.

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/orders` | POST | Customer | Create new order |
| `/api/orders/[id]/cancel` | POST | Customer | Cancel order |
| `/api/orders/[id]/reorder` | POST | Customer | Reorder (1-click) |
| `/api/orders/recent` | GET | Customer | Recent completed orders |
| `/api/orders/status` | GET | Public | Order status by ID (for sharing) |
| `/api/orders/track` | GET | Customer | Real-time tracking data |
| `/api/orders/geocode` | POST | Customer | Geocode delivery address |

**Order creation includes:**
- Idempotency key support (`X-Idempotency-Key` header)
- Server-side distance validation (5km default)
- Server-authoritative pricing
- Smart error handling per status code

---

## 🔍 Search & Discovery (`/api/search`, `/api/products/*`)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/search` | GET | Public | Universal search (restaurants + products) |
| `/api/products/bestsellers` | GET | Public | Top-selling products |
| `/api/products/recent` | GET | Customer | Recently viewed products |
| `/api/products/manage` | GET, POST, PATCH, DELETE | Restaurant | Manage menu items |

**Search supports:**
- Full-text query
- Filters: cuisine, category, min_rating, max_price, badge, type, free_delivery, open_now, max_delivery_time
- Sort: recommended, rating, bestseller, price, newest
- Returns distance from user location

---

## 💳 Payments (`/api/stripe/*`)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/stripe/create-payment-intent` | POST | Customer | Create Stripe Payment Intent |
| `/api/stripe/status` | GET | Customer | Check payment status |
| `/api/stripe/webhook` | POST | Stripe | Receive Stripe webhooks |

---

## ⭐ Social & Engagement

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/favorites` | GET | Customer | List favorites |
| `/api/favorites/toggle` | POST | Customer | Add/remove favorite |
| `/api/ratings` | GET, POST | Customer | Submit and view ratings |
| `/api/notifications` | GET | Customer | List notifications |
| `/api/referrals` | GET, POST | Customer | Referral program |
| `/api/share-links` | GET, POST | Customer | Generate share links |

---

## 🎁 Loyalty & Coupons

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/loyalty` | GET | Customer | Loyalty points & tier |
| `/api/loyalty/redeem` | POST | Customer | Redeem points |
| `/api/coupons` | GET | Public | List available coupons |
| `/api/coupons/validate` | POST | Customer | Validate coupon code |

---

## 🗺️ Maps & Geocoding

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/geocode` | GET | Public | Geocode address (Nominatim) |
| `/api/maps/geocode` | GET | Public | Google Geocoding wrapper |
| `/api/addresses` | GET, POST, PATCH, DELETE | Customer | Manage saved addresses |

---

## 🔔 Push Notifications

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/push/subscribe` | POST | Customer | Subscribe to push notifications |

---

## 🏥 Health

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | Public | Service health check |

---

## 📐 Common Patterns

### Standard Response Shape

**Success:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "statusCode": 400
  }
}
```

### Authentication

Authenticated requests require a valid Supabase session cookie (`sb-{ref}-auth-token`). The middleware auto-refreshes sessions.

### CSRF Protection

All `POST`, `PUT`, `PATCH`, `DELETE` requests require:
- `Origin` header matching allowed origins
- `Content-Type: application/json`

The middleware blocks mismatched requests with 403.

### Idempotency

State-changing operations (e.g., order creation) support the `X-Idempotency-Key` header (8-255 chars). Same key + same body = same response within 24h.

### Rate Limiting

All auth endpoints are rate-limited. See specific endpoint docs for limits.

### Authorization Levels

| Role | Access |
|------|--------|
| `anon` | Public endpoints only |
| `customer` | Customer endpoints + public |
| `driver` | Driver + public |
| `restaurant_owner` | Restaurant + public |
| `admin` / `manager` | All endpoints |

### Pagination

List endpoints support:
- `?limit=N` (default 20, max 100)
- `?offset=N` (default 0)
- Returns `{ data: [...], total: N, hasMore: bool }`

---

## 🔍 Endpoint Counts by Category

| Category | Count |
|----------|-------|
| Auth | 10 |
| Admin | 24 |
| Driver | 11 |
| Restaurant | 4 |
| Order | 7 |
| Search/Products | 4 |
| Payments | 3 |
| Social/Engagement | 6 |
| Loyalty/Coupons | 4 |
| Maps/Geocoding | 3 |
| Other | 2 |
| **Total** | **78** |
