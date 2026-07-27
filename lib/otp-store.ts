/**
 * OTP Store — Supabase-only (production-grade)
 * ──────────────────────────────────────────────
 * All OTPs are stored in the `email_otps` table in Supabase. There is NO
 * filesystem fallback, NO in-memory fallback, NO other storage layer.
 *
 * Why no fallback?
 *  - Vercel runtime (`/var/task`) is read-only. Writing to `.data/otp.json`
 *    throws `ENOENT: mkdir '/var/task/.data'`. The previous fallback worked
 *    locally but completely failed in production.
 *  - Multi-instance deployments (Vercel serverless, autoscaling groups) need
 *    a shared store. Filesystem fallbacks would silently break verification
 *    when a request lands on a worker that does not have the file.
 *  - Silent fallbacks mask production bugs. If the table is missing, the
 *    operator must know immediately.
 *
 * Required migration (one-time, idempotent):
 *
 *   CREATE TABLE IF NOT EXISTS public.email_otps (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     email text NOT NULL,
 *     user_id uuid,
 *     code_hash text NOT NULL,
 *     purpose text NOT NULL,
 *     expires_at timestamptz NOT NULL,
 *     used_at timestamptz,
 *     ip_address text,
 *     user_agent text,
 *     created_at timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_email_otps_lookup
 *     ON public.email_otps (email, purpose, used_at, expires_at DESC);
 *   ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
 *   DROP POLICY IF EXISTS email_otps_service ON public.email_otps;
 *   CREATE POLICY email_otps_service ON public.email_otps
 *     FOR ALL TO service_role USING (true) WITH CHECK (true);
 *
 *   -- Optional cleanup helper: removes expired records older than 24h
 *   CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
 *   RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
 *   DECLARE n integer;
 *   BEGIN
 *     DELETE FROM public.email_otps
 *     WHERE (used_at IS NOT NULL)
 *        OR (expires_at < now() - interval '24 hours');
 *     GET DIAGNOSTICS n = ROW_COUNT;
 *     RETURN n;
 *   END;
 *   $$;
 *   REVOKE ALL ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC;
 *   GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO service_role;
 *
 * SECURITY:
 *   - Single-use enforcement via `used_at` timestamp (atomic UPDATE).
 *   - Time-bound (`expires_at`, default 15 min).
 *   - Constant-time code comparison on the SHA-256 hash.
 *   - Code is stored hashed, never in plaintext.
 *   - RLS enabled; service role bypasses for the trusted app client.
 *
 * On any DB error (including "table does not exist"), this module THROWS.
 * The route handler maps the error to a 500 response. The user sees
 * `OTP storage failed: <reason>`. The operator sees a clear log line.
 * No silent fallback. No filesystem.
 */

import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

export interface OTPRecord {
  id: string;
  email: string;
  user_id?: string;
  expires_at: string;
  purpose: string;
  used_at: string | null;
  created_at: string;
}

const TABLE = 'email_otps';

/** Detect "table not found" / PostgREST schema-cache miss. */
function isTableMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    (err.message || '').toLowerCase().includes('does not exist') ||
    (err.message || '').toLowerCase().includes('schema cache')
  );
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Store a new OTP. Invalidates any unused OTPs for the same (email, purpose)
 * to prevent accumulation and to ensure the resend flow replaces the old code.
 *
 * Throws on any DB error. No fallback.
 */
