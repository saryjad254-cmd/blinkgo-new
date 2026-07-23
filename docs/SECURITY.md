# Security

## Overview

BlinkGo is designed with defense in depth. Security is implemented at four layers:

1. **Network** — HTTPS, security headers
2. **Application** — CSRF, rate limiting, input validation
3. **Authentication** — JWT, session management
4. **Database** — Row-Level Security (RLS)

## Threat Model

### Assets Protected
- User accounts (email, name, phone)
- Authentication tokens (JWT in cookies)
- Order data (addresses, payment info)
- Restaurant data (menus, settings)
- Driver data (locations, earnings)
- Admin operations
- Payment processing

### Threats Considered
- Cross-Site Request Forgery (CSRF)
- Cross-Site Scripting (XSS)
- SQL Injection
- Authentication bypass
- Privilege escalation
- Rate limit / brute force
- Session hijacking
- Man-in-the-middle
- Denial of service
- Data exfiltration

---

## Authentication

### Method
Supabase JWT stored in HTTP-only cookies.

**Cookie name:** `sb-{project-ref}-auth-token`

**Cookie attributes:**
- `HttpOnly` — Not accessible via JavaScript
- `Secure` — Only sent over HTTPS
- `SameSite=Lax` — CSRF protection for top-level navigations
- `Path=/` — Sent to all routes
- `Max-Age=604800` — 7 days

### Password Requirements
- Minimum 8 characters
- Maximum 128 characters
- Validated server-side
- Hashed by Supabase (bcrypt)

### Session Lifecycle
1. User logs in → JWT issued (1 hour)
2. Refresh token issued (7 days)
3. Server validates JWT on every request
4. `createServerClient()` in `lib/supabase/server.ts` handles refresh
5. On logout: refresh token revoked server-side

### Verification
JWT signature is verified using Supabase's JWT secret. The secret never leaves the server.

```typescript
// lib/supabase/server.ts
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  // Unauthenticated
}
```

---

## Authorization (RBAC)

### Roles

| Role | Hierarchy | Permissions |
|------|-----------|-------------|
| `customer` | 0 | Browse, order, track, rate own orders |
| `driver` | 0 | View/accept available orders, update location, view own earnings |
| `restaurant` | 0 | Manage own menu, view/fulfill own orders |
| `manager` | 1 | View admin (no mutations) |
| `admin` | 2 | Full admin (excl. super-admin) |
| `super_admin` | 3 | Unrestricted |

### Enforcement Layers

**Layer 1: Page-level (redirects)**
```typescript
// lib/rbac.ts
export async function requireRole(allowed: string | string[]): Promise<AuthedUser> {
  // ... validates user, role, is_active
  if (!allowedRoles.includes(profile.role)) {
    redirect('/login?error=insufficient_permissions');
  }
}
```

**Layer 2: API-level (returns 401/403)**
```typescript
// lib/rbac.ts
export async function requireApiRole(allowed: string | string[]): Promise<AuthedUser | null> {
  // ... returns null on failure
}
```

**Layer 3: Admin API (role hierarchy)**
```typescript
// lib/rbac.ts
export async function requireAdminRole(
  required: AdminPermission = 'manager'
): Promise<AdminContext | NextResponse> {
  // Checks role hierarchy
}
```

