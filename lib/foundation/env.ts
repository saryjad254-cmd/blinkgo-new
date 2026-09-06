/**
 * Foundation: Environment Configuration
 * ──────────────────────────────────────
 * Centralized, typed environment variable loader.
 * Use this everywhere — `process.env.X` is FORBIDDEN in app code.
 *
 * In dev, missing variables throw with an actionable message.
 * In production, missing variables crash the process at boot.
 *
 * Usage:
 *   import { env } from '@/lib/foundation/env';
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;
 */

import { InternalError } from './errors';

// ── Schema ──────────────────────────────────────────────────────
interface EnvSchema {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PROJECT_REF?: string;
  RESET_TOKEN_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  ADMIN_SECRET_KEY?: string;
  CRON_SECRET?: string;
  TRUST_PROXY_HEADERS?: string;
  COOKIE_SECURE?: string;
  ALLOWED_ORIGINS?: string;
  LOG_OAUTH_TRACE?: string;
}

type Validator = (value: string, key: string) => string | null;

function required(key: string): Validator {
  return (v) => (v && v.length > 0 ? null : `${key} is required`);
}
function url(key: string): Validator {
  return (v) => {
    if (!v) return null;
    try { new URL(v); return null; } catch { return `${key} must be a valid URL`; }
  };
}
function minLength(n: number, key: string): Validator {
  return (v) => (v && v.length < n ? `${key} must be at least ${n} chars` : null);
}
function oneOf<T extends string>(values: readonly T[], key: string): Validator {
  return (v) => (v && !values.includes(v as T) ? `${key} must be one of: ${values.join(', ')}` : null);
}

const schema: Record<keyof EnvSchema, Validator[]> = {
  NEXT_PUBLIC_SUPABASE_URL: [required('NEXT_PUBLIC_SUPABASE_URL'), url('NEXT_PUBLIC_SUPABASE_URL')],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: [required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), minLength(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')],
  NEXT_PUBLIC_APP_URL: [url('NEXT_PUBLIC_APP_URL')],
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: [],
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: [],
  SUPABASE_SERVICE_ROLE_KEY: [required('SUPABASE_SERVICE_ROLE_KEY'), minLength(20, 'SUPABASE_SERVICE_ROLE_KEY')],
  SUPABASE_ANON_KEY: [],
  SUPABASE_PROJECT_REF: [],
  RESET_TOKEN_SECRET: [],
  STRIPE_SECRET_KEY: [],
  STRIPE_WEBHOOK_SECRET: [],
  RESEND_API_KEY: [],
  GOOGLE_MAPS_API_KEY: [],
  NODE_ENV: [oneOf(['development', 'test', 'production'] as const, 'NODE_ENV')],
  LOG_LEVEL: [oneOf(['debug', 'info', 'warn', 'error', 'fatal'] as const, 'LOG_LEVEL')],
  ADMIN_SECRET_KEY: [],
  CRON_SECRET: [],
  TRUST_PROXY_HEADERS: [],
  COOKIE_SECURE: [],
  ALLOWED_ORIGINS: [],
  LOG_OAUTH_TRACE: [],
};

let cached: EnvSchema | null = null;

function load(): EnvSchema {
  if (cached) return cached;
  const out: Partial<EnvSchema> = {};
  const errors: string[] = [];
  for (const key of Object.keys(schema) as Array<keyof EnvSchema>) {
    const raw = process.env[key] ?? '';
    if (!raw) {
      // Find the required validator (heuristic: its string contains "is required")
      const validator = schema[key].find((v) => v.toString().includes('is required') || v.toString().includes('must be at least'));
      if (validator) {
        const err = (validator as Validator)(raw, key);
        if (err) errors.push(err);
      }
      continue;
    }
    let value: unknown = raw;
    for (const validator of schema[key]) {
      const err = validator(raw ?? '', key);
      if (err) {
        errors.push(err);
        value = undefined;
        break;
      }
    }
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }

  if (errors.length > 0) {
    const msg = `Environment validation failed:\n  - ${errors.join('\n  - ')}\n\n` +
      `Set the missing variables in your .env.local (dev) or hosting dashboard (prod).`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error(`[env] ${msg}`);
  }

  cached = out as EnvSchema;
  return cached;
}

// ── Public API ─────────────────────────────────────────────────
export const env: EnvSchema = new Proxy({} as EnvSchema, {
  get(_target, prop: string) {
    const e = load();
    if (!(prop in e)) {
      throw new InternalError(`Unknown env var: ${prop}`);
    }
    return (e as unknown as Record<string, unknown>)[prop];
  },
  has(_target, prop: string) {
    return prop in load();
  },
});

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function requireEnv<K extends keyof EnvSchema>(key: K): NonNullable<EnvSchema[K]> {
  const value = load()[key];
  if (value === undefined || value === null || value === '') {
    throw new InternalError(`Required env var missing: ${String(key)}`);
  }
  return value as NonNullable<EnvSchema[K]>;
}

export function optionalEnv<K extends keyof EnvSchema>(key: K): EnvSchema[K] | undefined {
  return load()[key];
}
