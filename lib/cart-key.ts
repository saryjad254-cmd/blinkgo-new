/**
 * Cart Identity — canonical, deterministic line key.
 *
 * Every property that affects the order MUST participate in the line identity.
 * Two cart lines merge ONLY if every effective attribute is identical.
 *
 *   restaurant_id           → lines from different restaurants NEVER merge
 *   product_id              → the underlying product
 *   selected_modifiers      → map<modifier_id, sorted[option_id]> (option-quantity collapsed into the option_id where possible)
 *   modifier_quantities     → map<"modifier_id:option_id", qty>           for the rare modifier that takes a quantity (e.g. "extra napkins × 3")
 *   notes                   → free-text per-line instructions ("no onions", "extra sauce")
 *   cooking_preference      → e.g. "medium", "well done" (deprecated path — should also live in selected_modifiers but kept for back-compat)
 *   spice_level             → e.g. "mild", "medium", "hot"
 *   variants                → e.g. { color: "red", size: "L" }
 *   add_ons                 → explicit list of add-on product_ids
 *   special_instructions    → alias of notes (kept for API compatibility)
 *
 * The key is:
 *   - Deterministic: same configuration always produces same key
 *   - Order-independent: {size:M, extras:cheese} === {extras:cheese, size:M}
 *   - Hash-collisions improbable: 64-bit FNV-1a over a canonical JSON
 *   - Tamper-resistant: server re-derives the key from validated data
 *
 * Server is the source of truth: client computes a *candidate* key, the server
 * re-derives the canonical key from validated product+modifier data and returns
 * the authoritative key. The client then stores the server-issued key on the line.
 *
 * Why FNV-1a? It is fast, deterministic, dependency-free, runs identically in
 * browser and Node, has good distribution for short inputs, and 64-bit
 * collisions are negligible for a single cart (<<2^32 entries).
 *
 * If the configuration is empty, the key is just `r:<rid>:p:<pid>` — keeping
 * the common no-modifier case compact and the test surface small.
 */

