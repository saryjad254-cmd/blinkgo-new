/**
 * Motion Design Tokens
 * ────────────────────
 * Centralized motion language for BlinkGo.
 *
 * Inspired by:
 *   - Apple Human Interface Guidelines (iOS / macOS)
 *   - Material Design 3 motion
 *   - Wolt / Uber Eats micro-interactions
 *
 * All durations use cubic-bezier easings — never linear.
 * Animations should be <300ms for micro, <500ms for transitions.
 */

export const motion = {
  // ── Durations (ms) ─────────────────────────────────────
  duration: {
    instant: 100,
    fast: 180,
    normal: 280,
    slow: 420,
    page: 600,
  },

  // ── Easings (cubic-bezier) ─────────────────────────────
  // Standard easings: smooth, natural, never robotic.
  ease: {
    // Default — like iOS
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    // Decelerate — things settling in
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    // Accelerate — things moving out
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
    // Sharp — quick response
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    // Bounce — playful
    bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    // Emphasized — for hero animations
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },

  // ── Stagger amounts (ms) ──────────────────────────────
  stagger: {
    fast: 30,
    normal: 60,
    slow: 100,
  },
} as const;

// ── CSS variable name helpers ─────────────────────────────
export const motionVar = {
  duration: (name: keyof typeof motion.duration) => `var(--motion-duration-${name})`,
  ease: (name: keyof typeof motion.ease) => `var(--motion-ease-${name})`,
};

// ── Tailwind animation classes (matched in globals.css) ────
export const motionClass = {
  // Entry
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  slideDown: 'animate-slide-down',
  slideInRight: 'animate-slide-in-right',
  slideInLeft: 'animate-slide-in-left',
  scaleIn: 'animate-scale-in',
  zoomIn: 'animate-zoom-in',

  // Exit
  fadeOut: 'animate-fade-out',

  // Attention
  pulse: 'animate-pulse',
  ping: 'animate-ping',
  bounce: 'animate-bounce',
  spin: 'animate-spin',
  shake: 'animate-shake',
  wiggle: 'animate-wiggle',

  // Premium
  shimmer: 'animate-shimmer',
  glow: 'animate-glow',
  float: 'animate-float',
  breathe: 'animate-breathe',
  tilt3d: 'animate-tilt-3d',
} as const;

// ── Performance hints ────────────────────────────────────
// Use transform + opacity for 60fps. Never animate width/height/top/left.
export const gpuProps = {
  transform: 'translateZ(0)',
  willChange: 'transform, opacity',
  backfaceVisibility: 'hidden' as const,
};

// ── Reduced motion respect ───────────────────────────────
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
