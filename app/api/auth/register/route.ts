import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { authRateLimiters } from '@/lib/rate-limit';
import { isValidEmail, isValidName, isValidPassword, isValidPhone, isValidRole, sanitizeText } from '@/lib/validation';
import { createServiceClient } from '@/lib/supabase/service';
import { fail, ok, withErrorHandling } from '@/lib/api/response';
import { ConflictError, ValidationError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// Helper: case-insensitive email normalization
function normalizeEmail(email: string): string {
  return (email ?? '').toString().toLowerCase().trim();
}

// Helper: sanitize name to avoid SQL injection (no special chars in DB-only fields)
function safeName(name: string): string {
  return (name ?? '').toString().trim().slice(0, 100);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // Rate limit: 5 registrations per IP per 15 minutes
    const limited = authRateLimiters.register(req);
    if (limited) return limited;

    const { name, email, phone, password, role } = await req.json();

    // Input validation (defense in depth) — use ValidationError so it maps to 400.
    if (!isValidName(name)) throw new ValidationError('Name muss 2-100 Zeichen enthalten');
    if (!isValidEmail(email)) throw new ValidationError('Ungültiges E-Mail-Format');
    if (!isValidPassword(password)) throw new ValidationError('Passwort muss 8-128 Zeichen haben');
    if (phone && !isValidPhone(phone)) throw new ValidationError('Ungültiges Telefonformat');
    if (role && !isValidRole(role)) throw new ValidationError('Ungültige Rolle');

    const normEmail = normalizeEmail(email);
    const cleanName = sanitizeText(name);

    // Only customer role is allowed for self-registration
    if (role && role !== 'customer') {
      throw new AuthorizationError(
        'Nur Kunden können sich selbst registrieren. Restaurant- und Fahrerkonten werden vom Administrator erstellt.',
      );
    }

    // Re-check: name and email and password are required
    if (!cleanName || !normEmail) {
      throw new ValidationError('Name, E-Mail und Passwort sind erforderlich');
    }

    const supabase = createServiceClient();

    // ============================================================
    // STEP 1: Check both auth.users AND public.users for the email
    // (previously, only public.users was checked — leaving auth.users
    //  orphans could trigger "duplicate key value violates users_pkey"
    //  when users retried registration)
    // ============================================================

    // 1a) Check public.users (normalized comparison via LOWER)
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id, is_verified, is_active')
      .ilike('email', normEmail)
      .maybeSingle();

    if (existingProfile) {
      // If the profile exists AND is verified, this is a real duplicate
      if (existingProfile.is_verified) {
        throw new ConflictError(
          'Diese E-Mail ist bereits registriert. Bitte melde dich an.',
          { code: 'EMAIL_TAKEN' },
        );
      }
      // Profile exists but not verified: clean up the stale public row AND the
      // matching auth user (if any) so registration can retry from a clean slate.
      await supabase.from('users').delete().eq('id', existingProfile.id);
      try {
        await supabase.auth.admin.deleteUser(existingProfile.id);
      } catch (e) {
        // auth user may already be missing — that's fine
      }
    }

    // 1b) Check auth.users — find any auth user with this email
    let existingAuthUser = null;
    try {
      const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 200 });
      existingAuthUser = authList?.users?.find((u) => u.email?.toLowerCase() === normEmail) ?? null;
    } catch (e) {
      console.error('listUsers failed:', e);
      // Non-fatal — fall through to createUser (which will fail loudly if email exists)
    }

    // 1c) If email already exists in auth.users:
    //    - If verified → real duplicate → 409
    //    - If not verified → stale partial signup → delete and recreate
    if (existingAuthUser) {
      if (existingAuthUser.email_confirmed_at) {
        throw new ConflictError(
          'Diese E-Mail ist bereits registriert. Bitte melde dich an.',
          { code: 'EMAIL_TAKEN' },
        );
      }
      // Stale unverified auth user → clean it up + any matching public row
      await supabase.from('users').delete().eq('id', existingAuthUser.id);
      try {
        await supabase.auth.admin.deleteUser(existingAuthUser.id);
      } catch (delErr) {
        console.error('Failed to delete stale auth user:', delErr);
      }
    }

    // ============================================================
    // STEP 2: Create auth user
    // ============================================================
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: normEmail,
      password,
      email_confirm: false, // require email verification
      user_metadata: { name: cleanName, phone: phone || null, role: 'customer' },
    });

    if (authErr || !authData.user) {
      // Most common: email already exists in auth.users (race condition we missed)
      const msg = authErr?.message ?? 'Auth-Fehler';
      const code = (authErr as any)?.code ?? '';
      if (msg.toLowerCase().includes('already') || code === 'email_exists') {
        throw new ConflictError('Diese E-Mail ist bereits registriert', { code: 'EMAIL_TAKEN' });
      }
      return fail(new Error(msg));
    }

    // ============================================================
    // STEP 3: Insert user profile with upsert (idempotent on conflict)
    // ============================================================
    const { error: profileErr } = await supabase.from('users').upsert(
      {
        id: authData.user.id,
        email: normEmail,
        name: cleanName,
        phone: phone || null,
        role: 'customer',
        is_verified: false,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileErr) {
      logger.error('Profile upsert failed', { userId: authData.user.id }, profileErr);
      // Rollback auth user to avoid orphan
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (rbErr) {
        logger.error('Rollback failed', { userId: authData.user.id }, rbErr);
      }
      // Surface a clearer error for the most common case
      if (profileErr.code === '23505') {
        throw new ConflictError('Diese E-Mail ist bereits registriert', { code: 'EMAIL_TAKEN' });
      }
      return fail(new Error(profileErr.message));
    }

    // ============================================================
    // STEP 4: Generate OTP and store it (in file store for no-SMTP setup)
    // ============================================================
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Invalidate any previous unused OTPs for this email
    try {
      const { invalidateOTPs } = await import('@/lib/otp-store');
      await invalidateOTPs(normEmail, 'signup');
    } catch (e) {
      console.error('Invalidate OTP error:', e);
    }

    // Store the new OTP. This is a hard requirement: if the email_otps
    // table is missing or the DB is unreachable, we cannot issue a
    // verification code. The filesystem fallback is intentionally gone
    // (it would throw ENOENT on Vercel). Roll back the auth user and
    // surface a clear 500 error so the operator can apply the migration.
    try {
      const { storeOTP } = await import('@/lib/otp-store');
      await storeOTP({
        email: normEmail,
        user_id: authData.user.id,
        code: otpCode,
        expires_at: expiresAt,
        purpose: 'signup',
      });
    } catch (otpErr: any) {
      console.error('Store OTP error (fatal):', otpErr);
      // Roll back the auth user so we do not leave a half-registered account
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (rbErr) {
        logger.error('OTP-store rollback failed', { userId: authData.user.id }, rbErr);
      }
      throw new Error(
        'Verification code could not be saved. The email_otps table is missing — ' +
        'apply the migration in deploy/supabase/00-INIT-EMAIL-OTPS.sql',
      );
    }

    // Send OTP email (real email via Resend if RESEND_API_KEY is set)
    // Detect locale from cookie or Accept-Language
    let detectedLocale: 'de' | 'ar' | 'en' = 'de';
    try {
      const cookieStore = await import('next/headers').then((m) => m.cookies());
      const localeCookie = cookieStore.get('blinkgo-locale')?.value;
      if (localeCookie === 'ar' || localeCookie === 'en') detectedLocale = localeCookie;
      else {
        const acceptLang = req.headers.get('accept-language') ?? '';
        if (acceptLang.includes('ar')) detectedLocale = 'ar';
        else if (acceptLang.includes('en')) detectedLocale = 'en';
      }
    } catch {}
    try {
      const { sendOTPEmail } = await import('@/lib/email-service');
      const emailRes = await sendOTPEmail({
        to: normEmail,
        code: otpCode,
        name: name,
        locale: detectedLocale,
        expiresInMinutes: 15,
      });
      if (!emailRes.ok) {
        console.error('Email send failed:', emailRes.error);
      } else {
      }
    } catch (e) {
      console.error('Email service error:', e);
      // Non-fatal — user can still use on-screen code
    }

    return ok({
      message: 'Verification email sent',
      userId: authData.user.id,
      email: normEmail,
    });
  });
}
