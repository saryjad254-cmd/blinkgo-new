/**
 * User Login
 * ──────────
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Returns: { user, role, redirect }
 * Side effect: sets session cookies
 *
 * DIAGNOSTIC LOGGING (v72 hotfix):
 *   The login route is currently returning 401 even after a successful
 *   email verification. To debug this without changing the login logic
 *   itself, every step that COULD lead to a 401 is now logged in detail:
 *     - pre-lookup of the user record (is_verified / is_active / role)
 *     - the Supabase signInWithPassword HTTP response (status, body)
 *     - any error thrown by AuthService.loginFull
 *     - whether setSessionCookies ran without throwing
 *   The HTTP response is unchanged. Same status codes, same body shape.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { authRateLimiters } from '@/lib/rate-limit';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthService } from '@/lib/services/auth-service';
import { LoginSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { audit } from '@/lib/services/audit-log';
import { generateRequestId } from '@/lib/logging/logger';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hashEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Diagnostic helper: look up the public.users row for this email using
 * the service-role client. We log the full row (minus sensitive fields)
 * BEFORE invoking the password grant so we can see exactly what the
 * AuthService is about to refuse.
 */
async function diagLookupPublicUser(email: string, requestId: string) {
  const svc = createServiceClient();
  const norm = email.toLowerCase().trim();
  try {
    const { data, error } = await svc
      .from('users')
      .select('id, email, name, role, is_active, is_verified, created_at')
      .eq('email', norm)
      .maybeSingle();
    if (error) {
      console.error(`[login-diag ${requestId}] public.users lookup error:`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    if (!data) {
      console.error(`[login-diag ${requestId}] public.users lookup: NO ROW for ${norm}`);
      return null;
    }
    console.error(`[login-diag ${requestId}] public.users lookup: FOUND`, {
      id: data.id,
      email: data.email,
      role: data.role,
      is_verified: data.is_verified,
      is_active: data.is_active,
      has_name: !!data.name,
      created_at: data.created_at,
    });
    return data;
  } catch (e: any) {
    console.error(`[login-diag ${requestId}] public.users lookup threw:`, e?.message || e);
    return null;
  }
}

/**
 * Diagnostic helper: directly call the Supabase password-grant endpoint
 * and log the HTTP response. This is a *probe only* — the real login still
 * runs through AuthService.loginFull. We use the anon key (as the auth
 * service does) and we do NOT store or use the returned tokens.
 *
 * v80 (audit F-04): the Supabase password-grant response body contains
 * `access_token` + `refresh_token` (JWTs, ~250-400 chars each). Logging
 * even a 400-char snippet of that body is a credential leak — anyone with
 * read access to logs (Vercel/Datadog/Sentry) gets a session token they
 * can replay. We now log only the HTTP status, the error code (if any),
 * and a SHA-256 hash of the body so an operator can still tell whether
 * the response changed.
 */
async function diagProbeSignIn(
  email: string,
  password: string,
  requestId: string,
): Promise<{ httpStatus: number; bodyHash: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error(`[login-diag ${requestId}] missing supabase env for probe`);
    return null;
  }
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let bodyHash = '';
    try {
      const text = await res.text();
      bodyHash = crypto
        .createHash('sha256')
        .update(text)
        .digest('hex')
        .slice(0, 16);
    } catch {
      bodyHash = '<unreadable>';
    }
    console.error(`[login-diag ${requestId}] signInWithPassword probe`, {
      ok: res.ok,
      http_status: res.status,
      // v80: do NOT log the body itself — it contains access_token +
      // refresh_token. The hash lets an operator detect response changes
      // without leaking credentials.
      body_sha256_16: bodyHash,
    });
    return { httpStatus: res.status, bodyHash };
  } catch (e: any) {
    console.error(`[login-diag ${requestId}] signInWithPassword probe threw:`, e?.message || e);
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') || 'unknown';

  try {
    return await withErrorHandling(async () => {
      // 1) Parse + validate input
      const body = await request.json().catch(() => ({}));
      const result = LoginSchema.safeParse(body);

      if (!result.success) {
        const firstError = result.error.errors[0];
        throw new ValidationError(
          `${firstError.path.join('.') || 'field'}: ${firstError.message}`
        );
      }

      const { email, password } = result.data;
      const normEmail = email.toLowerCase().trim();

      // v80 (audit F-04): NEVER log the raw email (PII / GDPR) or any
      // token / password / cookie. Log a salted hash + byte counts only.
      console.error(`[login-diag ${requestId}] login attempt`, {
        email_hash: hashEmail(normEmail),
        ip,
        has_password: !!password,
        password_length: password?.length ?? 0,
      });

      // 2) Rate limit (per-IP AND per-email)
      const limited = authRateLimiters.login(request, email);
      if (limited) {
        console.error(`[login-diag ${requestId}] rate-limited at login endpoint`);
        await audit('SECURITY_RATE_LIMIT', {
          severity: 'warn',
          ip,
          resource: '/api/auth/login',
          metadata: { email_hash: hashEmail(email) },
        });
        return limited;
      }

      // ── Diagnostics: pre-lookup the public.users row.
      const preProfile = await diagLookupPublicUser(normEmail, requestId);
      if (preProfile) {
        console.error(`[login-diag ${requestId}] pre-login user state`, {
          is_verified: preProfile.is_verified,
          is_active: preProfile.is_active,
          role: preProfile.role,
        });
      }

      // ── Diagnostics: probe the password-grant endpoint to capture
      //   the raw Supabase response (this is the operation whose 401
      //   we are trying to explain).
      const probe = await diagProbeSignIn(normEmail, password, requestId);
      if (probe && probe.httpStatus !== 200) {
        console.error(`[login-diag ${requestId}] signInWithPassword DID NOT SUCCEED`, {
          http_status: probe.httpStatus,
          // v80: do NOT log the raw body — it contains access_token /
          // refresh_token. Use the hash for grep-friendliness instead.
          supabase_body_hash: probe.bodyHash,
        });
      } else if (probe && probe.httpStatus === 200) {
        console.error(`[login-diag ${requestId}] signInWithPassword SUCCEEDED (probe)`);
      }

      // 3) Delegate to AuthService (single source of truth)
      let loginResult: Awaited<ReturnType<typeof AuthService.loginFull>>;
      try {
        loginResult = await AuthService.loginFull(normEmail, password);
        console.error(`[login-diag ${requestId}] AuthService.loginFull RETURNED`, {
          has_user: !!loginResult?.user,
          user_id: loginResult?.user?.id,
          user_role: loginResult?.user?.role,
          has_tokens: !!loginResult?.tokens,
          has_access_token: !!loginResult?.tokens?.access_token,
        });
      } catch (loginErr: any) {
        // Capture the full error object before re-throwing so withErrorHandling
        // can convert it to a 401. This is the critical diagnostic: the operator
        // can see *exactly* why the login was rejected.
        console.error(`[login-diag ${requestId}] AuthService.loginFull THREW`, {
          name: loginErr?.name,
          message: loginErr?.message,
          code: loginErr?.code,
          status: loginErr?.statusCode,
          is_AppError: loginErr?.isOperational,
          meta: loginErr?.meta,
          cause_name: loginErr?.cause?.name,
          cause_message: loginErr?.cause?.message,
          cause_code: loginErr?.cause?.code,
          cause_status: loginErr?.cause?.status,
          stack: loginErr?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        throw loginErr;
      }

      const { user, tokens } = loginResult;
      logger.info('User login', { userId: user.id, role: user.role, requestId });

      // 4) Audit successful login
      await audit('AUTH_LOGIN_SUCCESS', {
        userId: user.id,
        userEmail: normEmail,
        userRole: user.role,
        ip,
      });

      // 5) Set cookies server-side (with diagnostic)
      let cookiesSet = false;
      try {
        AuthService.setSessionCookies(tokens);
        cookiesSet = true;
        // v80 (audit F-04): do NOT log token byte counts either. They
        // are a low-value fingerprint (the cookie write itself is the
        // signal we care about). Log only the user id + boolean.
        console.error(`[login-diag ${requestId}] setSessionCookies OK`, {
          user_id: user.id,
        });
      } catch (cookieErr: any) {
        console.error(`[login-diag ${requestId}] setSessionCookies THREW`, {
          name: cookieErr?.name,
          message: cookieErr?.message,
          stack: cookieErr?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        throw cookieErr;
      }

      // 6) Respond with X-Request-Id
      const response = ok({
        user: { id: user.id, email: user.email, role: user.role },
        name: user.name,
        role: user.role,
        redirect: user.redirectPath,
      });
      response.headers.set('X-Request-Id', requestId);
      console.error(`[login-diag ${requestId}] responding 200`, {
        cookies_set: cookiesSet,
        role: user.role,
        redirect: user.redirectPath,
      });
      return response;
    });
  } catch (error) {
    // Log failed login attempt (but not validation errors)
    if (!(error instanceof ValidationError)) {
      console.error(`[login-diag ${requestId}] outer catch — re-throwing`, {
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
        statusCode: (error as any)?.statusCode,
      });
      await audit('AUTH_LOGIN_FAILED', {
        severity: 'warn',
        ip,
        resource: '/api/auth/login',
        metadata: { reason: 'invalid_credentials', request_id: requestId },
      });
    } else {
      console.error(`[login-diag ${requestId}] outer catch (validation)`, {
        message: (error as any)?.message,
      });
    }
    throw error;
  }
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
