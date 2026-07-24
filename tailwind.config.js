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
        arabic: ['var(--font-cairo)', 'Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        display: ['var(--font-cairo)', 'Cairo', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        cairo: ['var(--font-cairo)', 'Cairo', 'system-ui', 'sans-serif'],
        inter: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
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
      // v8.0 NEW BRAND IDENTITY — racing red + golden yellow + deep ink
      // Inspired by the BlinkGo speed poster: bold, energetic, German.
      // ════════════════════════════════════════════════════════════════
      colors: {
        // Brand: racing red (speed, urgency, premium German automotive)
        'brand-yellow': {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F5B819',  // OFFICIAL BLINKGO YELLOW (from logo)
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        'brand-red': {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#DC2626',  // OFFICIAL BLINKGO RED (from logo)
          600: '#B91C1C',
          700: '#991B1B',
          800: '#7F1D1D',
          900: '#7F1D1D',
        },
        'brand-black': {
          50:  '#F5F5F5',
          100: '#E5E5E5',
          200: '#D4D4D4',
          300: '#A3A3A3',
          400: '#737373',
          500: '#525252',
          600: '#404040',
          700: '#262626',
          800: '#171717',
          900: '#0A0A0A',  // OFFICIAL BLINKGO BLACK (from logo)
        },
        brand: {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#DC2626',   // primary brand — official BlinkGo racing red
          600: '#DC2626',   // hover/active
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        // Brand color tokens (mirror of CSS vars for utility classes)
        'brand-red': '#DC2626',
        'brand-red-hover': '#B91C1C',
        'brand-red-active': '#991B1B',
        'brand-yellow': '#F5B819',
        'brand-yellow-hover': '#D97706',
        'brand-yellow-active': '#B45309',
        'brand-black': '#0A0A0A',
        'brand-black-hover': '#262626',
        'brand-black-active': '#404040',

// Accent: golden yellow (warmth, speed, appetite)
        accent: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F5B819',   // primary accent — official BlinkGo yellow
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        // Neutral: deep ink scale (rich blacks, premium contrast)
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
          900:  '#09090B',  // pure black for backgrounds
        },
        // Semantic
        success: { DEFAULT: '#10B981', light: '#34D399', dark: '#059669' },
        warning: { DEFAULT: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
        danger:  { DEFAULT: '#EF4444', light: '#F87171', dark: '#DC2626' },
        info:    { DEFAULT: '#3B82F6', light: '#60A5FA', dark: '#2563EB' },

        // Premium accents (for order statuses, badges, special moments)
        rose:    { DEFAULT: '#FB7185', light: '#FDA4AF', dark: '#E11D48' },  // pink — for promotions/loved
        emerald: { DEFAULT: '#10B981', light: '#34D399', dark: '#047857' },  // cash/money green
        violet:  { DEFAULT: '#A855F7', light: '#C084FC', dark: '#7E22CE' },  // premium tier (Uber One)
        cyan:    { DEFAULT: '#06B6D4', light: '#67E8F9', dark: '#0891B2' },  // live tracking (Careem)
        lime:    { DEFAULT: '#84CC16', light: '#A3E635', dark: '#4D7C0F' },  // ready/fresh
        gold:    { DEFAULT: '#EAB308', light: '#FACC15', dark: '#A16207' },  // premium tier badge
        // Surfaces (dark mode default)
        bg: {
          DEFAULT: 'var(--bg)',
          subtle:   'var(--bg-subtle)',
          elevated: 'var(--bg-elevated)',
          card:     'var(--bg-card)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          light:   'var(--surface-light)',
          raised:  'var(--surface-raised)',
        },
        // Borders
        edge: {
          DEFAULT: 'var(--border)',
          light:   'var(--border)',
          strong:  'var(--border-strong)',
          brand:   'rgba(220, 38, 38, 0.35)',
        },
        // Text
        text: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          disabled:  'var(--text-disabled)',
        },
        // Back-compat aliases (don't break existing code)
        primary: {
          DEFAULT: '#FF6B1A',
          dark:    '#E5560A',
          light:   '#FF8A3D',
        },
        secondary: {
          DEFAULT: '#10B981',
          light:   '#34D399',
          dark:    '#059669',
        },
        ocean: {
          DEFAULT: '#3B82F6',
          light:   '#60A5FA',
          dark:    '#2563EB',
        },
        speed: {
          red:    '#E53935',
          orange: '#FF6B1A',
          yellow: '#F59E0B',
        },
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
        'glow':         '0 8px 28px -4px rgba(239, 68, 68, 0.45)',
        'glow-strong':  '0 12px 36px -4px rgba(239, 68, 68, 0.65)',
        'glow-accent':  '0 8px 28px -4px rgba(245, 158, 11, 0.45)',
        // Status glows
        'glow-success': '0 8px 28px -4px rgba(16, 185, 129, 0.45)',
        'glow-info':    '0 8px 28px -4px rgba(6, 182, 212, 0.45)',
        'glow-violet':  '0 8px 28px -4px rgba(168, 85, 247, 0.45)',
        'inner-glow':   'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'press':        'inset 0 1px 2px rgba(0,0,0,0.3)',
        'premium':      '0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08), 0 24px 48px -12px rgba(0,0,0,0.12)',
        'premium-lg':   '0 4px 8px rgba(0,0,0,0.08), 0 12px 24px rgba(0,0,0,0.10), 0 32px 64px -16px rgba(0,0,0,0.16)',
        // Backward-compat aliases
        'speed-glow':    '0 8px 28px -4px rgba(239, 68, 68, 0.45)',
        'speed-glow-strong': '0 12px 36px -4px rgba(239, 68, 68, 0.65)',
        // FIX (v84 UI audit): the 68 call sites using raw `shadow-sm/md/lg/xl`
        // were rendering Tailwind's DEFAULT grey shadows — nearly invisible on
        // this dark theme and inconsistent with the speed-* elevation scale
        // used everywhere else. Alias them onto the design-system scale so all
        // cards share one depth language.
        sm:   '0 1px 2px rgba(0,0,0,0.16)',
        DEFAULT: '0 2px 8px rgba(0,0,0,0.20), 0 0 0 1px rgba(255,255,255,0.04)',
        md:   '0 8px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04)',
        lg:   '0 16px 40px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)',
        xl:   '0 24px 60px rgba(0,0,0,0.45)',
        '2xl': '0 24px 60px rgba(0,0,0,0.45)',
      },

      // ════════════════════════════════════════════════════════════════
      // GRADIENTS — BlinkGo signature gradients
      // ════════════════════════════════════════════════════════════════
      backgroundImage: {
        // v8.0 NEW BRAND — racing red → golden yellow diagonal
        'brand-gradient':    'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #EF4444 0%, #FBBF24 100%)',
        'brand-gradient-diagonal': 'linear-gradient(45deg, #DC2626 0%, #F59E0B 100%)',
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
