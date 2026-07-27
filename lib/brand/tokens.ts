/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkGo Official Design System — Tokens
 * ════════════════════════════════════════════════════════════════════════
 *
 *  SOURCE OF TRUTH — derived directly from the official BlinkGo logo.
 *  Every component MUST consume these tokens via Tailwind utility classes
 *  or CSS variables. No hard-coded values anywhere else in the app.
 *
 *  Color philosophy: Uber-clean × Stripe-precision × Wolt-energy × Apple-restraint
 *
 *  Last updated: 2026-07-18
 */

// ════════════════════════════════════════════════════════════════════════
// 1. PRIMARY BRAND COLORS (extracted from logo)
// ════════════════════════════════════════════════════════════════════════

/** Brand Yellow — logo background, primary highlights, attention */
export const BRAND_YELLOW = {
  50:  '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F5B819', // OFFICIAL — from logo
  600: '#D97706',
  700: '#B45309',
  800: '#92400E',
  900: '#78350F',
} as const;

/** Brand Red — primary CTA, "Go" text, urgency, energy */
export const BRAND_RED = {
  50:  '#FEF2F2',
  100: '#FEE2E2',
  200: '#FECACA',
  300: '#FCA5A5',
  400: '#F87171',
  500: '#DC2626', // OFFICIAL — from logo
  600: '#B91C1C',
  700: '#991B1B',
  800: '#7F1D1D',
  900: '#5C0F0F',
} as const;

/** Brand Black — "Blink" text, primary text, premium dark surfaces */
export const BRAND_BLACK = {
  50:  '#F5F5F5',
  100: '#E5E5E5',
  200: '#D4D4D4',
  300: '#A3A3A3',
  400: '#737373',
  500: '#525252',
  600: '#404040',
  700: '#262626',
  800: '#171717',
  900: '#0A0A0A', // OFFICIAL — from logo
} as const;

// ════════════════════════════════════════════════════════════════════════
// 2. SEMANTIC ALIASES (use these in components, not raw colors)
// ════════════════════════════════════════════════════════════════════════

export const SEMANTIC = {
  // Status colors
  success: '#10B981',    // emerald-500
  successLight: '#D1FAE5',
  successDark: '#047857',

  warning: '#F5B819',    // amber-500
  warningLight: '#FEF3C7',
  warningDark: '#B45309',

  danger: '#DC2626',     // same as brand red
  dangerLight: '#FEE2E2',
  dangerDark: '#991B1B',

  info: '#3B82F6',       // blue-500
  infoLight: '#DBEAFE',
  infoDark: '#1E40AF',
} as const;

// ════════════════════════════════════════════════════════════════════════
// 3. NEUTRAL PALETTE (surfaces, borders, text)
// ════════════════════════════════════════════════════════════════════════

export const NEUTRAL = {
  white: '#FFFFFF',
  gray50: '#FAFAFA',
  gray100: '#F5F5F5',
  gray200: '#E5E5E5',
  gray300: '#D4D4D4',
  gray400: '#A3A3A3',
  gray500: '#737373',
  gray600: '#525252',
  gray700: '#404040',
  gray800: '#262626',
  gray900: '#171717',
  black: '#000000',
} as const;

// ════════════════════════════════════════════════════════════════════════
// 4. BRAND GRADIENTS (inspired by logo speed lines)
// ════════════════════════════════════════════════════════════════════════

export const GRADIENTS = {
  /** Hero gradient — yellow → red (logo background) */
  hero: 'linear-gradient(135deg, #F5B819 0%, #FBBF24 50%, #DC2626 100%)',

  /** Speed lines — horizontal motion blur effect */
  speed: 'linear-gradient(90deg, transparent 0%, #DC2626 50%, transparent 100%)',

  /** Brand premium — red hover gradient */
  premium: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',

  /** Dark premium — black depth */
  dark: 'linear-gradient(135deg, #0A0A0A 0%, #262626 100%)',

  /** Yellow glow — for CTAs */
  yellowGlow: 'linear-gradient(135deg, #F5B819 0%, #FBBF24 100%)',

  /** Surface elevation — subtle */
  surface: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
} as const;

