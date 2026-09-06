/**
 * Foundation: Structured Logger
 * ─────────────────────────────
 * Modern logger with:
 *   - Structured JSON output (production) / pretty (dev)
 *   - Log levels (debug, info, warn, error, fatal)
 *   - Automatic PII/sensitive data redaction
 *   - Request context (request_id, user_id)
 *   - Performance timing
 *   - Compatible with structured log aggregators (Datadog, Sentry, etc.)
 */

import type { LogLevel, Logger, LogContext, LogEntry } from './types';
export type { LogLevel, LogContext, LogEntry, Logger } from './types';

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

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
const REDACTED_EMAIL = '[REDACTED_EMAIL]';

function redactString(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_EMAIL)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:sb_secret_|sk_live_|rk_live_|whsec_|re_)[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/([?&](?:token|code|signature|email|password|secret|api[_-]?key)=)[^&#\s]+/gi, `$1${REDACTED}`)
    .replace(/((?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, `$1${REDACTED}`);
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sk) => lower.includes(sk));
}

function redact<T>(obj: T, depth = 0): T {
  if (depth > 10) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactString(obj) as T;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else if (typeof v === 'string') {
      out[k] = redactString(v);
    } else if (v !== null && typeof v === 'object') {
      out[k] = redact(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out as unknown as T;
}

function getCurrentLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LOG_LEVEL_RANK) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

let currentLevel: LogLevel = getCurrentLevel();

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[currentLevel];
}

function mergeError(ctx: LogContext | undefined, err: unknown): LogContext {
  const base: LogContext = { ...(ctx ?? {}) };
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

function formatPretty(entry: LogEntry): string {
  const ts = entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const ctxStr = Object.keys(entry.context).length > 0
    ? ' ' + JSON.stringify(entry.context)
    : '';
  return `${ts} ${level} ${entry.message}${ctxStr}`;
}

function writeJson(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case 'debug':
    case 'info':
      console.log(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
    case 'fatal':
      console.error(line);
      break;
  }
}

function writePretty(entry: LogEntry): void {
  const line = formatPretty(entry);
  switch (entry.level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
    case 'fatal':
      console.error(line);
      break;
  }
}

// ── ConsoleLogger implementation ───────────────────────────────
export class ConsoleLogger implements Logger {
  private readonly context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  child(ctx: LogContext): Logger {
    return new ConsoleLogger({ ...this.context, ...ctx });
  }

  debug(message: string, context?: LogContext, err?: unknown): void {
    this.emit('debug', message, context, err);
  }
  info(message: string, context?: LogContext, err?: unknown): void {
    this.emit('info', message, context, err);
  }
  warn(message: string, context?: LogContext, err?: unknown): void {
    this.emit('warn', message, context, err);
  }
  error(message: string, context?: LogContext, err?: unknown): void {
    this.emit('error', message, context, err);
  }
  fatal(message: string, context?: LogContext, err?: unknown): void {
    this.emit('fatal', message, context, err);
  }

  private emit(level: LogLevel, message: string, context?: LogContext, err?: unknown): void {
    if (!shouldLog(level)) return;
    const merged = mergeError({ ...this.context, ...context }, err);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: redact(merged),
    };
    if (process.env.NODE_ENV === 'production') {
      writeJson(entry);
    } else {
      writePretty(entry);
    }
  }
}

// ── Public singleton ───────────────────────────────────────────
export const log: Logger = new ConsoleLogger();

// ── Helpers (compat with old lib/logging API) ──────────────────
export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function startTimer(label: string): () => number {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    log.debug(`Timer: ${label}`, { duration_ms: Math.round(duration * 100) / 100 });
    return duration;
  };
}

/** Alias for `log` — for code that previously did `import { logger } from '@/lib/logging'`. */
export const logger: Logger = log;

/** Request-scoped logger factory. */
export function withRequestLogger(
  base: Logger,
  requestId: string,
  method: string,
  path: string,
): Logger {
  return base.child({ request_id: requestId, method, path });
}
