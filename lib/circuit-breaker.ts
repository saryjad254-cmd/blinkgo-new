/**
 * Circuit Breaker Pattern
 * ───────────────────────
 * Prevents cascading failures from external services.
 *
 * States:
 *  - CLOSED: Normal operation, calls go through
 *  - OPEN: Failing too much, reject immediately
 *  - HALF_OPEN: Test if service recovered
 *
 * Usage:
 *   const breaker = new CircuitBreaker('stripe', { failureThreshold: 5, resetMs: 30000 });
 *   const result = await breaker.execute(() => stripe.charges.create({...}));
 */

interface BreakerConfig {
  /** Number of failures before opening */
  failureThreshold: number;
  /** Time to wait before trying again (half-open) */
  resetMs: number;
  /** Optional: number of successes in half-open to close */
  successThreshold?: number;
  /** Timeout for individual call */
  timeoutMs?: number;
}

type BreakerState = 'closed' | 'open' | 'half_open';

interface BreakerStats {
  state: BreakerState;
  failures: number;
  successes: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  rejected: number;
  lastFailure: string | null;
  lastFailureReason: string | null;
  openedAt: number | null;
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly name: string) {
    super(`Circuit breaker "${name}" is open`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerTimeoutError extends Error {
  constructor(public readonly name: string, public readonly timeoutMs: number) {
    super(`Circuit breaker "${name}" timed out after ${timeoutMs}ms`);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private successes = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private rejected = 0;
  private lastFailure: string | null = null;
  private lastFailureReason: string | null = null;
  private openedAt: number | null = null;
  private nextAttempt = 0;

  constructor(
    private readonly name: string,
    private readonly config: BreakerConfig,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // State transitions
    if (this.state === 'open') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'half_open';
        this.successes = 0;
      } else {
        this.rejected++;
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    try {
      const result = await this.runWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  private async runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.timeoutMs) return fn();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CircuitBreakerTimeoutError(this.name, this.config.timeoutMs!));
      }, this.config.timeoutMs);

      fn().then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  private onSuccess() {
    this.totalSuccesses++;
    this.failures = 0;
    if (this.state === 'half_open') {
      this.successes++;
      const threshold = this.config.successThreshold ?? 1;
      if (this.successes >= threshold) {
        this.state = 'closed';
        this.openedAt = null;
      }
    }
  }

  private onFailure(err: Error) {
    this.totalFailures++;
    this.failures++;
    this.lastFailure = new Date().toISOString();
    this.lastFailureReason = err.message;

    if (this.state === 'half_open') {
      // Failed in half-open, re-open
      this.open();
    } else if (this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  private open() {
    this.state = 'open';
    this.openedAt = Date.now();
    this.nextAttempt = Date.now() + this.config.resetMs;
  }

  stats(): BreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      rejected: this.rejected,
      lastFailure: this.lastFailure,
      lastFailureReason: this.lastFailureReason,
      openedAt: this.openedAt,
    };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.openedAt = null;
  }
}

// Pre-configured breakers for common external services
export const breakers = {
  stripe: new CircuitBreaker('stripe', {
    failureThreshold: 5,
    resetMs: 30_000,
    timeoutMs: 10_000,
  }),
  googleMaps: new CircuitBreaker('google_maps', {
    failureThreshold: 10,
    resetMs: 60_000,
    timeoutMs: 5_000,
  }),
  supabase: new CircuitBreaker('supabase', {
    failureThreshold: 20,
    resetMs: 15_000,
    timeoutMs: 8_000,
  }),
  email: new CircuitBreaker('email', {
    failureThreshold: 5,
    resetMs: 60_000,
    timeoutMs: 10_000,
  }),
  push: new CircuitBreaker('push', {
    failureThreshold: 10,
    resetMs: 30_000,
    timeoutMs: 5_000,
  }),
};

export function getAllBreakerStats(): Record<string, BreakerStats> {
  return {
    stripe: breakers.stripe.stats(),
    google_maps: breakers.googleMaps.stats(),
    supabase: breakers.supabase.stats(),
    email: breakers.email.stats(),
    push: breakers.push.stats(),
  };
}
