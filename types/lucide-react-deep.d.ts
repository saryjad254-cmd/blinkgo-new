/**
 * Type shim for `lucide-react/dist/esm/icons/<name>` deep imports.
 *
 * Each per-icon file under `dist/esm/icons/` is shipped as a plain `.js`
 * without a sibling `.d.ts` declaration. We declare them here as
 * `LucideIcon` so that consumers get full type safety without losing
 * the tree-shake win of the per-icon path.
 *
 * Why: the barrel `import { Foo } from 'lucide-react'` pulls in
 * thousands of icon modules at type-check time and still costs bundle
 * parse time even when `optimizePackageImports` rewrites the import.
 * The explicit deep path avoids both costs.
 *
 * Each per-icon module ships as `export { Star as default }`, so the
 * consumer must use a default import:
 *
 *   import Star from 'lucide-react/dist/esm/icons/star';
 *
 * We expose the icon as both the default export and a named export
 * matching the original PascalCase name so existing call sites that
 * used the barrel (e.g. `import { Star } from 'lucide-react'`) keep
 * working unchanged.
 */
declare module 'lucide-react/dist/esm/icons/*' {
  import type { LucideIcon } from 'lucide-react';

  // PascalCase icon name (used as the default export name).
  // We can't know the literal at type-time, so we re-export the
  // LucideIcon as `default` only. Consumers that need a named binding
  // can write `import { default as Star } from '.../star'`.
  const icon: LucideIcon;
  export default icon;
}
