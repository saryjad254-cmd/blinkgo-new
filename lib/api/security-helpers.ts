/**
 * Security Helper Shortcuts
 * ─────────────────────────
 * Curated rate-limit tiers and convenience wrappers around withSecurity.
 *
 * Built on @/lib/foundation:
 *   - Role type re-exported from Foundation
 *   - Tier definitions centralized; rate-limit logic in lib/rate-limit
 *
 * Tiers (in requests / 15 min unless noted):
 *  - auth     : 5/15min  (login, register, magic-link, reset-password, oauth)
 *  - strict   : 10/15min (admin mutations, refunds, payouts, sensitive writes)
 *  - moderate : 30/15min (customer state changes, driver state changes)
 *  - lenient  : 60/15min (reads, search, list endpoints)
 *  - system   : 300/15min (webhooks, cron, system endpoints)
 *  - open     : 120/15min (public read-only endpoints — health, metrics, etc.)
 */

import { getClientIp, type RateLimitConfig } from '@/lib/rate-limit';
import { withSecurity, type SecurityOptions, type Role } from '@/lib/api/security';

const FIFTEEN_MIN = 15 * 60;

export const RATE_TIERS: Record<string, RateLimitConfig> = {
  auth: { limit: 5, windowSec: FIFTEEN_MIN, name: 'auth' },
  strict: { limit: 10, windowSec: FIFTEEN_MIN, name: 'strict' },
  moderate: { limit: 30, windowSec: FIFTEEN_MIN, name: 'moderate' },
  lenient: { limit: 60, windowSec: FIFTEEN_MIN, name: 'lenient' },
  system: { limit: 300, windowSec: FIFTEEN_MIN, name: 'system' },
  open: { limit: 120, windowSec: FIFTEEN_MIN, name: 'open' },
  ordersCreate: { limit: 20, windowSec: FIFTEEN_MIN, name: 'orders-create' },
  orderCancel: { limit: 5, windowSec: FIFTEEN_MIN, name: 'order-cancel' },
  driverLocation: { limit: 120, windowSec: FIFTEEN_MIN, name: 'driver-location' },
  search: { limit: 60, windowSec: FIFTEEN_MIN, name: 'search' },
  geocode: { limit: 60, windowSec: FIFTEEN_MIN, name: 'geocode' },
  metrics: { limit: 300, windowSec: FIFTEEN_MIN, name: 'metrics' },
  tracking: { limit: 300, windowSec: FIFTEEN_MIN, name: 'tracking' },
};

export function tier(name: keyof typeof RATE_TIERS): RateLimitConfig {
  return RATE_TIERS[name];
}

export function secureRoute(
  rateLimitTier: keyof typeof RATE_TIERS,
  roles?: Role[],
  extras: Partial<SecurityOptions> = {},
): SecurityOptions {
  const isPublic = !roles || roles.length === 0;
  const selectedTier = tier(rateLimitTier);
  return {
    ...(roles && roles.length > 0 ? { roles } : {}),
    // A tier is shared by many endpoints. Namespace its bucket by pathname so
    // ordinary browsing cannot exhaust unrelated read APIs that use the same
    // tier (for example search must not block order tracking).
    rateLimit: {
      ...selectedTier,
      keyFn: selectedTier.keyFn ?? ((req) => `${getClientIp(req)}:${req.nextUrl.pathname}`),
    },
    ...(isPublic ? { publicAccess: true } : {}),
    ...extras,
  };
}

export { withSecurity };
