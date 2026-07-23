/**
 * Structured Logger
 * ─────────────────
 * Modern logger with:
 *   - Structured JSON output
 *   - Log levels (debug, info, warn, error)
 *   - Automatic PII/sensitive data redaction
 *   - Request context (request_id, user_id)
 *   - Performance timing
 *   - Compatible with structured log aggregators (Datadog, Sentry, etc.)
 */

export type LogContext = Record<string, unknown>;
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Sensitive keys to redact from logs.
 * Pattern matched against object keys (case-insensitive).
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'session',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
  'private_key',
  'service_role',
  'service_role_key',
  'supabase_service',
];

const REDACTED = '[REDACTED]';

/**
 * Recursively redact sensitive values from an object.
 */
function redact<T>(obj: T, depth: number = 0): T {
  if (depth > 10) return obj; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1)) as unknown as T;
  }
  
  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk));
    
    if (isSensitive) {
      redacted[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redact(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Generate a request ID (UUID v4-like)
 */
export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Log a message with structured context.
 */
function log(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {}
): void {
  if (!shouldLog(level)) return;
  
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...redact(context),
  };
  
  // Output as JSON for machine parsing
  const output = JSON.stringify(entry);
  
  switch (level) {
    case 'debug':
    case 'info':
      console.log(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

/**
 * Start a timer for performance measurement
 */
export function startTimer(label: string): () => number {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    log('debug', `Timer: ${label}`, { duration_ms: Math.round(duration * 100) / 100 });
    return duration;
  };
}

/**
 * Merge an optional error into the log context.
 * Extracts message, name, code, and stack (if available).
 */
function mergeError(ctx: Record<string, unknown> | undefined, err: unknown): Record<string, unknown> {
  const base = ctx || {};
  if (err === null || err === undefined) return base;
  if (err instanceof Error) {
    return {
      ...base,
      error_message: err.message,
      error_name: err.name,
      error_stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    };
  }
  return { ...base, error: String(err) };
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>, _err?: unknown) => log('debug', message, mergeError(context, _err)),
  info: (message: string, context?: Record<string, unknown>, _err?: unknown) => log('info', message, mergeError(context, _err)),
  warn: (message: string, context?: Record<string, unknown>, _err?: unknown) => log('warn', message, mergeError(context, _err)),
  error: (message: string, context?: Record<string, unknown>, _err?: unknown) => log('error', message, mergeError(context, _err)),
  
  // Specialized methods
  child: (context: Record<string, unknown>) => ({
    debug: (msg: string, ctx?: Record<string, unknown>, _err?: unknown) => log('debug', msg, mergeError({ ...context, ...ctx }, _err)),
    info: (msg: string, ctx?: Record<string, unknown>, _err?: unknown) => log('info', msg, mergeError({ ...context, ...ctx }, _err)),
    warn: (msg: string, ctx?: Record<string, unknown>, _err?: unknown) => log('warn', msg, mergeError({ ...context, ...ctx }, _err)),
    error: (msg: string, ctx?: Record<string, unknown>, _err?: unknown) => log('error', msg, mergeError({ ...context, ...ctx }, _err)),
  }),
};