export interface CartLineConfiguration {
  /** Map of modifier_id → sorted list of option_ids. Order independent. */
  selected_modifiers?: Record<string, string[]>;
  /** Map of "<modifier_id>:<option_id>" → quantity, for the rare qty modifier. */
  modifier_quantities?: Record<string, number>;
  /** Free-text per-line instructions. */
  notes?: string;
  /** Optional explicit override (most modifiers carry this). */
  cooking_preference?: string;
  /** "mild" | "medium" | "hot" etc. */
  spice_level?: string;
  /** Free-form variant attributes (color, size, etc.). */
  variants?: Record<string, string>;
  /** Add-on product ids (if a product can be augmented with other products). */
  add_ons?: string[];
  /** Alias of notes; kept so external API clients can use either name. */
  special_instructions?: string;
  /** Customer instruction if a retail item becomes unavailable. */
  substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = (1n << 64n) - 1n;

function fnv1a64(input: string): bigint {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h;
}

/**
 * Normalize a value so that semantically equal inputs hash to the same key:
 *  - drop undefined / null
 *  - trim & lowercase string keys
 *  - sort string arrays
 *  - sort object keys
 *  - drop empty objects/arrays
 */
function normalize(value: unknown, isKey = false): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? (isKey ? t.toLowerCase() : t) : undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    // round to 3 decimal places to absorb FP noise
    return Math.round(value * 1000) / 1000;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => normalize(v, isKey))
      .filter((v) => v !== undefined);
    if (isKey) {
      // arrays of strings sort deterministically
      if (arr.every((v) => typeof v === 'string')) return arr.sort();
      return arr;
    }
    return arr;
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(record).sort();
  for (const k of keys) {
    const v = normalize(record[k], true);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Produce the canonical JSON serialization of a configuration. Order
 * independent for both modifier groups and option lists. Used both for
 * computing the hash and for human-readable comparison in tests.
 */
export function canonicalizeConfig(config: CartLineConfiguration | null | undefined): Record<string, unknown> | null {
  if (!config) return null;
  const norm = normalize(config);
  if (!norm || typeof norm !== 'object') return null;
  // Sort map keys (normalize already does this) and option arrays (handled
  // by the isKey branch which sorts string arrays).
  return norm as Record<string, unknown>;
}

/**
 * Convert a canonical config to a stable, compact JSON string.
 *
 * The string is byte-deterministic: the same configuration always produces
 * the same string. Used as the FNV-1a input.
 */
export function configToCanonicalString(config: CartLineConfiguration | null | undefined): string {
  const c = canonicalizeConfig(config);
  if (!c) return '{}';
  return JSON.stringify(c);
}

/**
 * Compute the full CartKey for a line. Format: `r:<rid>:p:<pid>:<hexhash>`.
 *
 * The first 12 hex chars of the FNV-1a digest provide 48 bits — collision-
 * resistant for any realistic cart size while remaining a short, copy-
 * pasteable identifier.
 */
export function computeCartKey(restaurantId: string, productId: string, config: CartLineConfiguration | null | undefined): string {
  const str = configToCanonicalString(config);
  const hash = fnv1a64(str);
  // 12 hex chars = 48 bits
  return `r:${restaurantId}:p:${productId}:${hash.toString(16).padStart(16, '0').slice(-12)}`;
}

/**
 * Server-side re-derivation. Given a server-validated list of modifier option
 * ids and the raw inputs (notes, spice, etc.), produce the authoritative key.
 *
 * `optionIdsByModifier` MUST come from the database (not client). The order
 * of modifier entries is irrelevant — the canonicalizer sorts them.
 */
export function serverDeriveKey(
  restaurantId: string,
  productId: string,
  optionIdsByModifier: Record<string, string[]>,
  extras: {
    modifier_quantities?: Record<string, number>;
    notes?: string;
    cooking_preference?: string;
    spice_level?: string;
    variants?: Record<string, string>;
    add_ons?: string[];
    special_instructions?: string;
    substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
  } = {},
): string {
  // Sort the modifier ids and option ids inside each group, so the resulting
  // canonical string is order-independent.
  const sorted_modifiers: Record<string, string[]> = {};
  for (const modId of Object.keys(optionIdsByModifier).sort()) {
    sorted_modifiers[modId] = [...optionIdsByModifier[modId]].sort();
  }
  return computeCartKey(restaurantId, productId, {
    selected_modifiers: sorted_modifiers,
    ...extras,
  });
}

/**
 * Compare two configurations for equality. Two lines are mergeable iff
 * `configsEqual(a, b) === true` AND they belong to the same product+restaurant.
 *
 * Useful for deduping in the cart store.
 */
export function configsEqual(a: CartLineConfiguration | null | undefined, b: CartLineConfiguration | null | undefined): boolean {
  const ca = canonicalizeConfig(a);
  const cb = canonicalizeConfig(b);
  return JSON.stringify(ca) === JSON.stringify(cb);
}

/**
 * Return a short human-readable summary of a configuration, used by the cart UI
 * to display the line's customization ("Large, Extra cheese, No onions").
 *
 * The first `modifiersToShow` groups are rendered as `name: option names…`
 * then any notes / spice / cooking are appended.
 */
export function describeConfig(
  config: CartLineConfiguration | null | undefined,
  options: {
    modifierNames?: Record<string, string>; // modifier_id → display name
    optionNames?: Record<string, string>;    // option_id → display name
    notesLabel?: string;
    spiceLabel?: string;
    cookingLabel?: string;
  } = {},
  modifiersToShow = 3,
): string {
  if (!config) return '';
  const parts: string[] = [];
  if (config.selected_modifiers) {
    let shown = 0;
    for (const modId of Object.keys(config.selected_modifiers).sort()) {
      if (shown >= modifiersToShow) break;
      const opts = config.selected_modifiers[modId] || [];
      if (!opts.length) continue;
      const optNames = opts
        .map((oid) => options.optionNames?.[oid] ?? oid)
        .join(', ');
      const modName = options.modifierNames?.[modId] ?? modId;
      parts.push(`${modName}: ${optNames}`);
      shown++;
    }
  }
  if (config.cooking_preference && options.cookingLabel) {
    parts.push(`${options.cookingLabel}: ${config.cooking_preference}`);
  } else if (config.cooking_preference) {
    parts.push(config.cooking_preference);
  }
  if (config.spice_level && options.spiceLabel) {
    parts.push(`${options.spiceLabel}: ${config.spice_level}`);
  } else if (config.spice_level) {
    parts.push(config.spice_level);
  }
  if (config.notes) parts.push(config.notes);
  if (config.special_instructions && config.special_instructions !== config.notes) {
    parts.push(config.special_instructions);
  }
  return parts.join(' · ');
}
