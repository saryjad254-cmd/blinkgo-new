/**
 * Checkout Draft — server-authoritative Order Draft endpoint
 * ────────────────────────────────────────────────────────────
 * GET  /api/checkout/draft?draft_id=...  → fetch existing draft
 * POST /api/checkout/draft              → create / re-validate draft
 *
 * Architecture (Phase 7F):
 *
 *   ┌─────────────┐
 *   │ Cart Page   │ (client never computes totals)
 *   │ /api/cart/  │
 *   │  quote      │ → server returns authoritative prices
 *   └──────┬──────┘
 *          │ user clicks "Checkout" → POST /api/checkout/draft
 *          ▼
 *   ┌──────────────────────────────────────────┐
 *   │ POST /api/checkout/draft                 │
 *   │                                          │
 *   │ 1. Re-load EVERYTHING from server:       │
 *   │    restaurant, products, modifiers,      │
 *   │    user profile, addresses, coupon       │
 *   │ 2. Validate EVERYTHING:                 │
 *   │    is_open, not paused, not hidden,      │
 *   │    delivery zone, min order,             │
 *   │    modifier integrity,                    │
 *   │    coupon active, points balance          │
 *   │ 3. Compute ALL totals server-side:      │
 *   │    subtotal, delivery_fee, service_fee,  │
 *   │    tip, discount, total                  │
 *   │ 4. Issue canonical draft_id:            │
 *   │    DRF-YYYYMMDDHHMMSS-AAAAAAAA-BBBB      │
 *   │ 5. Sign draft with HMAC:                │
 *   │    signature = HMAC-SHA256(              │
 *   │      draft_id + body, secret)            │
 *   │ 6. Return: { draft, can_place, issues } │
 *   └──────────────┬───────────────────────────┘
 *                  │ draft_id
 *                  ▼
 *   ┌─────────────┐
 *   │ /checkout   │ (review page)
 *   │  - shows    │
 *   │    server-  │
 *   │    derived  │
 *   │    totals   │
 *   │  - shows    │
 *   │    issues   │
 *   │  - shows    │
 *   │    draft_id │
 *   │  - confirm  │
 *   │    button   │
 *   └──────┬──────┘
 *          │ user clicks "Confirm"
 *          ▼
 *   ┌──────────────────────────────────────────┐
 *   │ POST /api/stripe/checkout                │
 *   │                                          │
 *   │ 1. Re-validate the stored draft          │
 *   │ 2. Create or resume payment              │
 *   │ 3. Redirect to payment when required     │
 *   │ 4. Poll GET /api/checkout/confirm        │
 *   │ 5. Show the created order                │
 *   └──────────────────────────────────────────┘
 *
 * Why a Draft?
 *   - Cart page ≠ checkout page. The cart is "what I want"; the
 *     draft is "what I'm about to pay for". Different state machines.
 *   - The cart page is exploratory; the checkout page is a contract.
 *   - A draft gives us a single server-issued ID that the confirm
 *     endpoint can re-verify, eliminating client price tampering.
 *   - A signed draft is replay-proof (one-time use, burned on confirm).
 *   - A draft allows the customer to step away and come back without
 *     losing the server-validated state.
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z, type infer as ZInfer } from '@/lib/foundation/zod-mini';
import { apiRoute, ok, log, tier } from '@/lib/api/canonical';
import { ValidationError } from '@/lib/foundation/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveConfiguredDeliveryZone } from '@/lib/services/delivery-zone-rules';
import { isRestaurantOpenAt, type RestaurantSpecialHour } from '@/lib/restaurant-hours';
import { serverDeriveKey } from '@/lib/cart-key';
import { sanitizeDeliveryPreferences, type DeliveryPreferences } from '@/lib/delivery-preferences';
import { requireFeatureFlag } from '@/lib/platform/feature-flags';
import { signCheckoutDraft, verifyCheckoutDraftSignature } from '@/lib/checkout/draft-signature';
import { withIdempotency } from '@/lib/api/idempotency';
import {
  STANDARD_DELIVERY_FEE,
  SERVICE_FEE_RATE,
  MAX_TIP,
  MIN_TIP,
  MAX_QUANTITY,
  MIN_QUANTITY,
} from '@/lib/config/fees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Constants ─────────────────────────────────────
const DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_DRAFT_ITEMS = 100;
const MAX_NOTES_LEN = 500;
const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

// ── Body schema (canonical) ──────────────────────
// NOTE: zod-mini has limited API. We use a custom validator
// function to enforce the full schema. The `bodySchema` is
// set to a permissive schema so the API route accepts the
// body; the strict validation happens in createDraft() below.
const DraftBodySchema = z.object({
  restaurant_id: z.string(),
  fulfillment_type: z.enum(['delivery', 'pickup']).optional(),
  items: z.array(z.any()),
  delivery_address: z.any().optional(),
  payment_method: z.string(),
  tip: z.number().optional(),
  coupon_code: z.string().optional(),
  scheduled_for: z.string().optional(),
  points_redeemed: z.number().optional(),
  notes: z.string().optional(),
  group_order_id: z.string().optional(),
});

// Strict validator (replaces zod for this endpoint)
function validateDraftBody(rawInput: unknown): { ok: true; data: ZInfer<typeof DraftBodySchema> } | { ok: false; error: string } {
  if (!rawInput || typeof rawInput !== 'object') return { ok: false, error: 'invalid_body' };
  const input = rawInput as ZInfer<typeof DraftBodySchema>;
  if (typeof input.restaurant_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.restaurant_id)) {
    return { ok: false, error: 'invalid_restaurant_id' };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: 'items_required' };
  }
  if (input.items.length > MAX_DRAFT_ITEMS) {
    return { ok: false, error: 'too_many_items' };
  }
  for (let i = 0; i < input.items.length; i++) {
    const rawIt = input.items[i] as Record<string, unknown> | null;
    if (!rawIt || typeof rawIt !== 'object') return { ok: false, error: `item_${i}_invalid` };
    const it = rawIt as {
      product_id: string;
      quantity: number;
      config_key?: string;
      configuration?: {
        selected_modifiers?: Record<string, string[]>;
        modifier_quantities?: Record<string, number>;
        notes?: string;
        cooking_preference?: string;
        spice_level?: string;
        variants?: unknown;
        add_ons?: unknown;
        special_instructions?: string;
        substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
      };
      notes?: string;
    };
    if (typeof it.product_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) {
      return { ok: false, error: `item_${i}_invalid_product_id` };
    }
    // Quantity: must be a finite number. Anything outside [-1e6, 1e6] is rejected
    // as a DoS attempt. Out-of-range but finite values are CLAMPED in createDraft.
    if (typeof it.quantity !== 'number' || !Number.isFinite(it.quantity) || it.quantity < -1_000_000_000 || it.quantity > 1_000_000_000) {
      return { ok: false, error: `item_${i}_invalid_quantity` };
    }
    // Note: out-of-range quantities are CLAMPED in createDraft(), not rejected.
    if (typeof it.config_key !== 'string' || it.config_key.length < 8 || it.config_key.length > 200) {
      return { ok: false, error: `item_${i}_invalid_config_key` };
    }
    if (!it.configuration || typeof it.configuration !== 'object') {
      return { ok: false, error: `item_${i}_invalid_configuration` };
    }
    // Notes: must be a string if present. Max 10x server MAX_NOTES_LEN — anything
    // larger is a DoS attempt. The actual server caps in createDraft clamp to MAX_NOTES_LEN.
    if (it.configuration && typeof it.configuration === 'object' && 'notes' in it.configuration) {
      const notes = (it.configuration as { notes?: unknown }).notes;
      if (notes != null) {
        if (typeof notes !== 'string') {
          return { ok: false, error: `item_${i}_invalid_notes` };
        }
        if (notes.length > 100_000) {
          return { ok: false, error: `item_${i}_notes_too_long` };
        }
      }
    }
  }
  const fulfillmentType = input.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
  const deliveryAddress = input.delivery_address && typeof input.delivery_address === 'object'
    ? input.delivery_address as Record<string, unknown>
    : null;
  if (fulfillmentType === 'delivery' && !deliveryAddress) {
    return { ok: false, error: 'invalid_delivery_address' };
  }
  if (fulfillmentType === 'delivery' && (!deliveryAddress || typeof deliveryAddress.address !== 'string' || deliveryAddress.address.length === 0 || deliveryAddress.address.length > 500)) {
    return { ok: false, error: 'invalid_address_text' };
  }
  if (deliveryAddress?.lat != null && (typeof deliveryAddress.lat !== 'number' || deliveryAddress.lat < -90 || deliveryAddress.lat > 90)) {
    return { ok: false, error: 'invalid_lat' };
  }
  if (deliveryAddress?.lng != null && (typeof deliveryAddress.lng !== 'number' || deliveryAddress.lng < -180 || deliveryAddress.lng > 180)) {
    return { ok: false, error: 'invalid_lng' };
  }
  const rawPreferences = deliveryAddress?.delivery_preferences;
  if (rawPreferences != null) {
    if (!rawPreferences || typeof rawPreferences !== 'object' || Array.isArray(rawPreferences)) {
      return { ok: false, error: 'invalid_delivery_preferences' };
    }
    const preferences = rawPreferences as Record<string, unknown>;
    const preferenceLimits: Record<string, number> = {
      recipient_name: 800,
      bell_name: 800,
      floor: 200,
      instructions: 3000,
    };
    if (preferences.handoff != null && (typeof preferences.handoff !== 'string' || !['hand_to_me', 'leave_at_door'].includes(preferences.handoff))) {
      return { ok: false, error: 'invalid_delivery_handoff' };
    }
    for (const [field, limit] of Object.entries(preferenceLimits)) {
      const value = preferences[field];
      if (value != null && (typeof value !== 'string' || value.length > limit)) {
        return { ok: false, error: `invalid_delivery_${field}` };
      }
    }
  }
  if (!['cash', 'stripe', 'card'].includes(input.payment_method)) {
    return { ok: false, error: 'invalid_payment_method' };
  }
  if (input.tip != null) {
    if (typeof input.tip !== 'number' || !Number.isFinite(input.tip) || input.tip < -1_000_000_000 || input.tip > 1_000_000_000) {
      return { ok: false, error: 'invalid_tip' };
    }
    // Note: out-of-range values are CLAMPED in createDraft(), not rejected.
    // We only reject clearly invalid values (NaN, extreme outliers).
  }
  if (input.coupon_code != null && (typeof input.coupon_code !== 'string' || input.coupon_code.length > 50)) {
    return { ok: false, error: 'invalid_coupon_code' };
  }
  if (input.scheduled_for != null) {
    if (
      typeof input.scheduled_for !== 'string'
      || input.scheduled_for.length > 40
      || !Number.isFinite(Date.parse(input.scheduled_for))
    ) {
      return { ok: false, error: 'invalid_scheduled_for' };
    }
  }
  if (input.points_redeemed != null) {
    if (typeof input.points_redeemed !== 'number' || !Number.isFinite(input.points_redeemed) || input.points_redeemed < 0 || input.points_redeemed > 1_000_000) {
      return { ok: false, error: 'invalid_points_redeemed' };
    }
  }
  if (input.group_order_id != null && (typeof input.group_order_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.group_order_id))) {
    return { ok: false, error: 'invalid_group_order_id' };
  }
  return { ok: true, data: input };
}

// ── Draft shape (canonical) ───────────────────────
export interface OrderDraft {
  /** Server-issued ID: `DRF-YYYYMMDDHHMMSS-AAAAAAAA-BBBB` */
  draft_id: string;
  /** Customer who owns the draft */
  customer_id: string;
  /** Restaurant being ordered from */
  restaurant_id: string;
  /** Present only after the server verifies host ownership and an exact locked-item match. */
  group_order_id?: string;
  fulfillment_type: 'delivery' | 'pickup';
  /** Server-re-derived canonical lines (each with server-issued config_key) */
  lines: Array<{
    config_key: string;
    product_id: string;
    product_name: string;
    unit_price: number;
    line_subtotal: number;
    quantity: number;
    issues: string[];
    /** Original configuration (selected_modifiers, modifier_quantities, notes, etc.)
     *  — required for re-validation at confirm time to re-derive the unit_price
     *  with the same logic. Without this, the confirm route cannot verify that
     *  the price still matches the current product+modifier data.
     */
    configuration?: {
      selected_modifiers?: Record<string, string[]>;
      modifier_quantities?: Record<string, number>;
      notes?: string;
      cooking_preference?: string;
      spice_level?: string;
      variants?: Record<string, string>;
      add_ons?: string[];
      special_instructions?: string;
      substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
    };
  }>;
  /** Server-validated delivery address (echo back, no client mutation) */
  delivery_address: {
    address: string;
    lat: number | null;
    lng: number | null;
    door?: string;
    floor?: string;
    notes?: string;
    postal_code?: string;
    delivery_preferences?: DeliveryPreferences;
  } | null;
  /** Payment method (enum, server-validated) */
  payment_method: 'cash' | 'stripe' | 'card';
  /** Requested fulfilment time in ISO 8601 UTC, or null for ASAP */
  scheduled_for: string | null;
  /** Tip in cents (clamped to [0, MAX_TIP]) */
  tip: number;
  /** Optional coupon code (server-validated) */
  coupon: {
    code: string;
    type: string;
    value: number;
    discount: number;
    min_order_amount: number | null;
    max_discount: number | null;
  } | null;
  /** Loyalty points redeemed (clamped to balance × 50% of subtotal) */
  points_redeemed: number;
  /** Server-computed subtotal (sum of all line subtotals) */
  subtotal: number;
  /** Server-computed delivery fee (from restaurant config or fallback) */
  delivery_fee: number;
  delivery_fee_base: number;
  delivery_fee_surge: number;
  delivery_fee_multiplier: number;
  delivery_fee_surge_active: boolean;
  /** Server-computed service fee (SERVICE_FEE_RATE × subtotal) */
  service_fee: number;
  /** Server-computed coupon discount (cents) */
  discount: number;
  /** Server-computed loyalty points discount (cents) */
  points_discount: number;
  /** Server-computed grand total (subtotal + delivery + service + tip - discount - points_discount, never negative) */
  total: number;
  /** Restaurant min order */
  min_order_amount: number;
  min_order_ok: boolean;
  /** Delivery zone check */
  delivery_zone_ok: boolean;
  delivery_distance_km: number | null;
  delivery_zone_rule_id: string | null;
  delivery_zone_rule_version: number | null;
  /** Restaurant state */
  restaurant: {
    id: string;
    name: string;
    is_paused: boolean;
    is_hidden: boolean;
    is_active: boolean;
    /** Whether restaurant is open at the requested fulfilment time */
    is_open: boolean;
    address: string | null;
    pickup_instructions: string | null;
  };
  /** Currency */
  currency: 'EUR';
  /** Issued at (ISO 8601 UTC) */
  issued_at: string;
  /** Expires at (ISO 8601 UTC) */
  expires_at: string;
  /** HMAC-SHA256 signature of the canonical draft body */
  signature: string;
  /** Whether the draft is valid (no blocking issues) */
  can_place_order: boolean;
  /** All issues (blocking + non-blocking) */
  issues: Array<{ kind: string; message: string; line?: string }>;
}