**Layer 4: Database RLS**
See [Database Schema](DATABASE_SCHEMA.md#row-level-security-rls).

### Critical Rule
**Role is always read from `public.users`, NEVER from `user_metadata`.**

`user_metadata` is mutable by the client and must never be trusted for authorization.

---

## CSRF Protection

### Implementation
All state-changing requests (POST, PUT, PATCH, DELETE) require a valid `Origin` header.

### Allowed Origins
- `http://localhost:*` (development)
- `http://127.0.0.1:*` (development)
- Tunnel hosts: `*.loca.lt`, `*.ngrok.io`, `*.ngrok-free.app`, `*.ngrok.app`, `*.trycloudflare.com`, `*.vercel.app`, `*.netlify.app`
- `NEXT_PUBLIC_APP_URL` (production)

### Exemptions
- `/api/stripe/webhook` — Uses signature verification instead

### Failed CSRF Response
```json
HTTP/1.1 403 Forbidden
{ "ok": false, "error": "CSRF" }
```

---

## Rate Limiting

### Storage
In-memory bucket (per Node.js instance). Resets on server restart.

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/login` | 20 | 15 min |
| `POST /api/auth/register` | 10 | 15 min |
| `POST /api/auth/reset-password` | 10 | 15 min |
| `POST /api/auth/verify-otp` | 10 | 15 min |
| `POST /api/auth/resend-otp` | 3 | 5 min |
| `POST /api/contact` | 3 | 1 min |

### Identifier
Per IP + endpoint name. For login, also per email to prevent credential stuffing.

### Response
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 600
{ "ok": false, "error": "RATE_LIMITED", "retryAfter": 600 }
```

### Production Note
For multi-region deployments, replace in-memory store with Upstash Redis.

---

## Input Validation

### Library
Zod schemas in `lib/validation.ts` and inline at API boundaries.

### Pattern
```typescript
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const body = schema.parse(await req.json());
```

### Defensive Validation
- All UUIDs checked for format (and not nil UUID)
- Numeric ranges enforced (e.g., tip: 0–500)
- String length limits
- SQL keywords escaped (Supabase client parameterizes)
- HTML sanitized on render (React JSX)

---

## XSS Prevention

- **React JSX** auto-escapes by default
- No `dangerouslySetInnerHTML` without explicit sanitization
- CSP header restricts script sources
- No inline event handlers in production

---

## Security Headers

Applied via `lib/security-headers.ts` and Next.js config:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | strict | Prevent XSS, restrict resources |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage |
| `Permissions-Policy` | restricted | Camera, mic, geolocation |

### CSP Allowlist
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://unpkg.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
img-src 'self' data: blob: https: http:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://maps.googleapis.com https://*.tiles.openstreetmap.org https://nominatim.openstreetmap.org https://*.basemaps.cartocdn.com;
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
object-src 'none';
```

---

## Payment Security

### Stripe
- **PCI compliance:** Stripe handles all card data (we never see it)
- **Webhook signature:** Verified with `STRIPE_WEBHOOK_SECRET`
- **Idempotency:** `payment_intent_id` stored for deduplication
- **Refunds:** Only via Stripe API, never direct DB update

### Dev Mode
If `STRIPE_SECRET_KEY` is missing, payments are simulated. This is **NEVER** used in production.

---

## Data Protection

### At Rest
- Supabase encryption (AES-256)
- Backups encrypted
- Storage (images) encrypted

### In Transit
- TLS 1.2+ enforced (Vercel default)
- HSTS preload

### PII Handling
- Email, name, phone: stored in `public.users`
- Address: stored in `user_addresses`
- Payment data: **NEVER** stored (Stripe handles)
- Delivery proof: stored in Supabase Storage (private bucket)

### GDPR
- User can request data export (`/api/user/export`)
- User can request account deletion (`/api/user/delete`)
- Logs scrub PII after 30 days
- Cookies: `blinkgo-locale` (1 year), session (7 days)

---

## Logging & Monitoring

### What to Log
- Auth events (login, logout, failed attempts)
- Admin actions
- Payment events
- Errors (with stack traces)
- Suspicious activity (multiple 401s, 403s)

### What NOT to Log
- Passwords (even hashed)
- JWT tokens
- Stripe secrets
- API keys
- Email/phone in URLs

### Implementation
```typescript
// lib/logging.ts
logger.info('User login', { userId, role });
logger.warn('Failed auth attempt', { email, ip });
logger.error('Payment failed', { orderId, reason }, error);
```

---

## Vulnerability Reporting

### Internal
If you discover a security issue:
1. **Do NOT** open a public GitHub issue
2. Email `security@blinkgo.de`
3. Include: description, reproduction steps, impact

### External (Responsible Disclosure)
We welcome reports from security researchers. Please:
- Email `security@blinkgo.de`
- Allow 90 days for remediation before public disclosure
- We will acknowledge within 48 hours

### Bounty Program
Coming soon.

---

## Security Checklist (Pre-Deployment)

- [ ] All `ENABLE_DEV_BYPASS=false` in production
- [ ] All `ENABLE_DEV_PAYMENT=false` in production
- [ ] `STRIPE_SECRET_KEY` is live key (sk_live_)
- [ ] `STRIPE_WEBHOOK_SECRET` is set
- [ ] `RESEND_API_KEY` is set with verified domain
- [ ] All SQL migrations applied
- [ ] RLS policies active
- [ ] HTTPS enforced (HSTS)
- [ ] CSP header correct
- [ ] CORS restricted
- [ ] Rate limits active
- [ ] Demo account passwords changed
- [ ] No secrets in git history
- [ ] No `console.log` of sensitive data
- [ ] Error messages don't leak internals
- [ ] All dependencies up to date
- [ ] `npm audit` clean
- [ ] Logs don't contain PII

---

## Security Audit History

| Date | Scope | Findings |
|------|-------|----------|
| 2026-07 | V40 audit | 7 critical, 12 high, 8 medium fixed |
| 2026-06 | V39 audit | 4 high fixed |
| 2026-05 | V38 audit | 2 critical, 5 high fixed |

See [docs/audits/](audits/) for full reports.
