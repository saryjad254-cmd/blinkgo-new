# API Documentation

All API routes follow a consistent envelope: `{ ok: true, data: ... }` or `{ ok: false, error: ... }`.

## Base URL

- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Authentication

Most endpoints require authentication via Supabase JWT in HTTP-only cookies. The cookie is set automatically after login.

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"demo@blinkgo.de","password":"DemoCustomer!2024"}' \
  -c cookies.txt

# Authenticated request
curl http://localhost:3000/api/auth/me \
  -b cookies.txt
```

## CSRF Protection

All POST/PUT/PATCH/DELETE requests must have a valid `Origin` header matching:
- `http://localhost:*` (development)
- Tunnel hosts: `*.loca.lt`, `*.ngrok.io`, `*.vercel.app`, etc.
- `NEXT_PUBLIC_APP_URL` (production)

## Rate Limiting

Per IP + identifier (in-memory):
| Endpoint | Limit |
|----------|-------|
| `/api/auth/login` | 20 / 15min |
| `/api/auth/register` | 10 / 15min |
| `/api/auth/reset-password` | 10 / 15min |
| `/api/auth/verify-otp` | 10 / 15min |
| `/api/auth/resend-otp` | 3 / 5min |
| `/api/contact` | 3 / 1min |

When exceeded, returns 429 with `Retry-After` header.

---

## Authentication Endpoints

### `POST /api/auth/login`
Login with email + password.

**Body:**
```json
{ "email": "demo@blinkgo.de", "password": "DemoCustomer!2024" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "role": "customer" },
    "name": "Demo Customer",
    "role": "customer",
    "redirect": "/search"
  }
}
```

**Errors:** 401 (invalid creds), 429 (rate limit)

### `POST /api/auth/register`
Register a new customer account.

**Body:**
```json
{
  "email": "new@example.com",
  "password": "SecureP@ss123",
  "name": "New User",
  "phone": "+49123456789"
}
```

**Response 200:** `{ ok: true, data: { user, redirect: "/search" } }`

**Errors:** 400 (validation), 409 (email exists), 429 (rate limit)

### `POST /api/auth/logout`
Sign out and clear session cookies.

**Response 200:** `{ ok: true, loggedOut: true }`

### `GET /api/auth/me`
Get current authenticated user.

**Response 200:**
```json
{ "ok": true, "user": { "id", "email", "role", "name" }, "profile": {...} }
```

**Errors:** 401 (not authenticated)

### `POST /api/auth/verify-otp`
Verify email OTP code.

**Body:** `{ "email": "...", "code": "123456" }`

### `POST /api/auth/resend-otp`
Resend OTP code.

**Body:** `{ "email": "..." }`

### `POST /api/auth/reset-password`
Request password reset email.

**Body:** `{ "email": "..." }`

---

## Customer Endpoints

### `GET /api/search?lat=&lng=&cuisine=&sort=`
Search restaurants by location, cuisine, or sort.

**Query params:**
- `lat`, `lng` — User location (for distance)
- `cuisine` — Filter by cuisine type
- `sort` — `recommended` | `rating` | `distance` | `priceAsc` | `priceDesc`
- `q` — Free text search

**Response:**
```json
{
  "ok": true,
  "data": {
    "restaurants": [
      {
        "id": "uuid",
        "name": "Restaurant Name",
        "cuisine": "italian",
        "rating": 4.5,
        "delivery_fee": 2.99,
        "distance_km": 1.2,
        "eta_min": 25
      }
    ]
  }
}
```

### `GET /api/products/bestsellers?restaurant_id=`
Get bestseller products for a restaurant.

### `GET /api/restaurants/[id]`
Get restaurant details.

### `POST /api/orders`
Create a new order.

**Body:**
```json
{
  "restaurant_id": "uuid",
  "items": [{ "product_id": "uuid", "quantity": 2, "extras": [...] }],
  "delivery_address": { "address": "...", "lat": 50.7374, "lng": 7.0982 },
  "payment_method": "cash" | "card" | "online",
  "tip": 3.00,
  "coupon_code": "WELCOME10",
  "notes": "Extra napkins"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "BLG20260714...",
      "subtotal": 25.00,
      "delivery_fee": 2.99,
      "tip": 3.00,
      "total": 32.00,
      "status": "pending"
    }
  }
}
```

**Tip:** Clamped to [0, 500].

### `GET /api/orders?status=&limit=&offset=`
List orders for current user.

### `GET /api/orders/[id]`
Get order details.

### `GET /api/orders/[id]/track`
Get order tracking events (real-time status).

### `POST /api/orders/[id]/cancel`
Cancel an order (if status permits).

### `POST /api/orders/[id]/reorder`
Add all items from a past order to cart.

### `GET /api/favorites`
List favorited restaurants.

### `POST /api/favorites`
Add a restaurant to favorites.

**Body:** `{ "restaurant_id": "uuid" }`

### `DELETE /api/favorites/[id]`
Remove a favorite.

### `GET /api/addresses`
List saved addresses.

### `POST /api/addresses`
Add a new address.

**Body:**
```json
{
  "label": "Home",
  "address": "...",
  "lat": 50.7374,
  "lng": 7.0982,
  "is_default": true
}
```

### `GET /api/notifications`
List user notifications.

### `GET /api/coupons?code=`
Validate a coupon code.

### `GET /api/loyalty/balance`
Get current loyalty points balance.

### `GET /api/referrals/code`
Get user's referral code.

---

## Driver Endpoints