export async function storeOTP(opts: {
  email: string;
  user_id?: string;
  code: string;
  expires_at: string;
  purpose: string;
}): Promise<OTPRecord> {
  const svc = createServiceClient();
  const norm = opts.email.toLowerCase().trim();

  // Invalidate previous unused codes for this (email, purpose). Best-effort;
  // an error here is non-fatal because the new INSERT is what matters.
  await invalidateOTPs(norm, opts.purpose);

  const { data, error } = await svc
    .from(TABLE)
    .insert({
      email: norm,
      user_id: opts.user_id,
      code_hash: hashCode(opts.code),
      expires_at: opts.expires_at,
      purpose: opts.purpose,
    })
    .select('id, email, user_id, expires_at, purpose, used_at, created_at')
    .single();

  if (error || !data) {
    const detail = error?.message || (data === null ? 'no data returned' : 'unknown');
    if (isTableMissing(error)) {
      throw new Error(
        `OTP storage failed: email_otps table is missing. Apply the migration: ` +
        `CREATE TABLE public.email_otps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, user_id uuid, code_hash text NOT NULL, purpose text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());`,
      );
    }
    const err: any = new Error(`OTP storage failed: ${detail}`);
    err.cause = error;
    err.code = error?.code;
    throw err;
  }
  return data as OTPRecord;
}

/** Mark all unused OTPs for (email, purpose) as used. Used by store and resend. */
export async function invalidateOTPs(email: string, purpose: string): Promise<number> {
  const svc = createServiceClient();
  const norm = email.toLowerCase().trim();
  const { data, error } = await svc
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('email', norm)
    .eq('purpose', purpose)
    .is('used_at', null)
    .select('id');
  if (error) {
    if (isTableMissing(error)) {
      throw new Error('OTP table missing. Apply the email_otps migration.');
    }
    throw new Error(`OTP invalidate failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

/**
 * Get the most recent valid (unused, unexpired) OTP for (email, purpose).
 * Returns null if none exists. Throws only on table-missing or unexpected DB errors.
 */
export async function getLatestOTP(email: string, purpose: string): Promise<OTPRecord | null> {
  const svc = createServiceClient();
  const norm = email.toLowerCase().trim();
  const { data, error } = await svc
    .from(TABLE)
    .select('id, email, user_id, expires_at, purpose, used_at, created_at')
    .eq('email', norm)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isTableMissing(error)) {
      throw new Error('OTP table missing. Apply the email_otps migration.');
    }
    throw new Error(`OTP lookup failed: ${error.message}`);
  }
  return (data as OTPRecord | null) ?? null;
}

/**
 * Consume an OTP: atomically mark as used if not already used and not expired.
 * Returns the OTP record on success, null on mismatch / no record.
 * Throws on DB error.
 *
 * SECURITY: Uses constant-time comparison on the code hash.
 */
export async function consumeOTP(opts: {
  email: string;
  code: string;
  purpose: string;
}): Promise<OTPRecord | null> {
  const svc = createServiceClient();
  const norm = opts.email.toLowerCase().trim();
  const codeHash = hashCode(opts.code);
  const nowIso = new Date().toISOString();

  const { data: candidates, error: candidatesErr } = await svc
    .from(TABLE)
    .select('id, email, user_id, expires_at, purpose, used_at, created_at, code_hash')
    .eq('email', norm)
    .eq('purpose', opts.purpose)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(5);

  if (candidatesErr) {
    if (isTableMissing(candidatesErr)) {
      throw new Error('OTP table missing. Apply the email_otps migration.');
    }
    throw new Error(`OTP lookup failed: ${candidatesErr.message}`);
  }

  if (!candidates || candidates.length === 0) return null;

  // Constant-time match across all candidates
  let matchId: string | null = null;
  for (const c of candidates) {
    if (typeof c.code_hash === 'string' && timingSafeEqual(c.code_hash, codeHash)) {
      matchId = c.id;
    }
  }
  if (!matchId) return null;

  // Atomic single-use. The .is('used_at', null) guards against a race where
  // two concurrent verify requests both pass the lookup.
  const { data: updated, error: updateErr } = await svc
    .from(TABLE)
    .update({ used_at: nowIso })
    .eq('id', matchId)
    .is('used_at', null)
    .select('id, email, user_id, expires_at, purpose, used_at, created_at')
    .single();

  if (updateErr) {
    if (isTableMissing(updateErr)) {
      throw new Error('OTP table missing. Apply the email_otps migration.');
    }
    throw new Error(`OTP consume failed: ${updateErr.message}`);
  }
  return (updated as OTPRecord | null) ?? null;
}
