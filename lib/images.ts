/**
 * Image URL resolution — single source of truth.
 * ───────────────────────────────────────────────
 * ROOT CAUSE this fixes: the `restaurants` table stores the cover in
 * `image_url` (see deploy/supabase/14-complete-schema.sql) but the UI was
 * built against a `cover_url` field that never existed in any migration.
 * Every `select('*')` therefore returned rows WITHOUT `cover_url`
 * (→ permanent placeholder), and every explicit `select('… cover_url …')`
 * failed with a PostgREST "column does not exist" error that was swallowed.
 *
 * Products: `image_urls TEXT[]` was added by migration 16 with a backfill
 * from the older single `image_url` column — but rows written by paths that
 * only set `image_url` end up with an empty array, so the UI must fall back
 * `image_urls[0] → image_url`.
 *
 * These helpers normalize both, WITHOUT any schema change.
 */

export function restaurantCoverUrl(r: {
  cover_url?: string | null;
  image_url?: string | null;
} | null | undefined): string | null {
  if (!r) return null;
  const url = r.cover_url || r.image_url || null;
  return url && /^https?:\/\//.test(url) ? url : null;
}

export function productImageUrl(p: {
  image_urls?: string[] | null;
  image_url?: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  const url = (p.image_urls && p.image_urls[0]) || p.image_url || null;
  return url && /^https?:\/\//.test(url) ? url : null;
}

/**
 * onError handler for <img>: hides the broken image so the styled fallback
 * behind it shows instead of the browser's broken-image icon.
 */
export function hideOnError(e: { currentTarget: { style: { display: string } } }): void {
  e.currentTarget.style.display = 'none';
}