### `POST /api/driver/online`
Toggle driver online status.

**Body:** `{ "is_online": true }`

**Response:**
```json
{
  "ok": true,
  "is_online": true,
  "changed_by": "driver",
  "auto_assigned_order_id": "uuid" | null
}
```

### `POST /api/driver/location`
Update driver GPS position.

**Body:**
```json
{
  "latitude": 50.7374,
  "longitude": 7.0982,
  "heading": 90,
  "speed": 30,
  "accuracy": 5,
  "active_order_id": "uuid" // optional, for live tracking
}
```

### `GET /api/driver/active-order`
Get the driver's currently active order.

### `GET /api/driver/orders?status=`
List driver's orders.

### `GET /api/driver/orders/[id]`
Get order details (driver view).

### `POST /api/driver/orders/[id]/accept`
Accept an available order.

### `POST /api/driver/orders/[id]/reject`
Reject an offered order.

### `POST /api/driver/orders/[id]/pickup`
Mark order as picked up.

### `POST /api/driver/orders/[id]/complete`
Mark order as delivered.

**Body:** `{ "proof_image_url": "..." }` (optional)

### `GET /api/driver/stats?period=today|week|month|all`
Get driver statistics and earnings.

### `GET /api/driver/working-hours`
Get driver's working hours.

### `POST /api/driver/working-hours`
Update working hours (admin only).

---

## Restaurant Endpoints

### `GET /api/restaurant/dashboard`
Get restaurant dashboard data.

### `GET /api/restaurant/orders?status=`
List restaurant's orders.

### `PATCH /api/restaurant/orders/[id]`
Update order status.

**Body:** `{ "status": "confirmed" | "preparing" | "ready" | "cancelled" }`

### `GET /api/restaurant/menu`
Get restaurant's menu.

### `POST /api/restaurant/menu`
Add a product.

### `PATCH /api/restaurant/menu/[id]`
Update a product.

### `DELETE /api/restaurant/menu/[id]`
Delete a product.

### `GET /api/restaurant/settings`
Get restaurant settings.

### `PATCH /api/restaurant/settings`
Update restaurant settings.

---

## Admin Endpoints

All admin endpoints require `requireAdminRole('manager')` or higher.

### `GET /api/admin/stats`
Get system-wide statistics.

### `GET /api/admin/users?role=&search=`
List users.

### `PATCH /api/admin/users/[id]`
Update user (activate, deactivate, change role).

### `GET /api/admin/orders?status=&date_from=&date_to=`
List all orders with filters.

### `GET /api/admin/finance?period=`
Get financial reports.

### `GET /api/admin/audit?limit=`
Get audit log entries.

### `POST /api/admin/daily-reset`
Reset daily statistics (archives orders).

### `POST /api/admin/notifications/broadcast`
Send a broadcast notification to all users.

**Body:**
```json
{
  "title": "...",
  "body": "...",
  "type": "info" | "warning" | "promo",
  "target_audience": "all" | "customers" | "drivers" | "restaurants"
}
```

### `POST /api/admin/coupons`
Create a coupon.

### `POST /api/admin/drivers`
Create a driver account.

### `POST /api/admin/restaurants`
Create a restaurant account.

---

## Maps Endpoints

### `GET /api/maps/geocode?address=`
Geocode an address to coordinates.

**Response:**
```json
{
  "ok": true,
  "data": {
    "lat": 50.7374,
    "lng": 7.0982,
    "formatted_address": "...",
    "provider": "google" | "nominatim" | "fallback"
  }
}
```

### `GET /api/maps/reverse-geocode?lat=&lng=`
Reverse geocode coordinates to address.

### `GET /api/maps/distance?from_lat=&from_lng=&to_lat=&to_lng=`
Get distance and ETA between two points.

---

## Stripe Endpoints

### `POST /api/stripe/create-payment-intent`
Create a Stripe payment intent for an order.

**Body:** `{ "order_id": "uuid" }`

### `POST /api/stripe/webhook`
Stripe webhook receiver. Verifies signature.

Handles: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.

---

## Public Endpoints

### `GET /api/health`
Health check endpoint.

**Response:** `{ "ok": true, "status": "healthy" }`

### `GET /api/share-links/[token]`
Resolve a public share link (e.g., for order sharing).

### `GET /api/orders/track/[orderNumber]`
Public order tracking (no auth required, returns limited info).

---

## Webhooks

### `POST /api/stripe/webhook`
Stripe sends events here. Signature is verified using `STRIPE_WEBHOOK_SECRET`.

Events handled:
- `payment_intent.succeeded` → Mark order as paid
- `payment_intent.payment_failed` → Notify customer
- `charge.refunded` → Mark order as refunded

---

## Error Codes

All errors return `{ ok: false, error: { code, message } }` or `{ ok: false, error: "CODE" }`.

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource missing |
| `CONFLICT` | 409 | State conflict (e.g., duplicate) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | DB error |
| `EXTERNAL_SERVICE_ERROR` | 502 | Third-party failure |
| `CSRF` | 403 | Origin not allowed |
| `METHOD_NOT_ALLOWED` | 405 | Wrong HTTP method |

---

## Versioning

API is currently unversioned (under `/api/`). All endpoints are stable.

Breaking changes will be versioned under `/api/v2/` with deprecation notice on v1.

---

## Performance Notes

- Most read endpoints are cached (30s for search, 60s for products)
- Mutations invalidate relevant cache keys
- Stripe webhooks are async (return 200 immediately)
- Driver location updates are throttled to 1/sec