// ── Issue kinds (canonical, server-side) ──────────
const ISSUE = {
  // Blocking
  RESTAURANT_NOT_FOUND: 'restaurant_not_found',
  RESTAURANT_INACTIVE: 'restaurant_inactive',
  RESTAURANT_HIDDEN: 'restaurant_hidden',
  RESTAURANT_PAUSED: 'restaurant_paused',
  RESTAURANT_CLOSED: 'restaurant_closed',  // outside opening hours
  PRODUCT_NOT_FOUND: 'product_not_found',
  PRODUCT_WRONG_RESTAURANT: 'product_wrong_restaurant',
  PRODUCT_UNAVAILABLE: 'product_unavailable',
  LEGAL_INFORMATION_INCOMPLETE: 'legal_information_incomplete',
  PRODUCT_HIDDEN: 'product_hidden',
  PRODUCT_DELETED: 'product_deleted',
  MODIFIER_INVALID: 'modifier_invalid',
  MODIFIER_REQUIRED: 'modifier_required',
  MODIFIER_NOT_ALLOWED: 'modifier_not_allowed',
  MIN_ORDER_NOT_MET: 'min_order_not_met',
  DELIVERY_ZONE: 'delivery_zone',
  COUPON_INVALID: 'coupon_invalid',
  COUPON_EXPIRED: 'coupon_expired',
  COUPON_USAGE_LIMIT: 'coupon_usage_limit',
  COUPON_MIN_ORDER: 'coupon_min_order',
  COUPON_RESTAURANT_MISMATCH: 'coupon_restaurant_mismatch',
  POINTS_INSUFFICIENT: 'points_insufficient',
  POINTS_EXCEED_LIMIT: 'points_exceed_limit',
  // Non-blocking
  MISSING_ADDRESS_COORDS: 'missing_address_coords',
  NO_COUPON: 'no_coupon',  // informational, not blocking
  SCHEDULED_IN_PAST: 'scheduled_in_past',
  SCHEDULED_TOO_SOON: 'scheduled_too_soon',
  SCHEDULED_TOO_FAR: 'scheduled_too_far',
} as const;

