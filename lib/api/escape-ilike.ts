/**
 * Escape user input for use in PostgREST `.ilike()` or `.or()` filter
 * expressions that interpolate via template literals.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SECURITY: PostgREST filter injection (CVE-class: Directus 2023, PostgREST
 * filter parsing). If a user-controlled string is interpolated into a
 * template literal like
 *     .or(`name.ilike.%${userInput}%,description.ilike.%${userInput}%`)
 * then a malicious `userInput` like "pizza,is_active.eq.true" injects
 * extra filter clauses, bypassing intended filters.
 *
 * The PostgREST filter syntax reserves these characters as special:
 *   ,   separates OR clauses
 *   .   separates column from operator
 *   ( ) group expressions
 * The `ilike` operator additionally treats `%` and `_` as wildcards.
 *
 * ALWAYS escape user input before interpolating it into a filter template.
 * ──────────────────────────────────────────────────────────────────────
 */
export function escapeIlike(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    // Order matters: backslash first (so we don't double-escape our own escapes)
    .replace(/\\/g, '\\\\')
    // PostgREST filter syntax specials
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\./g, '\\.')
    // ilike wildcards — turn them into literals
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    // PostgREST array / group delimiters (cs, cd, ov, sl, sr, nxr, etc.)
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    // Cap length defensively
    .slice(0, 200);
}

/**
 * Escape a list of strings, then join with `,` for use in a PostgREST
 * `.in()` filter. PostgREST's `in()` operator takes a parenthesised
 * comma-separated list of values; each value must be a string literal.
 */
export function escapeInList(values: ReadonlyArray<string | null | undefined>): string {
  return values
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 200)}"`)
    .join(',');
}
