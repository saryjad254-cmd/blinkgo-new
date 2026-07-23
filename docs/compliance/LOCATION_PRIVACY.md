# Location Privacy Audit

**Status:** DRAFT — to be reviewed by a Datenschutzberater / DSB before commercial launch.

This document audits the complete location-tracking lifecycle in BlinkGo:
driver live-location, customer delivery-address, restaurant location, and
the realtime channel used to share them.

---

## 1. Driver live location

### What we collect

- `driver_status.latitude`, `driver_status.longitude`, `driver_status.updated_at`
- `orders.driver_latitude`, `orders.driver_longitude`, `orders.driver_bearing`
  (set while a delivery is active)
- `order_tracking_events` — one row per location fix during active delivery
- `auth.users.user_metadata.last_location_*` — fallback for client-side tracking

### When we collect

- **Only when the driver is in `is_online = true` state** AND has an active order
- Driver must explicitly toggle online via `POST /api/driver/online`
- `/api/driver/location` does NOT change `is_online` (commented in code)
- Location updates throttled: minimum 5m distance OR 2s time delta
  (`MIN_DISTANCE_DELTA_METERS = 5`, `MIN_TIME_DELTA_MS = 2000`)

### When we STOP collecting

- Driver toggles offline via `POST /api/driver/online { is_online: false }`
- Order reaches terminal state (delivered, cancelled)
- Driver inactive for >X minutes → auto-set offline (verify in `online` route)

### Retention

- `driver_status` row: updated in-place, retains only the latest position
- `orders.driver_*` columns: cleared after order completion (verify in
  completion route — `app/api/driver/orders/[id]/complete/route.ts`)
- `order_tracking_events` rows: TODO cleanup at 24h
  (in `RETENTION_MATRIX.md`)

### Realtime channel

- Supabase Realtime channel `order:{order_id}` — only:
  - The customer who placed the order
  - The assigned driver
  - The restaurant of the order
  - Admin (operator)
- See `app/api/orders/track/route.ts` for the channel authorization

### Tests for cross-user access (in `rbac-negative-test.js`)

- Unauthenticated access to `/api/driver/location` → 401
- Customer cannot POST `/api/driver/location` → 401
- Driver cannot view another driver's location (not exposed via any API)
- Customer cannot view an order they did not place via `/api/orders/track`

### Privacy-preserving design choices

- No background tracking while driver is offline
- Throttled updates (not every GPS fix is sent)
- Precision is full GPS accuracy (not deliberately degraded) — this is a
  **gap** to consider: we could round to 3 decimal places (~100m) for
  public display while keeping precise coordinates only on the server
- Driver is informed about tracking via the `online` toggle UX
  (verify in driver app UI)

### What we do NOT do

- No background location when offline
- No continuous tracking outside active delivery (only when accepted order)
- No sharing of driver location with third parties
- No use of location for marketing or advertising
- No retention of precise location beyond the active delivery window

---

## 2. Customer delivery address

### What we collect

- `orders.delivery_address` (text)
- `orders.customer_latitude`, `orders.customer_longitude`
- `orders.delivery_instructions` (optional)

### Who can see

- The assigned driver (via `/api/orders/track`)
- The restaurant (via `/api/restaurant/dashboard` or order detail)
- The customer themselves
- Admin (operator)

### What we do NOT do

- We do NOT include coordinates in any public URL
- We do NOT log coordinates in plain-text application logs
- We do NOT share with third parties
- We do NOT use for analytics

### Retention

- Address text: kept with order record (10 years per § 147 AO)
- Precise lat/lng: TODO — should be cleared at delivery completion,
  keeping only the address string for tax purposes

### Risks identified

- **GAP:** `customer_latitude` and `customer_longitude` are stored
  indefinitely with the order. Should be cleared after delivery for
  orders that do not need precise coordinates for billing/audit.
- **GAP:** Address autocomplete sends partial addresses to Google Maps.
  This is a US transfer. Verify DPA.

---

## 3. Restaurant location

### What we collect

- `restaurants.latitude`, `restaurants.longitude` (fixed, set by restaurant)

### Who can see

- Anyone (used for "restaurants near me" sort)
- Customer-facing search

### Privacy note

This is the restaurant's business address — typically not personally
identifiable beyond the business. Treated as business contact data
under DSGVO.

---

## 4. Customer-side tracking (for following driver)

### What we collect

- No customer tracking. The customer is the static reference point;
  only the driver moves.

### What the customer sees

- The driver's approximate position during their delivery
- Updated via Supabase Realtime

---

## 5. Geofencing and zone checks

### What we collect

- `lib/maps/distance.ts` (Haversine formula) for delivery radius check
- `lib/maps/zones.ts` for restricted areas
- These run server-side, do not expose user location externally

---

## 6. Test coverage

The following test files cover location privacy:

- `scripts/rbac-negative-test.js` — verifies driver-only endpoints
  reject non-driver access
- Manual E2E: customer can see assigned driver on track page,
  cannot see other drivers' locations
- Restaurant can see their own orders, not other restaurants'

### Tests to add (future work)

- [ ] Driver cannot view another driver's location via any API
- [ ] Customer cannot view another customer's active order
- [ ] Realtime channel rejects unauthorized subscribers
- [ ] After delivery, `order_tracking_events` rows are cleaned within 24h
- [ ] `customer_latitude` and `customer_longitude` are cleared at delivery
- [ ] Address autocomplete sends only minimum data to Google

---

## 7. Action items

| # | Action | Priority | Status |
|---|--------|----------|--------|
| 1 | Clear `customer_latitude`/`customer_longitude` after delivery | HIGH | TODO |
| 2 | Clear `order_tracking_events` after 24h | HIGH | TODO |
| 3 | Document tracking in driver-facing UI ("Standort wird erfasst") | MED | TODO |
| 4 | Round driver lat/lng for customer display to 3 decimals | LOW | TODO |
| 5 | Verify Google Maps DPA | HIGH | TODO |
| 6 | Add retention cleanup job for live-location | HIGH | TODO |
| 7 | Document precision in privacy policy | DONE | Phase 21 |

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Datenschutzberater / DSB | _____________ | _______ | ☐ Pending |