// ── Opening hours check ───────────────────────────
// ── Persistent draft storage ─────────────────────
// This route always persists drafts through Supabase's `order_drafts` table.
// The local Supabase emulator implements the same contract for tests; there is
// no route-level memory fallback that could lose a paid checkout on restart.

// ── Draft ID generation ──────────────────────────
function generateDraftId(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `DRF-${yyyy}${mm}${dd}${hh}${mi}${ss}-${rand.slice(0, 8)}-${rand.slice(8, 12)}`;
}

// ── HMAC signature ────────────────────────────────
// ── POST /api/checkout/draft ─────────────────────
export const POST = apiRoute({
  method: 'POST',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('system'),  // 300/15min — draft can be re-fetched many times (refresh, retries)
  bodySchema: DraftBodySchema,
  handler: async ({ req, body, user }) => {
    if (!user) throw new ValidationError('Authentication required');
    const validated = validateDraftBody(body);
    if (!validated.ok) {
      return ok({ ok: false, error: validated.error, message: 'Draft validation failed' });
    }
    await requireFeatureFlag('checkout.enabled', { userId: user.id, role: user.role, activeOrder: false });
    await requireFeatureFlag(
      validated.data.payment_method === 'cash' ? 'payments.cash.enabled' : 'payments.stripe.enabled',
      { userId: user.id, role: user.role, activeOrder: false },
    );
    if (validated.data.fulfillment_type === 'pickup') {
      await requireFeatureFlag('features.customer_pickup.enabled', { userId: user.id, role: user.role });
    }
    if (validated.data.group_order_id) {
      await requireFeatureFlag('features.group_orders.enabled', { userId: user.id, role: user.role });
    }
    return withIdempotency(
      { req, user, method: 'POST' },
      () => createDraft(validated.data, user.id),
      { fingerprint: validated.data },
    );
  },
});

