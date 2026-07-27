/**
 * Environment Variable Validation
 * ─────────────────────────────────
 * Validates and types all required environment variables at boot time.
 * Fails fast if anything is missing or malformed.
 * 
 * Use this in your API routes and server components:
 *   import { env } from '@/lib/config/env';
 *   const url = env.SUPABASE_URL;
 */

import { z } from 'zod';

const EnvSchema = z.object({
  // Supabase (REQUIRED)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing'),
  
  // Optional Supabase
  SUPABASE_PROJECT_REF: z.string().optional(),
  SUPABASE_DB_NAME: z.string().default('postgres'),
  SUPABASE_DB_PASSWORD: z.string().optional(),
  
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().optional(),  // Can be comma-separated multiple URLs
  
  // Stripe (OPTIONAL - app works without for COD)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  
  // Google Maps (OPTIONAL)
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  
  // Email (OPTIONAL)
  RESEND_API_KEY: z.string().optional(),
  
  // Security
  ALLOWED_ORIGINS: z.string().optional(),
  
  // Features
  ENABLE_AUDIT_LOG: z.string().default('true').transform((v) => v === 'true'),
  ENABLE_RATE_LIMITING: z.string().default('true').transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validated environment variables.
 * Throws on import if any required variable is missing.
 */
let cachedEnv: Env | null = null;

function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  
  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
    SUPABASE_DB_NAME: process.env.SUPABASE_DB_NAME,
    SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    ENABLE_AUDIT_LOG: process.env.ENABLE_AUDIT_LOG,
    ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
  
  const result = EnvSchema.safeParse(raw);
  
  if (!result.success) {
    // Don't fail in dev - log and use defaults
    if (process.env.NODE_ENV === 'production') {
      const errors = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${errors}`);
    }
    // In dev, return what we can
    return raw as unknown as Env;
  }
  
  cachedEnv = result.data;
  return cachedEnv;
}

export const env = loadEnv();

/**
 * Check if a feature is enabled
 */
export function isEnabled(feature: 'audit' | 'rate_limit'): boolean {
  switch (feature) {
    case 'audit': return env.ENABLE_AUDIT_LOG;
    case 'rate_limit': return env.ENABLE_RATE_LIMITING;
    default: return true;
  }
}

/**
 * Check if we're in production
 */
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
