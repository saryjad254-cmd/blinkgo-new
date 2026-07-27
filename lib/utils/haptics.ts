/**
 * Haptic feedback utility for driver actions.
 * Falls back gracefully on unsupported devices.
 *
 * Designed for long delivery sessions: short, distinct patterns
 * that don't fatigue the driver or require attention.
 */

export type HapticPattern = 'success' | 'warning' | 'error' | 'light' | 'medium' | 'heavy' | 'tap' | 'order-arrived' | 'order-complete';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  light: 10,
  medium: 25,
  heavy: 50,
  success: [15, 50, 25],
  warning: [30, 40, 30],
  error: [50, 30, 50, 30, 50],
  'order-arrived': [40, 60, 40],
  'order-complete': [20, 40, 20, 40, 60],
};

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

export function haptic(pattern: HapticPattern = 'tap'): void {
  if (typeof window === 'undefined') return;
  if (!enabled) return;
  // Respect user preference
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === 'function') {
    try {
      nav.vibrate(PATTERNS[pattern]);
    } catch {
      // Some browsers throw on certain patterns
    }
  }
}
