/** @type {import('tailwindcss').Config} */
/**
 * BlinkGo Premium Design System
 * ─────────────────────────────
 * Built to feel like a world-class delivery platform while keeping our own
 * unique identity (BlinkGo orange + ink-black + warm coral accent).
 *
 * Foundation: 8pt grid, dual typography (Cairo AR / Inter DE+EN),
 * 1.25 modular scale, 3 motion tokens, soft-depth shadows.
 */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ════════════════════════════════════════════════════════════════
      // 8-PT SPACING — already in tailwind default, exposed for clarity
      // 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 5 = 20px, 6 = 24px, 8 = 32px
      // ════════════════════════════════════════════════════════════════

      // ════════════════════════════════════════════════════════════════
      // TYPOGRAPHY — 1.25 modular scale, Cairo (AR) + Inter (DE/EN)
      // ════════════════════════════════════════════════════════════════
      fontFamily: {
        // PRECISION DELIVERY DNA: single font family (IBM Plex Sans)
        // Latin: IBM Plex Sans / Arabic: IBM Plex Sans Arabic
        sans: ['var(--font-ibm-plex)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-ibm-plex-arabic)', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        display: ['var(--font-ibm-plex)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex)', 'IBM Plex Sans', 'system-ui', 'monospace'],
        ibm: ['var(--font-ibm-plex)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        legacy: ['var(--font-ibm-plex)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Compact 1.125 scale (saves vertical real estate, looks denser and more premium)
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],     // 11px — micro labels
        xs:   ['0.75rem',   { lineHeight: '1.125rem', letterSpacing: '0.02em' }],   // 12px — secondary
        sm:   ['0.8125rem', { lineHeight: '1.25rem' }],                            // 13px — body small
        base: ['0.9375rem', { lineHeight: '1.4375rem' }],                          // 15px — body
        md:   ['1rem',      { lineHeight: '1.5rem' }],                             // 16px — body large
        lg:   ['1.125rem',  { lineHeight: '1.75rem' }],                            // 18px — H3
        xl:   ['1.25rem',   { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],  // 20px — H2
        '2xl': ['1.5rem',   { lineHeight: '2rem',    letterSpacing: '-0.015em' }], // 24px — H1
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],  // 30px — display
        '4xl': ['2.25rem',  { lineHeight: '2.5rem',   letterSpacing: '-0.025em' }], // 36px — display lg
        '5xl': ['3rem',     { lineHeight: '1.1',      letterSpacing: '-0.03em' }],  // 48px — hero
      },
      fontWeight: {
        thin: '200',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
        black: '900',
      },

      // ════════════════════════════════════════════════════════════════
      // COLOR SYSTEM — semantic, theme-aware
      // ════════════════════════════════════════════════════════════════
      // v4 EXACT VISUAL — exact match to 4 reference images
      // Source of truth: attached mockups (4 approved visual targets)
      // ════════════════════════════════════════════════════════════════
      colors: {
        // ═══════════════════════════════════════════════════════════════
        // EXACT VISUAL DIRECTION — v4 (deeper, more saturated)
        // ═══════════════════════════════════════════════════════════════
        // Canvas: #08090B (deeper black)
        // Surface 1: #0E1014
        // Surface 2: #15181D
        // Surface 3: #1B1F25
        // Primary Red: #E10600
        // Active Red: #FF2A2A (brighter for selected states)
        // Golden Yellow: #FFC107
        canvas:    'var(--canvas)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'surface-card': 'var(--surface-card)',
        ink: {
          DEFAULT: '#F7F7F5',
          primary: '#F7F7F5',
          secondary: '#A9ADB5',
          muted: '#6B6F77',
          subtle: '#4A4A52',
          inverse: '#08090B',
          500: '#2A2E35',
          600: '#22262C',
          700: '#1B1F25',
          800: '#15181D',
          900: '#08090B',
        },
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        'text-subtle':    'var(--text-subtle)',
        'border':         'var(--border)',
        'border-strong':  'var(--border-strong)',
        hairline:         'var(--hairline)',

        // Brand
        brand: {
          DEFAULT: '#E10600',
          50:  '#FFF1F0',
          100: '#FFD9D6',
          200: '#FFB3AC',
          300: '#FF7A6E',
          400: '#FF4131',
          500: '#E10600',
          600: '#C70500',
          700: '#A30500',
          800: '#7F0300',
          900: '#5A0200',
          hover: '#FF2A2A',
          active: '#C70500',
        },
        'brand-red': {
          DEFAULT: '#E10600',
          50: '#FFF1F0',
          100: '#FFD9D6',
          200: '#FFB3AC',
          300: '#FF7A6E',
          400: '#FF4131',
          500: '#E10600',
          600: '#C70500',
          700: '#A30500',
          800: '#7F0300',
          900: '#5A0200',
          hover: '#FF2A2A',
          active: '#C70500',
          dark: '#A30500',
        },
        'brand-yellow': {
          DEFAULT: '#FFC107',
          50:  '#FFFBEA',
          100: '#FFF3C4',
          200: '#FFE788',
          300: '#FFD340',
          400: '#FFC107',
          500: '#FFC107',
          600: '#E6B000',
          700: '#CC9D00',
          800: '#A37C00',
          900: '#7A5C00',
          hover: '#FFD340',
          active: '#E6B000',
        },

        // Status (semantic only)
        'status-open':    '#22C55E',
        'status-busy':    '#F59E0B',
        'status-closed':  '#6B7280',
        'status-success': '#22C55E',
        'status-error':   '#EF4444',
        'status-warning': '#F59E0B',
        'status-info':    '#3B82F6',

        accent: {
          DEFAULT: '#FFC107',
          400: '#FFD340',
          500: '#FFC107',
          600: '#E6B000',
        },

        // Legacy aliases (mapped to new tokens so old class names still work)
        'bg':         'var(--surface-1)',
        'bg-card':    'var(--surface-card)',
        'bg-elevated':'var(--surface-2)',
        'bg-subtle':  'var(--surface-2)',
        'surface':    'var(--surface-1)',
        'surface-light': 'var(--surface-3)',
        text: 'var(--text-primary)',
        edge: 'var(--border)',
        'edge-light': 'var(--border-strong)',
        success: '#22C55E',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#3B82F6',
      },

      // ════════════════════════════════════════════════════════════════
      // BORDER RADIUS — gentler scale, premium feel
      // ════════════════════════════════════════════════════════════════
      borderRadius: {
        none: '0',
        xs:   '6px',
        sm:   '10px',
        DEFAULT: '14px',
        md:   '14px',
        lg:   '20px',
        xl:   '28px',
        '2xl': '36px',
        '3xl': '48px',
        pill: '999px',
        // Legacy aliases
        'sm': '10px',
        'rounded': '14px',
      },

      // ════════════════════════════════════════════════════════════════
      // SHADOWS — soft, layered depth (not harsh)
      // ════════════════════════════════════════════════════════════════
      boxShadow: {
        none: 'none',
        'speed-sm':  '0 1px 2px rgba(0,0,0,0.16)',
        'speed':     '0 2px 8px rgba(0,0,0,0.20), 0 0 0 1px rgba(255,255,255,0.04)',
        'speed-md':  '0 8px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04)',
        'speed-lg':  '0 16px 40px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)',
        'speed-xl':  '0 24px 60px rgba(0,0,0,0.45)',
        // Brand glow (red)
        'glow':         '0 8px 28px -4px rgba(225, 6, 0, 0.42)',
        'glow-strong':  '0 12px 36px -4px rgba(225, 6, 0, 0.58)',
        'glow-accent':  '0 8px 28px -4px rgba(255, 193, 7, 0.40)',
        // Status glows
        'glow-success': '0 8px 28px -4px rgba(16, 185, 129, 0.45)',
        'glow-info':    '0 8px 28px -4px rgba(6, 182, 212, 0.45)',
        'glow-violet':  '0 8px 28px -4px rgba(168, 85, 247, 0.45)',
        'inner-glow':   'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'press':        'inset 0 1px 2px rgba(0,0,0,0.3)',
        'premium':      '0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08), 0 24px 48px -12px rgba(0,0,0,0.12)',
        'premium-lg':   '0 4px 8px rgba(0,0,0,0.08), 0 12px 24px rgba(0,0,0,0.10), 0 32px 64px -16px rgba(0,0,0,0.16)',
        // Backward-compat aliases
        'speed-glow':    '0 8px 28px -4px rgba(225, 6, 0, 0.42)',
        'speed-glow-strong': '0 12px 36px -4px rgba(225, 6, 0, 0.58)',
      },

      // ════════════════════════════════════════════════════════════════
      // GRADIENTS — BlinkGo signature gradients
      // ════════════════════════════════════════════════════════════════
      backgroundImage: {
        // v8.0 NEW BRAND — racing red → golden yellow diagonal
        'brand-gradient':    'linear-gradient(135deg, #FF2A2A 0%, #E10600 52%, #A30500 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #FF4131 0%, #E10600 100%)',
        'brand-gradient-diagonal': 'linear-gradient(45deg, #E10600 0%, #A30500 100%)',
        // Aurora: used for cards and modals (red → gold)
        'aurora':            'linear-gradient(135deg, rgba(220,38,38,0.18) 0%, rgba(245,158,11,0.10) 100%)',
        // Accent surfaces
        'success-gradient':  'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'info-gradient':     'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
        // Premium status gradients (DoorDash, Uber, Wolt style)
        'premium-gradient':  'linear-gradient(135deg, #7E22CE 0%, #A855F7 50%, #C084FC 100%)', // VIP / Uber One style
        'live-gradient':     'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)', // Live tracking (Careem)
        'tip-gradient':      'linear-gradient(135deg, #10B981 0%, #34D399 100%)', // Tip jar (DoorDash)
        'love-gradient':     'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)', // Promo / Loved (Talabat)
        'cool-gradient':     'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)', // Cool/info (Wolt)
        'gold-gradient':     'linear-gradient(135deg, #EAB308 0%, #F59E0B 50%, #FBBF24 100%)', // Premium tier
        // Role-card gradients (v8 palette)
        'ocean-gradient':    'linear-gradient(135deg, #3B82F6 0%, #00B4FF 100%)',
        'speed-gradient':    'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
        'speed-fire':        'linear-gradient(135deg, #B91C1C 0%, #DC2626 100%)',
        'speed-sun':         'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
        'green-gradient':    'linear-gradient(135deg, #10B981 0%, #00B4FF 100%)',
        'purple-gradient':   'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)',
        // Glass overlay
        'glass':             'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)',
        'glass-strong':      'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
        // Sheen / shine
        'sheen':             'linear-gradient(110deg, transparent 0%, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%, transparent 100%)',
      },

      // ════════════════════════════════════════════════════════════════
      // MOTION — 3 named tokens, used everywhere
      // ════════════════════════════════════════════════════════════════
      transitionTimingFunction: {
        'snap':    'cubic-bezier(0.2, 0.0, 0.0, 1.0)',     // exit / dismiss
        'spring':  'cubic-bezier(0.34, 1.56, 0.64, 1.00)',  // overshoot (delight)
        'silk':    'cubic-bezier(0.4, 0.0, 0.2, 1.0)',     // enter / main
        'smooth':  'cubic-bezier(0.4, 0, 0.6, 1)',          // state change
      },
      transitionDuration: {
        '0':  '0ms',
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
        '700': '700ms',
        '1000': '1000ms',
      },
      keyframes: {
        // Entry / Exit
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeOut:   { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        slideUp:   { '0%': { transform: 'translate3d(0, 16px, 0)', opacity: '0' }, '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' } },
        slideDown: { '0%': { transform: 'translate3d(0, -16px, 0)', opacity: '0' }, '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' } },
        slideInRight: { '0%': { transform: 'translate3d(16px, 0, 0)', opacity: '0' }, '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' } },
        slideInLeft:  { '0%': { transform: 'translate3d(-16px, 0, 0)', opacity: '0' }, '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' } },
        scaleIn:   { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        // Sheet (mobile bottom sheet)
        sheetUp:   { '0%': { transform: 'translate3d(0, 100%, 0)' }, '100%': { transform: 'translate3d(0, 0, 0)' } },
        // Pulse / Glow
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 107, 26, 0.35)' },
          '50%':      { boxShadow: '0 0 40px rgba(255, 107, 26, 0.55)' },
        },
        pulseOnce: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        pulseDot:  { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.5', transform: 'scale(0.92)' } },
        breathe:   { '0%, 100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        // Skeleton
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        // Spinner variants
        spin:      { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        // Bounce / Spring
        bounceIn: {
          '0%':   { transform: 'scale(0.3)', opacity: '0' },
          '50%':  { transform: 'scale(1.08)', opacity: '1' },
          '70%':  { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        wiggle:    { '0%, 100%': { transform: 'rotate(-2deg)' }, '50%': { transform: 'rotate(2deg)' } },
        // Map / marker
        bounceY:   { '0%, 100%': { transform: 'translate3d(0, 0, 0)' }, '50%': { transform: 'translate3d(0, -6px, 0)' } },
        // Toast
        toastIn:   { '0%': { transform: 'translate3d(0, 100%, 0)', opacity: '0' }, '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' } },
        toastOut:  { '0%': { transform: 'translate3d(0, 0, 0)', opacity: '1' }, '100%': { transform: 'translate3d(0, 100%, 0)', opacity: '0' } },
        // Live indicator
        pingSoft:  { '0%': { transform: 'scale(1)', opacity: '0.6' }, '100%': { transform: 'scale(2)', opacity: '0' } },
      },
      animation: {
        'fade-in':      'fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'fade-out':     'fadeOut 150ms cubic-bezier(0.2, 0, 0, 1) forwards',
        'slide-up':     'slideUp 240ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-down':   'slideDown 240ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-right':  'slideInRight 240ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-left':   'slideInLeft 240ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'scale-in':     'scaleIn 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'sheet-up':     'sheetUp 360ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'pulse-glow':   'pulseGlow 2s ease-in-out infinite',
        'pulse-once':   'pulseOnce 500ms ease-in-out 1',
        'pulse-dot':    'pulseDot 1.5s ease-in-out infinite',
        'breathe':      'breathe 2s ease-in-out infinite',
        'shimmer':      'shimmer 1.6s linear infinite',
        'spin-slow':    'spin 3s linear infinite',
        'bounce-in':    'bounceIn 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'wiggle':       'wiggle 600ms ease-in-out',
        'bounce-y':     'bounceY 1.6s ease-in-out infinite',
        'toast-in':     'toastIn 240ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'toast-out':    'toastOut 180ms cubic-bezier(0.2, 0, 0, 1)',
        'ping-soft':    'pingSoft 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },

      // ════════════════════════════════════════════════════════════════
      // BACKDROP BLUR — for glass cards
      // ════════════════════════════════════════════════════════════════
      backdropBlur: {
        xs: '2px',
      },

      // ════════════════════════════════════════════════════════════════
      // SAFE AREAS — for mobile
      // ════════════════════════════════════════════════════════════════
      padding: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top':    'env(safe-area-inset-top)',
      },

      // ════════════════════════════════════════════════════════════════
      // Z-INDEX SCALE
      // ════════════════════════════════════════════════════════════════
      zIndex: {
        hide: '-1',
        base: '0',
        raised: '10',
        sticky: '20',
        nav: '30',
        overlay: '40',
        modal: '50',
        toast: '60',
        tooltip: '70',
        max: '9999',
      },
    },
  },
  plugins: [],
};
