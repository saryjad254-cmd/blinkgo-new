/**
 * Reliability Patterns — Production-Grade Resilience
 * ──────────────────────────────────────────────────
 * Battle-tested patterns for building resilient services:
 *  - Retry with exponential backoff + jitter
 *  - Circuit breaker (delegates to lib/circuit-breaker.ts)
 *  - Bulkhead (concurrency limiting)
 *  - Timeout (per-operation)
 *  - Fallback (graceful degradation)
 *  - Hedging (duplicate request, take first response)
 *  - Health check
 *
 * Designed for the 8 Fallacies of Distributed Computing.
 */

import { logger } from '@/lib/logging';
import { breakers, CircuitBreaker } from '@/lib/circuit-breaker';

// ── Retry with exponential backoff + jitter ──

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: number;
  retryOn?: (err: unknown) => boolean;
  timeoutMs?: number;
  name?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: 0.1,
  retryOn: () => true,
  timeoutMs: 10_000,
  name: 'operation',
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await withTimeout(operation, opts.timeoutMs, opts.name);
      if (attempt > 1) {
        logger.info('Retry succeeded', { name: opts.name, attempt });
      }
      return result;
    } catch (e) {
      lastError = e;
      if (!opts.retryOn(e) || attempt === opts.maxAttempts) {
        if (attempt === opts.maxAttempts) {
          logger.warn('Retry exhausted', {
            name: opts.name,
            attempts: attempt,
            error: (e as Error).message,
          });
        }
        throw e;
      }
      const jitterAmount = delay * opts.jitter * (Math.random() * 2 - 1);
      const sleepMs = Math.max(0, Math.floor(delay + jitterAmount));
      logger.debug('Retrying after error', {
        name: opts.name,
        attempt,
        sleep_ms: sleepMs,
        error: (e as Error).message,
      });
      await sleep(sleepMs);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

// ── Timeout ──

export class TimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`Operation "${operationName}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, name = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(name, timeoutMs));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── Bulkhead ──

export class Bulkhead {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(
    private maxConcurrent: number = 10,
    private maxQueue: number = 100
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueue) {
        throw new Error('Bulkhead saturated');
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) next();
    }
  }

  getActive(): number {
    return this.active;
  }
}

// ── Fallback ──

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => T | Promise<T>,
  options: { name?: string; logError?: boolean } = {}
): Promise<T> {
  try {
    return await primary();
  } catch (e) {
    if (options.logError !== false) {
      logger.warn('Primary operation failed, using fallback', {
        name: options.name,
        error: (e as Error).message,
      });
    }
    return await fallback();
  }
}

// ── Hedging ──

export async function withHedging<T>(
  operation: () => Promise<T>,
  options: { delayMs?: number; maxAttempts?: number } = {}
): Promise<T> {
  const { delayMs = 50, maxAttempts = 2 } = options;
  const promises: Promise<T>[] = [operation()];

  for (let i = 1; i < maxAttempts; i++) {
    promises.push(
      sleep(delayMs * i).then(operation)
    );
  }

  return new Promise<T>((resolve, reject) => {
    let resolved = false;
    let pending = promises.length;

    for (const p of promises) {
      p.then(
        (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
          pending--;
        },
        () => {
          pending--;
          if (pending === 0 && !resolved) {
            reject(new Error('All hedged requests failed'));
          }
        }
      );
    }
  });
}

// ── Combined resilience ──

export interface ResilienceOptions {
  breakerName?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fallback?: () => unknown;
  name: string;
}

export async function withResilience<T>(
  operation: () => Promise<T>,
  options: ResilienceOptions
): Promise<T> {
  const { name, breakerName, timeoutMs = 10_000, maxRetries = 2, fallback } = options;

  const executeOnce = async () => {
    if (breakerName) {
      const breaker = (breakers as any)[breakerName];
      if (!breaker) {
        return withTimeout(operation, timeoutMs, name);
      }
      return breaker.execute(() => withTimeout(operation, timeoutMs, name));
    }
    return withTimeout(operation, timeoutMs, name);
  };

  try {
    return await withRetry(executeOnce, {
      maxAttempts: maxRetries + 1,
      timeoutMs,
      name,
      retryOn: (e) => {
        if (e instanceof TimeoutError) return true;
        if (e instanceof Error) {
          if (e.name === 'ValidationError') return false;
          if (e.name === 'AuthorizationError') return false;
          if (e.name === 'NotFoundError') return false;
        }
        return true;
      },
    });
  } catch (e) {
    if (fallback) {
      logger.warn('Operation failed, using fallback', { name, error: (e as Error).message });
      return (await fallback()) as T;
    }
    throw e;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
