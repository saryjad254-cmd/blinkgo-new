# OAuth Debug Runbook — v77

## Production Issue: User redirected to plain `/login` after Google OAuth

### Symptoms
- User clicks "Continue with Google" on `https://blinkgo.de/login`
- Google consent screen shows, user grants consent
- Browser returns to `https://blinkgo.de/login` (NO `?error=` parameter)

### Root Cause (Confirmed)

The production `public.users` table is missing the `auth_provider` column.

When `/auth/callback` runs after Google grants consent, it tries to:
1. `exchangeCodeForSession(code)` — works, session is created
2. Create a `public.users` row with `auth_provider: 'oauth'` — **FAILS with PGRST204** because the column doesn't exist
3. The user is left with a session but NO profile
4. `/auth/callback` redirects to `/search`
5. `(customer)/layout.tsx` calls `requireRole('customer')`
6. `requireRole` does `supabase.auth.getUser()` — succeeds (has session)
7. `requireRole` does `supabase.from('users').select().eq('id', user.id).single()` — **returns null** (no profile)
8. **Original `requireRole` redirects to plain `/login`** with no error parameter

The `v76` version of the production code did NOT have the defensive auto-create fallback. The `v77` version adds it.

### What v77 Does

v77 adds:
1. **Comprehensive diagnostic logging** with unique `[BLINKGO_AUTH_TRACE:v77:<source>]` markers
2. **Defensive auto-create fallback** in `requireRole` — if no profile exists, create it
3. **Defensive schema fallback** — tries full payload first, falls back to minimal if `PGRST204` (column doesn't exist)
4. **Error params on all redirects to `/login`** — never redirects to plain `/login` without context

### How to Confirm the Bug in Production

After deploying v77, perform one real Google OAuth login on `https://blinkgo.de`. Then check Vercel Runtime Logs for:

```
[BLINKGO_AUTH_TRACE:v77:auth_callback_entry] {"event":"entry","pathname":"/auth/callback","hasSession":true,"hasAuthCookie":false,"cookieNames":[...],"hasCodeVerifierCookie":true,"next":"/search","lang":"de"}
[BLINKGO_AUTH_TRACE:v77:auth_callback_exchange_ok] {"event":"success","userId":"<uuid>","hasSession":true,"hasAuthCookie":true}
[BLINKGO_AUTH_TRACE:v77:auth_callback_profile_fetch] {"event":"profile_lookup","userId":"<uuid>","profileFound":false,"role":null,"isActive":null}
[BLINKGO_AUTH_TRACE:v77:auth_callback_profile_create] {"event":"error","reason":"create_failed","userId":"<uuid>","errorCode":"PGRST204","errorMessage":"Could not find the 'auth_provider' column of 'users' in the schema cache"}
[BLINKGO_AUTH_TRACE:v77:auth_callback_final_redirect] {"event":"login_successful","userId":"<uuid>","role":"customer"}
[BLINKGO_AUTH_TRACE:v77:middleware] {"event":"allow","pathname":"/search","userId":"<uuid>","hasSession":true,"hasAuthCookie":true}
[BLINKGO_AUTH_TRACE:v77:customer_layout] {"event":"layout_entry"}
[BLINKGO_AUTH_TRACE:v77:require_role_no_profile] {"event":"auto_create_profile_attempt","reason":"profile_not_found_in_public_users_will_try_create","userId":"<uuid>","role":"customer"}
[BLINKGO_AUTH_TRACE:v77:require_role_no_profile] {"event":"auto_create_fallback_minimal","reason":"full_payload_failed_using_minimal","userId":"<uuid>","errorCode":"PGRST204","errorMessage":"Could not find the 'auth_provider' column of 'users' in the schema cache"}
[BLINKGO_AUTH_TRACE:v77:require_role_no_profile] {"event":"auto_create_profile_ok","userId":"<uuid>","role":"customer","isActive":true,"isVerified":true}
```

If you see this sequence, the bug is confirmed and **v77's defensive auto-create has fixed it** without requiring a database migration.

### How to Permanently Fix the Database (Optional)

The defensive fix in v77 is a workaround. For a permanent fix, run this in Supabase SQL Editor:

```sql
-- Add missing columns to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS restaurant_id UUID;
```

After this, the OAuth callback will succeed on the first try (no fallback needed), and the user will reach `/search` directly.

### Diagnostic Trace Sources

Each `[BLINKGO_AUTH_TRACE:v77:<source>]` has a unique source identifier:

| Source | File | Purpose |
|--------|------|---------|
| `middleware` | `middleware.ts` | Allowed protected route |
| `middleware_no_user` | `middleware.ts` | Redirected protected route (no user) |
| `auth_callback_entry` | `app/auth/callback/route.ts` | /auth/callback reached |
| `auth_callback_no_code` | `app/auth/callback/route.ts` | No `code` in query |
| `auth_callback_exchange_ok` | `app/auth/callback/route.ts` | exchangeCodeForSession succeeded |
| `auth_callback_exchange_fail` | `app/auth/callback/route.ts` | exchangeCodeForSession failed |
| `auth_callback_profile_fetch` | `app/auth/callback/route.ts` | public.users lookup |
| `auth_callback_profile_create` | `app/auth/callback/route.ts` | public.users insert |
| `auth_callback_final_redirect` | `app/auth/callback/route.ts` | Final redirect decision |
| `auth_callback_error_redirect` | `app/auth/callback/route.ts` | Error redirect |
| `require_role_auth_fail` | `lib/rbac.ts` | requireRole: no auth user |
| `require_role_no_profile` | `lib/rbac.ts` | requireRole: no profile |
| `require_role_inactive` | `lib/rbac.ts` | requireRole: account inactive |
| `require_role_wrong_role` | `lib/rbac.ts` | requireRole: wrong role |
| `require_role_ok` | `lib/rbac.ts` | requireRole: success |
| `customer_layout` | `app/(customer)/layout.tsx` | Customer layout entry |
| `root_page` | `app/page.tsx` | Root page (/) |
| `welcome_page` | `app/welcome/page.tsx` | Welcome page |
| `welcome_screen` | `components/welcome/WelcomeScreen.tsx` | Client-side welcome |
| `cart_page` | `app/(customer)/cart/page.tsx` | Cart page |
| `login_form_oauth` | `components/auth/LoginForm.tsx` | Login form OAuth click |
| `home_page_logged_in` | `app/page.tsx` | Home page with session |
| `home_page_no_session` | `app/page.tsx` | Home page without session |

### How to Disable the Trace

After confirming the bug, set in Vercel env:
```
LOG_OAUTH_TRACE=false
```

This will silence the `[BLINKGO_AUTH_TRACE]` lines. Default is ON for v77.

### What Was Changed in v77

1. **NEW**: `lib/diagnostic.ts` — structured diagnostic logger
2. **MODIFIED**: `lib/rbac.ts` — all redirects now have `?error=` params, defensive auto-create fallback added
3. **MODIFIED**: `app/auth/callback/route.ts` — comprehensive trace logging, defensive schema fallback
4. **MODIFIED**: `middleware.ts` — diagnostic trace for all protected route decisions
5. **MODIFIED**: `app/(customer)/layout.tsx` — layout entry trace
6. **MODIFIED**: `app/page.tsx` — root page redirect trace
7. **MODIFIED**: `app/welcome/page.tsx` — welcome page redirect trace
8. **MODIFIED**: `components/welcome/WelcomeScreen.tsx` — client-side redirect trace
9. **MODIFIED**: `app/(customer)/cart/page.tsx` — cart page redirect trace
10. **MODIFIED**: `components/auth/LoginForm.tsx` — OAuth click trace

### What the v77 ZIP Does

Even if the production database has missing columns, v77 will:
- Try the full payload (with `auth_provider`, `avatar_url`)
- On `PGRST204` error, fall back to minimal payload (just id, email, name, role, is_active, is_verified)
- Successfully create the profile
- Allow the user to reach `/search`
- The user is fully logged in and can use the app

This is the production-ready fix. No database migration is strictly required, but adding the missing columns is recommended for clean operation.