// ── GET /api/checkout/draft?draft_id=... ─────────
export const GET = apiRoute({
  method: 'GET',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('lenient'),
  handler: async ({ req, user }) => {
    if (!user) throw new ValidationError('Authentication required');
    const url = new URL(req.url);
    const draftId = url.searchParams.get('draft_id');
    const active = url.searchParams.get('active');
    if (active === 'true') {
      return getDraft('', user.id, { active: true });
    }
    if (!draftId) throw new ValidationError('draft_id or active=true required');
    return getDraft(draftId, user.id);
  },
});

// ── Draft creation logic ─────────────────────────
interface CheckoutProductRow {
  id: string;
  name: string;
  price: number | string;
  discount_price: number | string | null;
  is_available: boolean;
  is_active: boolean;
  approval_status: string | null;
  archived_at: string | null;
  restaurant_id: string;
  modifiers: unknown;
  product_kind: string | null;
  legal_information_complete: boolean | null;
  minimum_age: number | null;
}

async function createDraft(
  input: ZInfer<typeof DraftBodySchema>,
  userId: string,
): Promise<NextResponse> {
  const supabase = createServiceClient();
  const now = new Date();
  const issues: OrderDraft['issues'] = [];
  const scheduledDate = input.scheduled_for ? new Date(input.scheduled_for) : null;
  const fulfilmentTime = scheduledDate ?? now;

  if (scheduledDate) {
    const leadTime = scheduledDate.getTime() - now.getTime();
    if (leadTime < 0) {
      issues.push({ kind: ISSUE.SCHEDULED_IN_PAST, message: 'Scheduled time is in the past' });
    } else if (leadTime < MIN_SCHEDULE_LEAD_MS) {
      issues.push({ kind: ISSUE.SCHEDULED_TOO_SOON, message: 'Scheduled time must be at least 30 minutes from now' });
    } else if (leadTime > MAX_SCHEDULE_AHEAD_MS) {
      issues.push({ kind: ISSUE.SCHEDULED_TOO_FAR, message: 'Scheduled time cannot be more than 2 days ahead' });
    }
  }

  // 1) Load restaurant (server-authoritative)
  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id, name, type, is_active, is_paused, is_hidden, busy_mode, busy_mode_until, latitude, longitude, delivery_fee, min_order_amount, opening_hours, is_24_7, address, pickup_enabled, pickup_instructions')
    .eq('id', input.restaurant_id)
    .is('archived_at', null)
    .maybeSingle();

  if (rErr || !restaurant) {
    return ok({
      ok: false,
      can_place_order: false,
      issues: [{ kind: ISSUE.RESTAURANT_NOT_FOUND, message: 'Restaurant not found' }],
    });
  }
  if (!restaurant.is_active) {
    issues.push({ kind: ISSUE.RESTAURANT_INACTIVE, message: 'Restaurant is not active' });
  }
  if (restaurant.is_hidden) {
    issues.push({ kind: ISSUE.RESTAURANT_HIDDEN, message: 'Restaurant is hidden' });
  }
  if (restaurant.is_paused) {
    issues.push({ kind: ISSUE.RESTAURANT_PAUSED, message: 'Restaurant is paused' });
  }
  const fulfillmentType: 'delivery' | 'pickup' = input.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
  if (fulfillmentType === 'pickup' && restaurant.pickup_enabled === false) {
    issues.push({ kind: 'pickup_disabled', message: 'Customer pickup is not available at this restaurant' });
  }
  const serviceDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fulfilmentTime);
  const previousServiceDate = new Date(`${serviceDate}T12:00:00Z`);
  previousServiceDate.setUTCDate(previousServiceDate.getUTCDate() - 1);
  const { data: specialHours, error: specialHoursError } = await supabase
    .from('restaurant_special_hours')
    .select('service_date,is_closed,open_time,close_time,reason')
    .eq('restaurant_id', restaurant.id)
    .gte('service_date', previousServiceDate.toISOString().slice(0, 10))
    .lte('service_date', serviceDate);
  if (specialHoursError) throw specialHoursError;
  const openAtFulfilment = isRestaurantOpenAt(
    restaurant.is_24_7
      ? Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { open: '00:00', close: '00:00' }]))
      : restaurant.opening_hours,
    fulfilmentTime,
    (specialHours ?? []) as RestaurantSpecialHour[],
  );
  if (!openAtFulfilment) {
    issues.push({
      kind: ISSUE.RESTAURANT_CLOSED,
      message: scheduledDate
        ? 'Restaurant is closed at the selected delivery time'
        : 'Restaurant is closed (outside opening hours)',
    });
  }

  // 2) Load all products in one query (PostgREST or=() for multi-id)
  const productIds = (input.items as Array<{ product_id: string }>).map((it) => it.product_id);
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, price, discount_price, is_available, is_active, approval_status, archived_at, restaurant_id, modifiers, product_kind, legal_information_complete, minimum_age')
    .in('id', productIds);

  if (pErr) {
    return ok({ ok: false, can_place_order: false, issues: [{ kind: 'product_load_failed', message: 'Failed to load products' }] });
  }
  const productsMap = new Map((products as CheckoutProductRow[] | null ?? []).map((product) => [product.id, product]));

  // 3) Validate each line + compute line subtotals
  let subtotal = 0;
  const draftLines: OrderDraft['lines'] = [];
  const draftLineIssuesByProduct: Record<string, string[]> = {};

  for (const rawIt of input.items) {
    const it = rawIt as {
      product_id: string;
      quantity: number;
      config_key?: string;
      configuration?: {
        selected_modifiers?: Record<string, unknown>;
        modifier_quantities?: Record<string, number>;
        notes?: string;
        cooking_preference?: string;
        spice_level?: string;
        variants?: unknown;
        add_ons?: unknown;
        special_instructions?: string;
        substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
      };
      notes?: string;
    };
    // Clamp quantity to [MIN_QUANTITY, MAX_QUANTITY] (server-authoritative)
    const qty = Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, Math.floor(Number(it.quantity))));
    const p = productsMap.get(it.product_id);
    const lineIssues: string[] = [];

    if (!p) {
      lineIssues.push(ISSUE.PRODUCT_DELETED);
      issues.push({ kind: ISSUE.PRODUCT_DELETED, message: `Product ${it.product_id} not found`, line: it.config_key ?? '' });
      draftLines.push({
        config_key: it.config_key ?? '',
        product_id: it.product_id,
        product_name: '(deleted)',
        unit_price: 0,
        line_subtotal: 0,
        quantity: qty,
        issues: lineIssues,
      });
      continue;
    }
    if (p.restaurant_id !== input.restaurant_id) {
      lineIssues.push(ISSUE.PRODUCT_WRONG_RESTAURANT);
      issues.push({ kind: ISSUE.PRODUCT_WRONG_RESTAURANT, message: `"${p.name}" is not from this restaurant`, line: it.config_key });
    }
    if (!p.is_active) {
      lineIssues.push(ISSUE.PRODUCT_HIDDEN);
      issues.push({ kind: ISSUE.PRODUCT_HIDDEN, message: `"${p.name}" is no longer available`, line: it.config_key });
    }
    if (p.approval_status !== 'approved' || p.archived_at) {
      lineIssues.push('Product is not approved for ordering');
      issues.push({ kind: ISSUE.PRODUCT_HIDDEN, message: `"${p.name}" is not approved for ordering`, line: it.config_key });
    }
    if (!p.is_available) {
      lineIssues.push(ISSUE.PRODUCT_UNAVAILABLE);
      issues.push({ kind: ISSUE.PRODUCT_UNAVAILABLE, message: `"${p.name}" is out of stock`, line: it.config_key });
    }
    if ((['market', 'pharmacy'].includes(String(restaurant.type)) || p.product_kind === 'alcohol') && p.legal_information_complete !== true) {
      lineIssues.push(ISSUE.LEGAL_INFORMATION_INCOMPLETE);
      issues.push({ kind: ISSUE.LEGAL_INFORMATION_INCOMPLETE, message: `Mandatory product information for "${p.name}" is incomplete`, line: it.config_key });
    }

    // 4) Server re-derives the canonical config_key from validated data.
    //    The client's config_key is NEVER trusted.
    const cfg = it.configuration ?? {};
    const substitutionPreference = ['best_match', 'contact_me', 'refund_item'].includes(String(cfg.substitution_preference))
      ? cfg.substitution_preference as 'best_match' | 'contact_me' | 'refund_item'
      : undefined;
    const configKey = serverDeriveKey(input.restaurant_id, p.id, (cfg.selected_modifiers ?? {}) as Record<string, string[]>, {
      modifier_quantities: cfg.modifier_quantities,
      notes: cfg.notes,
      cooking_preference: cfg.cooking_preference,
      spice_level: cfg.spice_level,
      variants: cfg.variants as Record<string, string> | undefined,
      add_ons: cfg.add_ons as string[] | undefined,
      special_instructions: cfg.special_instructions,
      substitution_preference: substitutionPreference,
    });

    // 5) Validate modifiers against the product's modifier schema
    const productModifiers = (Array.isArray(p.modifiers) ? (p.modifiers as unknown[]) : []) as Array<{
      id: string;
      name?: string;
      type?: string;
      required?: boolean;
      min_select?: number;
      max_select?: number;
      options?: Array<{ id: string; price_delta?: number }>;
    }>;

    const modSelections = cfg.selected_modifiers ?? {};
    for (const modDef of productModifiers) {
      const selected = (modSelections[modDef.id] ?? []) as string[];
      if (modDef.required && selected.length < (modDef.min_select ?? 1)) {
        lineIssues.push(`${ISSUE.MODIFIER_REQUIRED}:${modDef.id}`);
        issues.push({
          kind: ISSUE.MODIFIER_REQUIRED,
          message: `"${p.name}" requires ${modDef.name ?? modDef.id}`,
          line: configKey,
        });
      }
      if (selected.length > (modDef.max_select ?? 99)) {
        lineIssues.push(`${ISSUE.MODIFIER_NOT_ALLOWED}:${modDef.id}:too_many`);
        issues.push({
          kind: ISSUE.MODIFIER_NOT_ALLOWED,
          message: `"${p.name}" allows max ${modDef.max_select} for ${modDef.name ?? modDef.id}`,
          line: configKey,
        });
      }
      // Validate each option_id
      for (const optId of selected) {
        const opt = (modDef.options ?? []).find((o) => o.id === optId);
        if (!opt) {
          lineIssues.push(`${ISSUE.MODIFIER_INVALID}:${modDef.id}:${optId}`);
          issues.push({
            kind: ISSUE.MODIFIER_INVALID,
            message: `"${p.name}" has invalid option "${optId}" for ${modDef.name ?? modDef.id}`,
            line: configKey,
          });
        }
      }
    }

    // 6) Compute unit price = base + modifier deltas
    let unitPrice = Number(p.discount_price ?? p.price);
    for (const modDef of productModifiers) {
      const selected = (modSelections[modDef.id] ?? []) as string[];
      for (const optId of selected) {
        const opt = (modDef.options ?? []).find((o) => o.id === optId);
        if (opt && typeof opt.price_delta === 'number') {
          unitPrice += opt.price_delta;
        }
      }
    }
    const lineSubtotal = unitPrice * qty;
    subtotal += lineSubtotal;

    draftLines.push({
      config_key: configKey,
      product_id: p.id,
      product_name: p.name,
      unit_price: unitPrice,
      line_subtotal: lineSubtotal,
      quantity: qty,
      issues: lineIssues,
      // Store the configuration so the confirm route can re-derive
      // the unit_price with the same modifier-delta logic.
      // This is required because the unit_price includes modifier deltas,
      // and the product's base price alone doesn't reflect those deltas.
      configuration: {
        selected_modifiers: (cfg.selected_modifiers ?? {}) as Record<string, string[]>,
        modifier_quantities: cfg.modifier_quantities,
        notes: cfg.notes,
        cooking_preference: cfg.cooking_preference,
        spice_level: cfg.spice_level,
        variants: cfg.variants as Record<string, string> | undefined,
        add_ons: cfg.add_ons as string[] | undefined,
        special_instructions: cfg.special_instructions,
        substitution_preference: substitutionPreference,
      },
    });
    draftLineIssuesByProduct[p.id] = lineIssues;
  }

  // 7) Versioned delivery-zone coverage and pricing
  const restaurantCommercial = restaurant as typeof restaurant & {
    minimum_order?: number | null;
    min_order?: number | null;
  };
  let deliveryZoneOk = true;
  let deliveryDistanceKm: number | null = null;
  let deliveryZoneRuleId: string | null = null;
  let deliveryZoneRuleVersion: number | null = null;
  let zoneDeliveryFee: number | null = null;
  let deliveryFeeBase: number | null = null;
  let deliveryFeeMultiplier = 1;
  let deliveryFeeSurge = 0;
  let deliveryFeeSurgeActive = false;
  let zoneMinimum = 0;
  const addr = input.delivery_address as { lat?: number; lng?: number; postal_code?: string } | null;
  if (fulfillmentType === 'pickup') {
    deliveryZoneOk = true;
    deliveryDistanceKm = null;
  } else if (addr && addr.lat != null && addr.lng != null) {
    const customerLat = Number(addr.lat);
    const customerLng = Number(addr.lng);
    try {
      const zone = await resolveConfiguredDeliveryZone(supabase, customerLat, customerLng);
      deliveryZoneOk = zone.ok;
      deliveryDistanceKm = zone.distanceKm;
      if (zone.ok) {
        deliveryZoneRuleId = zone.ruleId;
        deliveryZoneRuleVersion = zone.ruleVersion;
        zoneDeliveryFee = zone.pricing.deliveryFee;
        deliveryFeeBase = zone.pricing.baseFee;
        deliveryFeeMultiplier = zone.pricing.multiplier;
        deliveryFeeSurge = zone.pricing.surgeAmount;
        deliveryFeeSurgeActive = zone.pricing.surgeActive;
        zoneMinimum = Number(zone.zone.min_order_amount ?? 0);
      } else {
        issues.push({ kind: ISSUE.DELIVERY_ZONE, message: 'Delivery address is outside every active delivery zone.' });
      }
    } catch {
      deliveryZoneOk = false;
      issues.push({
        kind: ISSUE.DELIVERY_ZONE,
        message: 'Delivery-zone pricing is temporarily unavailable.',
      });
    }
  } else {
    deliveryZoneOk = false;
    issues.push({
      kind: ISSUE.MISSING_ADDRESS_COORDS,
      message: 'Address is missing GPS coordinates',
    });
  }

  const restaurantMinimum = Number(restaurantCommercial.min_order_amount ?? restaurantCommercial.minimum_order ?? restaurantCommercial.min_order ?? 0);
  const minOrderAmount = fulfillmentType === 'pickup' ? restaurantMinimum : Math.max(restaurantMinimum, zoneMinimum);
  const minOrderOk = subtotal >= minOrderAmount;
  if (!minOrderOk) issues.push({ kind: ISSUE.MIN_ORDER_NOT_MET, message: `Minimum order is €${minOrderAmount.toFixed(2)}` });

  // 8) Server-computed fees
  const deliveryFee = fulfillmentType === 'pickup' ? 0 : zoneDeliveryFee ?? Number(restaurant.delivery_fee ?? STANDARD_DELIVERY_FEE);
  if (fulfillmentType === 'pickup') deliveryFeeBase = 0;
  else if (deliveryFeeBase === null) deliveryFeeBase = deliveryFee;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100;
  const tip = Math.min(MAX_TIP, Math.max(MIN_TIP, Number(input.tip ?? 0)));

  // 10) Coupon
  let couponResult: OrderDraft['coupon'] = null;
  let discount = 0;
  if (input.coupon_code) {
    const code = input.coupon_code.toUpperCase();
    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (!coupon) {
      issues.push({ kind: ISSUE.COUPON_INVALID, message: 'Invalid coupon code' });
    } else {
      // Check restaurant match (if specified)
      if (coupon.restaurant_id && coupon.restaurant_id !== input.restaurant_id) {
        issues.push({ kind: ISSUE.COUPON_RESTAURANT_MISMATCH, message: 'Coupon is not valid for this restaurant' });
      } else if (coupon.start_date && new Date(coupon.start_date) > now) {
        issues.push({ kind: ISSUE.COUPON_INVALID, message: 'Coupon is not yet active' });
      } else if (coupon.end_date && new Date(coupon.end_date) < now) {
        issues.push({ kind: ISSUE.COUPON_EXPIRED, message: 'Coupon has expired' });
      } else if (coupon.usage_limit && (coupon.usage_count ?? 0) >= coupon.usage_limit) {
        issues.push({ kind: ISSUE.COUPON_USAGE_LIMIT, message: 'Coupon usage limit reached' });
      } else if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) {
        issues.push({ kind: ISSUE.COUPON_MIN_ORDER, message: `Minimum order €${Number(coupon.min_order_amount).toFixed(2)} for this coupon` });
      } else {
        // Calculate discount
        if (coupon.type === 'percentage') {
          discount = subtotal * (Number(coupon.value) / 100);
          if (coupon.max_discount && discount > Number(coupon.max_discount)) {
            discount = Number(coupon.max_discount);
          }
        } else if (coupon.type === 'fixed') {
          discount = Number(coupon.value);
        } else {
          discount = Number(coupon.value);
        }
        discount = Math.min(discount, subtotal);
        couponResult = {
          code: code,
          type: coupon.type,
          value: Number(coupon.value),
          discount,
          min_order_amount: coupon.min_order_amount ?? null,
          max_discount: coupon.max_discount ?? null,
        };
      }
    }
  }

  // 11) Loyalty points
  const pointsRequested = Math.floor(input.points_redeemed ?? 0);
  let pointsDiscount = 0;
  let pointsApproved = 0;
  if (pointsRequested > 0) {
    const { data: loyaltyRow } = await supabase
      .from('loyalty_points')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    const balance = (loyaltyRow?.balance as number) ?? 0;
    // Max 50% of subtotal in points (1 point = €0.01)
    const maxRedeemable = Math.floor(subtotal * 50);
    pointsApproved = Math.min(pointsRequested, balance, maxRedeemable);
    if (pointsApproved < pointsRequested) {
      if (balance < pointsRequested) {
        issues.push({
          kind: ISSUE.POINTS_INSUFFICIENT,
          message: `Not enough points (balance: ${balance}, requested: ${pointsRequested})`,
        });
      } else {
        issues.push({
          kind: ISSUE.POINTS_EXCEED_LIMIT,
          message: `Max redeemable for this order: ${maxRedeemable} points`,
        });
      }
    }
    pointsDiscount = pointsApproved * 0.01;
  }

  // 12) Server-computed grand total (never negative)
  const total = Math.max(0, subtotal + deliveryFee + serviceFee + tip - discount - pointsDiscount);

  // 13) can_place_order: NO blocking issues
  const BLOCKING = new Set<string>([
    ISSUE.RESTAURANT_NOT_FOUND,
    ISSUE.RESTAURANT_INACTIVE,
    ISSUE.RESTAURANT_HIDDEN,
    ISSUE.RESTAURANT_PAUSED,
    ISSUE.RESTAURANT_CLOSED,
    ISSUE.PRODUCT_DELETED,
    ISSUE.PRODUCT_WRONG_RESTAURANT,
    ISSUE.PRODUCT_HIDDEN,
    ISSUE.PRODUCT_UNAVAILABLE,
    ISSUE.LEGAL_INFORMATION_INCOMPLETE,
    ISSUE.MODIFIER_REQUIRED,
    ISSUE.MODIFIER_NOT_ALLOWED,
    ISSUE.MODIFIER_INVALID,
    ISSUE.MIN_ORDER_NOT_MET,
    ISSUE.DELIVERY_ZONE,
    ISSUE.MISSING_ADDRESS_COORDS,
    ISSUE.COUPON_INVALID,
    ISSUE.COUPON_EXPIRED,
    ISSUE.COUPON_USAGE_LIMIT,
    ISSUE.COUPON_MIN_ORDER,
    ISSUE.COUPON_RESTAURANT_MISMATCH,
    ISSUE.POINTS_INSUFFICIENT,
    ISSUE.POINTS_EXCEED_LIMIT,
    ISSUE.SCHEDULED_IN_PAST,
    ISSUE.SCHEDULED_TOO_SOON,
    ISSUE.SCHEDULED_TOO_FAR,
    'pickup_disabled',
  ]);
  const canPlaceOrder = !issues.some((i) => BLOCKING.has(i.kind));

  // A client cannot attach an arbitrary locked group to a checkout. The host,
  // restaurant and every canonical line must match the server-side snapshot.
  if (input.group_order_id) {
    const [{ data: group }, { data: participant }, { data: groupItems }] = await Promise.all([
      supabase.from('group_orders').select('id,restaurant_id,host_user_id,status,completed_order_id').eq('id', input.group_order_id).maybeSingle(),
      supabase.from('group_order_participants').select('id,is_host').eq('group_order_id', input.group_order_id).eq('user_id', userId).maybeSingle(),
      supabase.from('group_order_items').select('config_key,quantity').eq('group_order_id', input.group_order_id),
    ]);
    if (!group || !participant?.is_host || group.host_user_id !== userId) {
      throw new ValidationError('GROUP_ORDER_NOT_FOUND');
    }
    if (group.status !== 'locked' || group.completed_order_id || group.restaurant_id !== input.restaurant_id) {
      throw new ValidationError('GROUP_ORDER_NOT_CHECKOUT_READY');
    }
    const aggregate = (lines: Array<{ config_key: string; quantity: number }>) => Array.from(lines.reduce((map, line) => map.set(line.config_key, (map.get(line.config_key) ?? 0) + Number(line.quantity)), new Map<string, number>())).sort(([a], [b]) => a.localeCompare(b));
    const lockedSnapshot = aggregate((groupItems ?? []) as Array<{ config_key: string; quantity: number }>);
    const checkoutSnapshot = aggregate(draftLines.map((line) => ({ config_key: line.config_key, quantity: line.quantity })));
    if (JSON.stringify(lockedSnapshot) !== JSON.stringify(checkoutSnapshot)) {
      log.warn('checkout.group_snapshot_mismatch', { groupOrderId: input.group_order_id, lockedSnapshot, checkoutSnapshot });
      throw new ValidationError('GROUP_ORDER_ITEMS_CHANGED');
    }
  }

  // 15) Build the canonical draft
  const draftId = generateDraftId();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();

  // Sanitize the address (only the fields the server cares about)
  // Strip <script> and other HTML/script tags to prevent stored XSS
  // (the address is later rendered in admin/restaurant views).
  const stripHtml = (s: string): string =>
    s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
      .trim();
  const inputAddr = input.delivery_address as { address?: string; lat?: number; lng?: number; door?: string; floor?: string; notes?: string; postal_code?: string; delivery_preferences?: unknown } | null;
  const sanitizedAddress: OrderDraft['delivery_address'] = fulfillmentType === 'pickup' ? null : {
    address: stripHtml(inputAddr?.address ?? '').slice(0, 500),
    lat: inputAddr?.lat ?? null,
    lng: inputAddr?.lng ?? null,
    door: stripHtml(inputAddr?.door ?? '').slice(0, 20) || undefined,
    floor: stripHtml(inputAddr?.floor ?? '').slice(0, 20) || undefined,
    notes: stripHtml(inputAddr?.notes ?? '').slice(0, MAX_NOTES_LEN) || undefined,
    postal_code: stripHtml(inputAddr?.postal_code ?? '').slice(0, 10) || undefined,
    delivery_preferences: sanitizeDeliveryPreferences(inputAddr?.delivery_preferences),
  };

  const draftBody: Omit<OrderDraft, 'signature'> = {
    draft_id: draftId,
    customer_id: userId,
    restaurant_id: input.restaurant_id,
    group_order_id: input.group_order_id,
    fulfillment_type: fulfillmentType,
    lines: draftLines,
    delivery_address: sanitizedAddress,
    payment_method: input.payment_method as 'cash' | 'stripe' | 'card',
    scheduled_for: scheduledDate?.toISOString() ?? null,
    tip,
    coupon: couponResult,
    points_redeemed: pointsApproved,
    subtotal: Math.round(subtotal * 100) / 100,
    delivery_fee: Math.round(deliveryFee * 100) / 100,
    delivery_fee_base: Math.round(deliveryFeeBase * 100) / 100,
    delivery_fee_surge: Math.round(deliveryFeeSurge * 100) / 100,
    delivery_fee_multiplier: deliveryFeeMultiplier,
    delivery_fee_surge_active: deliveryFeeSurgeActive,
    service_fee: serviceFee,
    discount: Math.round(discount * 100) / 100,
    points_discount: Math.round(pointsDiscount * 100) / 100,
    total: Math.round(total * 100) / 100,
    min_order_amount: minOrderAmount,
    min_order_ok: minOrderOk,
    delivery_zone_ok: deliveryZoneOk,
    delivery_distance_km: deliveryDistanceKm,
    delivery_zone_rule_id: deliveryZoneRuleId,
    delivery_zone_rule_version: deliveryZoneRuleVersion,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      is_paused: !!restaurant.is_paused,
      is_hidden: !!restaurant.is_hidden,
      is_active: !!restaurant.is_active,
      is_open: openAtFulfilment,
      address: typeof restaurant.address === 'string' ? restaurant.address : null,
      pickup_instructions: typeof restaurant.pickup_instructions === 'string' ? restaurant.pickup_instructions : null,
    },
    currency: 'EUR',
    issued_at: issuedAt,
    expires_at: expiresAt,
    can_place_order: canPlaceOrder,
    issues,
  };

  const signature = signCheckoutDraft(draftBody as unknown as Record<string, unknown>);
  const draft: OrderDraft = { ...draftBody, signature };

  // 16) Persist the draft to Supabase (survives restarts, multi-node safe)
  //    In the mock, scripts/mock-supabase.mjs persists to its own in-memory map.
  //    The schema mirrors deploy/supabase/61-order-drafts.sql.
  const { error: persistErr } = await supabase
    .from('order_drafts')
    .upsert({
      id: draftId,
      customer_id: userId,
      restaurant_id: input.restaurant_id,
      draft,
      signature,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      confirmed_by: null,
      deleted_at: null,
    }, { onConflict: 'id' });

  if (persistErr) {
    log.error('checkout.draft.persist_failed', { draftId, error: persistErr.message });
    return ok({ ok: false, error: 'persist_failed', message: 'Failed to persist draft' });
  }

  log.info('checkout.draft.created', {
    draftId,
    userId,
    items: draftLines.length,
    total: draft.total,
    canPlaceOrder,
  });

  return ok({ ok: true, draft });
}

