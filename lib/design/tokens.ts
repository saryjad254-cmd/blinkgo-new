/**
 * BlinkGo Design System — Single Source of Truth
 * ─────────────────────────────────────────────────
 * Every visual property in one place.
 *
 * Pattern: import { tokens, color, space, type } from '@/lib/design/tokens';
 *
 * Inspired by:
 *   - Apple Human Interface Guidelines
 *   - Material Design 3
 *   - Stripe / Linear / Notion
 *   - Wolt / Uber Eats / DoorDash
 *
 * Every component must use these tokens — never hardcode values.
 */

// ═══════════════════════════════════════════════════════════════
// COLOR — Brand & semantic palette
// ═══════════════════════════════════════════════════════════════
export const color = {
  // Brand: BlinkGo signature red→amber
  brand: {
    50:  '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',  // PRIMARY
    600: '#DC2626',  // OFFICIAL
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    DEFAULT: '#DC2626',
  },
  accent: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    DEFAULT: '#F59E0B',
  },
  // Semantic
  success: {
    light: '#34D399',
    DEFAULT: '#10B981',
    dark: '#059669',
  },
  info: {
    light: '#60A5FA',
    DEFAULT: '#3B82F6',
    dark: '#2563EB',
  },
  warning: {
    light: '#FBBF24',
    DEFAULT: '#F59E0B',
    dark: '#D97706',
  },
  error: {
    light: '#F87171',
    DEFAULT: '#EF4444',
    dark: '#DC2626',
  },
  // Neutrals (dark theme)
  ink: {
    0:    '#FFFFFF',
    50:   '#FAFAFA',
    100:  '#F4F4F5',
    200:  '#E4E4E7',
    300:  '#D4D4D8',
    400:  '#A1A1AA',
    500:  '#71717A',
    600:  '#52525B',
    700:  '#3F3F46',
    800:  '#27272A',
    900:  '#18181B',
    950:  '#09090B',
  },
  // Surface (dark)
  surface: {
    bg:       '#09090B',  // page bg
    raised:   '#18181B',  // cards, modals
    overlay:  'rgba(0,0,0,0.7)',
  },
  // Text (dark theme)
  text: {
    primary:   '#FAFAFA',
    secondary: '#A1A1AA',
    muted:     '#71717A',
    disabled:  '#52525B',
    inverse:   '#09090B',
  },
  // Borders
  border: {
    subtle:  'rgba(255,255,255,0.06)',
    DEFAULT: 'rgba(255,255,255,0.10)',
    strong:  'rgba(255,255,255,0.16)',
    brand:   'rgba(239, 68, 68, 0.40)',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// SPACING — 4pt grid (every value is multiple of 4)
// ═══════════════════════════════════════════════════════════════
export const space = {
  0:  '0',
  px: '1px',
  0.5:'2px',
  1:  '4px',
  1.5:'6px',
  2:  '8px',
  2.5:'10px',
  3:  '12px',
  3.5:'14px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  7:  '28px',
  8:  '32px',
  9:  '36px',
  10: '40px',
  11: '44px',  // iOS tap target minimum
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  40: '160px',
  48: '192px',
  56: '224px',
  64: '256px',
} as const;

// ═══════════════════════════════════════════════════════════════
// RADIUS — Premium squircle scale
// ═══════════════════════════════════════════════════════════════
export const radius = {
  none: '0',
  xs:   '4px',
  sm:   '8px',
  DEFAULT: '12px',
  md:   '12px',
  lg:   '16px',
  xl:   '20px',
  '2xl':'24px',
  '3xl':'32px',
  '4xl':'40px',
  pill: '9999px',
  full: '9999px',
} as const;

// ═══════════════════════════════════════════════════════════════
// TYPOGRAPHY — Premium scale (1.125 ratio)
// ═══════════════════════════════════════════════════════════════
export const typography = {
  fontFamily: {
    sans:   'var(--font-inter), "Inter", system-ui, -apple-system, sans-serif',
    arabic: 'var(--font-cairo), "Cairo", "Tajawal", system-ui, sans-serif',
    display: 'var(--font-cairo), "Cairo", system-ui, sans-serif',
    mono:   'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
  size: {
    '2xs':  '0.6875rem',  // 11px
    xs:     '0.75rem',    // 12px
    sm:     '0.8125rem',  // 13px
    base:   '0.9375rem',  // 15px
    md:     '1rem',       // 16px
    lg:     '1.125rem',   // 18px
    xl:     '1.25rem',    // 20px
    '2xl':  '1.5rem',     // 24px
    '3xl':  '1.875rem',   // 30px
    '4xl':  '2.25rem',    // 36px
    '5xl':  '3rem',       // 48px
    '6xl':  '3.75rem',    // 60px
  },
  weight: {
    thin:     '200',
    light:    '300',
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
    black:    '900',
  },
  lineHeight: {
    tight:   '1.1',
    snug:    '1.25',
    normal:  '1.5',
    relaxed: '1.625',
    loose:   '2',
  },
  letterSpacing: {
    tighter: '-0.04em',
    tight:   '-0.02em',
    normal:  '0',
    wide:    '0.02em',
    wider:   '0.05em',
    widest:  '0.1em',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// ELEVATION — Soft layered shadows
// ═══════════════════════════════════════════════════════════════
export const elevation = {
  none:  'none',
  xs:    '0 1px 2px rgba(0,0,0,0.20)',
  sm:    '0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.36)',
  DEFAULT: '0 4px 8px rgba(0,0,0,0.20), 0 2px 4px rgba(0,0,0,0.12)',
  md:    '0 8px 16px rgba(0,0,0,0.24), 0 4px 8px rgba(0,0,0,0.16)',
  lg:    '0 16px 32px rgba(0,0,0,0.28), 0 8px 16px rgba(0,0,0,0.20)',
  xl:    '0 24px 48px rgba(0,0,0,0.32), 0 12px 24px rgba(0,0,0,0.24)',
  '2xl': '0 32px 64px rgba(0,0,0,0.36), 0 16px 32px rgba(0,0,0,0.28)',
  // Inner
  inner: 'inset 0 2px 4px rgba(0,0,0,0.24)',
  // Brand glow
  glow:  '0 8px 32px -4px rgba(239, 68, 68, 0.40), 0 4px 12px rgba(239, 68, 68, 0.20)',
  'glow-strong': '0 16px 48px -8px rgba(239, 68, 68, 0.60), 0 8px 24px rgba(239, 68, 68, 0.30)',
} as const;

// ═══════════════════════════════════════════════════════════════
// MOTION — Premium easings & durations
// ═══════════════════════════════════════════════════════════════
export const motion = {
  duration: {
    instant: '80ms',
    fast:    '160ms',
    normal:  '240ms',
    slow:    '360ms',
    page:    '480ms',
    long:    '720ms',
  },
  ease: {
    standard:    'cubic-bezier(0.4, 0, 0.2, 1)',     // iOS default
    decelerate:  'cubic-bezier(0, 0, 0.2, 1)',        // Things settling in
    accelerate:  'cubic-bezier(0.4, 0, 1, 1)',        // Things moving out
    sharp:       'cubic-bezier(0.4, 0, 0.6, 1)',      // Quick response
    bounce:      'cubic-bezier(0.34, 1.56, 0.64, 1)', // Playful overshoot
    emphasized:  'cubic-bezier(0.2, 0, 0, 1)',       // Hero animations
  },
  stagger: {
    tight: '30ms',
    normal: '60ms',
    loose: '120ms',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// BREAKPOINTS — Mobile-first responsive
// ═══════════════════════════════════════════════════════════════
export const breakpoint = {
  xs:  '320px',  // iPhone SE
  sm:  '640px',  // Phones
  md:  '768px',  // Tablets
  lg:  '1024px', // Laptops
  xl:  '1280px', // Desktops
  '2xl':'1536px', // Large screens
} as const;

// ═══════════════════════════════════════════════════════════════
// LAYOUT — Container, max-widths, grid
// ═══════════════════════════════════════════════════════════════
export const layout = {
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1440px',
  },
  pagePadding: {
    mobile: '16px',
    tablet: '24px',
    desktop: '32px',
  },
  grid: {
    cols: 12,
    gap: '16px',
  },
  header: {
    height: '64px',
    heightMobile: '56px',
  },
  bottomNav: {
    height: '72px',  // mobile bottom nav (above safe area)
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// ICON SIZES — Consistent across the app
// ═══════════════════════════════════════════════════════════════
export const iconSize = {
  xs:  12,
  sm:  14,
  md:  16,
  DEFAULT: 20,
  lg:  24,
  xl:  32,
  '2xl': 40,
  '3xl': 48,
} as const;

// ═══════════════════════════════════════════════════════════════
// Z-INDEX SCALE
// ═══════════════════════════════════════════════════════════════
export const zIndex = {
  hide:     -1,
  base:     0,
  raised:   10,
  dropdown: 20,
  sticky:   30,
  nav:      40,
  overlay:  50,
  modal:    60,
  toast:    70,
  tooltip:  80,
  max:      9999,
} as const;

// ═══════════════════════════════════════════════════════════════
// TRANSITION PRESETS — Ready-to-use
// ═══════════════════════════════════════════════════════════════
export const transition = {
  fast:    `all ${motion.duration.fast} ${motion.ease.standard}`,
  normal:  `all ${motion.duration.normal} ${motion.ease.standard}`,
  slow:    `all ${motion.duration.slow} ${motion.ease.standard}`,
  bounce:  `all ${motion.duration.slow} ${motion.ease.bounce}`,
  transform: `transform ${motion.duration.normal} ${motion.ease.emphasized}`,
  color: `color ${motion.duration.fast} ${motion.ease.standard}`,
  opacity: `opacity ${motion.duration.fast} ${motion.ease.standard}`,
} as const;

// ═══════════════════════════════════════════════════════════════
// REDUCED MOTION
// ═══════════════════════════════════════════════════════════════
export const reducedMotionCSS = `
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

// ═══════════════════════════════════════════════════════════════
// ALL EXPORTS
// ═══════════════════════════════════════════════════════════════
export const tokens = {
  color,
  space,
  radius,
  typography,
  elevation,
  motion,
  breakpoint,
  layout,
  iconSize,
  zIndex,
  transition,
} as const;

export default tokens;