// ════════════════════════════════════════════════════════════════════════
// 5. TYPOGRAPHY SCALE
// ════════════════════════════════════════════════════════════════════════

export const TYPE = {
  // Font families
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    display: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    arabic: 'Cairo, "Tajawal", system-ui, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Monaco, monospace',
  },

  // Font weights
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Type scale (1.250 modular scale)
  size: {
    '2xs':  { size: '0.6875rem', lineHeight: '1rem',      letterSpacing: '0.04em'   }, // 11px
    xs:    { size: '0.75rem',    lineHeight: '1.125rem',  letterSpacing: '0.02em'   }, // 12px
    sm:    { size: '0.8125rem',  lineHeight: '1.25rem',   letterSpacing: 0           }, // 13px
    base:  { size: '0.9375rem',  lineHeight: '1.4375rem', letterSpacing: 0           }, // 15px
    md:    { size: '1rem',       lineHeight: '1.5rem',    letterSpacing: 0           }, // 16px
    lg:    { size: '1.125rem',   lineHeight: '1.75rem',   letterSpacing: '-0.01em'   }, // 18px
    xl:    { size: '1.25rem',    lineHeight: '1.75rem',   letterSpacing: '-0.01em'   }, // 20px
    '2xl': { size: '1.5rem',     lineHeight: '2rem',      letterSpacing: '-0.015em'  }, // 24px
    '3xl': { size: '1.875rem',   lineHeight: '2.25rem',   letterSpacing: '-0.02em'   }, // 30px
    '4xl': { size: '2.25rem',    lineHeight: '2.5rem',    letterSpacing: '-0.025em'  }, // 36px
    '5xl': { size: '3rem',       lineHeight: '1.1',       letterSpacing: '-0.03em'   }, // 48px
    '6xl': { size: '3.75rem',    lineHeight: '1',         letterSpacing: '-0.04em'   }, // 60px
    display: { size: '4.5rem',   lineHeight: '1',         letterSpacing: '-0.05em'   }, // 72px
  },
} as const;

// ════════════════════════════════════════════════════════════════════════
// 6. SPACING SYSTEM (8pt grid)
// ════════════════════════════════════════════════════════════════════════

export const SPACING = {
  0: '0px',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
  32: '8rem',    // 128px
} as const;

// ════════════════════════════════════════════════════════════════════════
// 7. BORDER RADIUS (consistent across all components)
// ════════════════════════════════════════════════════════════════════════

export const RADIUS = {
  none: '0px',
  xs: '0.25rem',     // 4px — small tags
  sm: '0.5rem',      // 8px — inputs
  md: '0.75rem',     // 12px — buttons
  lg: '1rem',        // 16px — cards
  xl: '1.5rem',      // 24px — large cards, modals
  '2xl': '2rem',     // 32px — hero sections
  '3xl': '3rem',     // 48px — feature cards
  full: '9999px',    // pills, circles
} as const;

// ════════════════════════════════════════════════════════════════════════
// 8. SHADOWS (premium depth, not harsh)
// ════════════════════════════════════════════════════════════════════════