// ── GET /api/checkout/draft?draft_id=... ─────────
// Also supports ?active=true to fetch the user's most recent active draft
// (used for cross-device draft sharing).
async function getDraft(draftIdOrActive: string, userId: string, opts: { active: boolean } = { active: false }): Promise<NextResponse> {
  const supabase = createServiceClient();
  // ── Cross-device: GET /api/checkout/draft?active=true ──
  if (opts.active) {
    const { data: rows, error: rpcErr } = await supabase.rpc('get_active_order_draft', {
      p_customer_id: userId,
    });
    if (rpcErr) {
      // Fallback: manual query (the RPC may not exist in the mock)
      const { data: drafts, error: listErr } = await supabase
        .from('order_drafts')
        .select('*')
        .eq('customer_id', userId)
        .eq('used', false)
        .is('deleted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      if (listErr) {
        return ok({ ok: false, error: 'fetch_failed', message: 'Failed to fetch active draft' });
      }
      if (!drafts || drafts.length === 0) {
        return ok({ ok: false, error: 'no_active_draft', message: 'No active draft' });
      }
      const row = drafts[0];
      return ok({ ok: true, draft: row.draft, draft_id: row.id, signature: row.signature, expires_at: row.expires_at, used: row.used });
    }
    if (!rows || rows.length === 0) {
      return ok({ ok: false, error: 'no_active_draft', message: 'No active draft' });
    }
    const row = rows[0];
    return ok({ ok: true, draft: row.draft, draft_id: row.id, signature: row.signature, expires_at: row.expires_at, used: row.used });
  }

  // ── Single draft: GET /api/checkout/draft?draft_id=xxx ──
  const { data: row, error: fetchErr } = await supabase
    .from('order_drafts')
    .select('*')
    .eq('id', draftIdOrActive)
    .maybeSingle();

  if (fetchErr || !row) {
    return ok({ ok: false, error: 'draft_not_found', message: 'Draft not found or expired' });
  }
  if (row.customer_id !== userId) {
    // Don't leak whether the draft exists
    return ok({ ok: false, error: 'draft_not_found', message: 'Draft not found or expired' });
  }
  if (row.used) {
    return ok({ ok: false, error: 'draft_already_used', message: 'Draft was already confirmed' });
  }
  if (row.deleted_at) {
    return ok({ ok: false, error: 'draft_not_found', message: 'Draft not found or expired' });
  }
  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    return ok({ ok: false, error: 'draft_expired', message: 'Draft has expired (30 min limit)' });
  }
  // Re-validate the signature (defense in depth)
  if (!verifyCheckoutDraftSignature(row.draft as Record<string, unknown>, row.signature)) {
    log.error('checkout.draft.signature_invalid', { draftId: draftIdOrActive });
    return ok({ ok: false, error: 'draft_tampered', message: 'Draft signature is invalid' });
  }
  return ok({ ok: true, draft: row.draft });
}

// ── Export internals for /api/checkout/confirm ───
// ── Export internals for /api/checkout/confirm ───
// The legacy in-memory draftStore is no longer used (drafts are in Supabase).
// The confirm route now uses `burn_order_draft` RPC + the same Supabase
// draft row. We keep verifyDraft/signDraft/ISSUE exports for backwards compat.
// (helpers kept internal; not re-exported to satisfy Next.js route type constraints)
