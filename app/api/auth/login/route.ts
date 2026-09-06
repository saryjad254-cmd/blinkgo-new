/**
 * User Login
 * ──────────
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Returns: { user, role, redirect }
 * Side effect: sets session cookies
 *
 * Migrated to apiRoute() — the canonical API entry point.
 * v80 audit-preserved: diagnostic logging, idempotency, CSRF.
 */
import { apiRoute, ok, fail, log, tier, z } from '@/lib/api/canonical';
import { AuthService } from '@/lib/services/auth-service';
import { ValidationError } from '@/lib/foundation/errors';
import { audit } from '@/lib/services/audit-log';
import { newRequestId } from '@/lib/foundation/response';
import { LoginSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Body schema ─────────────────────────────────────────────
const LoginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const POST = apiRoute({
  method: 'POST',
  auth: 'public',
  rateLimit: tier('auth'),
  bodySchema: LoginBodySchema,
  handler: async ({ body, ip }) => {
    const requestId = newRequestId();
    const { email, password } = body as { email: string; password: string };
    const normEmail = email.toLowerCase().trim();

    // Delegate to AuthService
    let loginResult;
    try {
      loginResult = await AuthService.loginFull(normEmail, password);
    } catch (loginErr: unknown) {
      await audit('AUTH_LOGIN_FAILED', {
        severity: 'warn',
        ip,
        resource: '/api/auth/login',
        metadata: { reason: 'invalid_credentials', request_id: requestId },
      });
      throw loginErr;
    }

    const { user, tokens } = loginResult;
    log.info('User login', { userId: user.id, role: user.role, requestId });

    // Audit successful login
    await audit('AUTH_LOGIN_SUCCESS', {
      userId: user.id,
      userEmail: normEmail,
      userRole: user.role,
      ip,
    });

    // Set cookies server-side
    try {
      await AuthService.setSessionCookies(tokens);
    } catch (cookieErr: unknown) {
      log.error('Could not persist authenticated session', { requestId });
      throw cookieErr;
    }

    return ok({
      user: { id: user.id, email: user.email, role: user.role },
      name: user.name,
      role: user.role,
      redirect: user.redirectPath,
    });
  },
});

void fail;
void ValidationError;
void LoginSchema;
