/**
 * Map Animation Utilities
 * ───────────────────────
 * Smooth animations for map markers and routes.
 * 
 * Uses easing functions and requestAnimationFrame for buttery 60fps.
 */

export type EasingFunction = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  },
};

export interface AnimationOptions {
  duration_ms: number;
  easing?: EasingFunction;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
}

/**
 * Run a single animation from 0 to 1.
 */
export function animate(options: AnimationOptions): () => void {
  const { duration_ms, easing = easings.easeOutCubic, onUpdate, onComplete } = options;
  const startTime = performance.now();
  let raf = 0;
  let cancelled = false;

  function step(now: number) {
    if (cancelled) return;
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration_ms);
    const eased = easing(t);
    onUpdate(eased);
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  }

  raf = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

/**
 * Animate a number from `from` to `to`.
 */
export function animateValue(
  from: number,
  to: number,
  duration_ms: number,
  onUpdate: (v: number) => void,
  easing: EasingFunction = easings.easeOutCubic,
): () => void {
  return animate({
    duration_ms,
    easing,
    onUpdate: (t) => onUpdate(from + (to - from) * t),
  });
}

/**
 * Animate lat/lng along a path.
 */
export function animatePath(
  path: Array<{ lat: number; lng: number }>,
  duration_ms: number,
  onUpdate: (point: { lat: number; lng: number }) => void,
  easing: EasingFunction = easings.easeInOutCubic,
): () => void {
  if (path.length === 0) return () => {};
  if (path.length === 1) {
    onUpdate(path[0]);
    return () => {};
  }

  const totalSteps = path.length - 1;
  return animate({
    duration_ms,
    easing,
    onUpdate: (t) => {
      const exact = t * totalSteps;
      const i = Math.floor(exact);
      const frac = exact - i;
      const a = path[i];
      const b = path[Math.min(i + 1, path.length - 1)];
      onUpdate({
        lat: a.lat + (b.lat - a.lat) * frac,
        lng: a.lng + (b.lng - a.lng) * frac,
      });
    },
  });
}

/**
 * Smooth marker transitions between two positions.
 * Returns a function that updates the marker position over time.
 */
export class MarkerAnimator {
  private currentLat = 0;
  private currentLng = 0;
  private targetLat = 0;
  private targetLng = 0;
  private listeners: Array<(pos: { lat: number; lng: number }) => void> = [];
  private raf = 0;
  private lastFrame = 0;
  private duration = 1500; // ms

  setPosition(lat: number, lng: number, duration_ms = 1500) {
    this.currentLat = this.targetLat;
    this.currentLng = this.targetLng;
    this.targetLat = lat;
    this.targetLng = lng;
    this.duration = duration_ms;
    this.lastFrame = performance.now();
    if (!this.raf) {
      this.tick();
    }
  }

  private tick = () => {
    this.raf = 0;
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    const t = Math.min(1, dt / this.duration);
    const eased = easings.easeInOutCubic(t);
    const newLat = this.currentLat + (this.targetLat - this.currentLat) * eased;
    const newLng = this.currentLng + (this.targetLng - this.currentLng) * eased;
    for (const fn of this.listeners) {
      fn({ lat: newLat, lng: newLng });
    }
    if (t < 1) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  subscribe(fn: (pos: { lat: number; lng: number }) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners = [];
  }
}