export const SHADOWS = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(10, 10, 10, 0.04)',
  sm: '0 1px 3px 0 rgba(10, 10, 10, 0.06), 0 1px 2px 0 rgba(10, 10, 10, 0.04)',
  md: '0 4px 6px -1px rgba(10, 10, 10, 0.08), 0 2px 4px -1px rgba(10, 10, 10, 0.04)',
  lg: '0 10px 15px -3px rgba(10, 10, 10, 0.08), 0 4px 6px -2px rgba(10, 10, 10, 0.04)',
  xl: '0 20px 25px -5px rgba(10, 10, 10, 0.10), 0 10px 10px -5px rgba(10, 10, 10, 0.03)',
  '2xl': '0 25px 50px -12px rgba(10, 10, 10, 0.20)',
  inner: 'inset 0 2px 4px 0 rgba(10, 10, 10, 0.04)',

  // Brand-specific shadows
  brandRed:    '0 8px 24px -4px rgba(220, 38, 38, 0.40)',
  brandYellow: '0 8px 24px -4px rgba(245, 184, 25, 0.40)',
  brandBlack:  '0 8px 24px -4px rgba(10, 10, 10, 0.40)',

  // Glow effects
  glowRed:    '0 0 0 4px rgba(220, 38, 38, 0.12)',
  glowYellow: '0 0 0 4px rgba(245, 184, 25, 0.18)',
  glowBlack:  '0 0 0 4px rgba(10, 10, 10, 0.08)',
} as const;

// ════════════════════════════════════════════════════════════════════════
// 9. MOTION (60 FPS, GPU-friendly)
// ════════════════════════════════════════════════════════════════════════

export const MOTION = {
  // Durations
  duration: {
    instant: '50ms',
    fast: '150ms',
    base: '200ms',
    medium: '300ms',
    slow: '500ms',
    slower: '750ms',
  },

  // Easing curves
  easing: {
    linear: 'linear',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    silk: 'cubic-bezier(0.16, 1, 0.3, 1)',     // Uber-style smooth
    speed: 'cubic-bezier(0.16, 1, 0.3, 1)',    // logo speed lines
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// ════════════════════════════════════════════════════════════════════════
// 10. Z-INDEX SCALE
// ════════════════════════════════════════════════════════════════════════

export const Z = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  drawer: 40,
  modal: 50,
  popover: 60,
  toast: 70,
  tooltip: 80,
  overlay: 90,
  max: 9999,
} as const;

// ════════════════════════════════════════════════════════════════════════
// 11. COMPONENT SIZING
// ════════════════════════════════════════════════════════════════════════

export const SIZE = {
  button: {
    xs: { h: '1.75rem',  px: '0.625rem', text: 'xs'    },
    sm: { h: '2.25rem',  px: '0.875rem', text: 'sm'    },
    md: { h: '2.75rem',  px: '1.125rem', text: 'base'  },
    lg: { h: '3.25rem',  px: '1.5rem',   text: 'md'    },
    xl: { h: '3.75rem',  px: '2rem',     text: 'lg'    },
  },
  input: {
    sm: { h: '2.25rem',  px: '0.75rem'  },
    md: { h: '2.75rem',  px: '1rem'     },
    lg: { h: '3.25rem',  px: '1.125rem' },
  },
  avatar: {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28',
  },
  icon: {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
  },
  touchTarget: '44px', // Apple HIG minimum
} as const;

// ════════════════════════════════════════════════════════════════════════
// 12. BREAKPOINTS
// ════════════════════════════════════════════════════════════════════════

export const BREAKPOINTS = {
  xs: '475px',     // small phones
  sm: '640px',     // large phones
  md: '768px',     // tablets
  lg: '1024px',    // laptops
  xl: '1280px',    // desktops
  '2xl': '1536px', // large screens
} as const;

// ════════════════════════════════════════════════════════════════════════
// 13. SAFE AREAS (iOS notch, gesture bar)
// ════════════════════════════════════════════════════════════════════════

export const SAFE = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
} as const;

// ════════════════════════════════════════════════════════════════════════
// 14. EXPORT THE COMPLETE DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════════════

export const tokens = {
  brand: {
    yellow: BRAND_YELLOW,
    red: BRAND_RED,
    black: BRAND_BLACK,
  },
  semantic: SEMANTIC,
  neutral: NEUTRAL,
  gradients: GRADIENTS,
  type: TYPE,
  spacing: SPACING,
  radius: RADIUS,
  shadow: SHADOWS,
  motion: MOTION,
  z: Z,
  size: SIZE,
  bp: BREAKPOINTS,
  safe: SAFE,
} as const;

export default tokens;
