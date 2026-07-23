/**
 * BlinkGo Iconography System
 *
 * A unified, world-class icon system for the entire application.
 *
 * ## Sizes
 * - xs:   12px (3)  — micro icons (badges, inline indicators)
 * - sm:   16px (4)  — small icons in text
 * - md:   20px (5)  — primary icons (nav, lists)
 * - lg:   24px (6)  — emphasized icons (cards, stats)
 * - xl:   28px (7)  — large display icons
 * - 2xl:  36px (9)  — hero icons
 *
 * ## Stroke Width
 * - Default: 2.0  — consistent stroke across all icons
 * - Subtle:  1.75 — for inactive/secondary icons (bottom nav)
 * - Bold:    2.5  — for active/primary emphasis
 *
 * ## Color
 * - Default: currentColor (text color)
 * - Use semantic tokens:
 *   - text-brand (primary action)
 *   - text-text-secondary (default)
 *   - text-text-muted (disabled/secondary)
 *   - text-success (positive)
 *   - text-warning (caution)
 *   - text-danger (error)
 *
 * ## Usage
 * - Always use the <Icon /> wrapper or NavIcon for bottom nav
 * - Never pass arbitrary stroke widths
 * - Always set aria-hidden or aria-label
 *
 * ## Iconography Layers
 *
 * 1. **Navigation**: BottomNavItem (uses NavIcon)
 *    - strokeWidth={active ? 2.25 : 1.75}
 *    - Active: scale-110 + brand color + top indicator bar
 *
 * 2. **Cards/Stats**: IconBadge
 *    - Wrapper sizes: sm/md/lg/xl
 *    - 6 variants: brand/accent/success/warning/info/neutral
 *    - Optional pulse animation
 *
 * 3. **Buttons**: Lucide icons inside Button
 *    - size="sm" (16px) or "md" (20px)
 *    - strokeWidth=2
 *
 * 4. **Hero sections**: Icon size="xl" or "2xl"
 *    - strokeWidth=2.5 for emphasis
 *
 * 5. **Inline indicators**: Icon size="xs" or "sm"
 *    - strokeWidth=2
 */

export const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-7 h-7',
  '2xl': 'w-9 h-9',
} as const;

export const ICON_STROKES = {
  subtle: 1.75, // inactive nav, secondary
  default: 2.0,  // most icons
  emphasis: 2.5, // active nav, hero, featured
} as const;

export type IconSize = keyof typeof ICON_SIZES;
export type IconStroke = keyof typeof ICON_STROKES;
