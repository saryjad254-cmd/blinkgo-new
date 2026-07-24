# BlinkGo Auth Operator Runbook

> **Read this if you are the operator deploying the v73+ build.**
> Every change below the line "── CODE SIDE COMPLETE ──" is something
> **only you can do** (third-party console or env var). I cannot do it from
> the sandbox because it requires your account credentials, a verified
> domain, or shell access to the production database.

---

## Status

| # | Issue | Code side | Operator side |
|---|-------|-----------|----------------|
| 1 | Back to Login button | ✅ Fixed | – |
| 2 | Locale persistence | ✅ Fixed | – |
| 3 | Reset-password uses localhost | ✅ Fixed | Set `APP_URL` in Vercel |
| 4 | Magic link silent fail | ✅ Fixed | Run `00-INIT-MAGIC-LINK-TOKENS.sql` |
| 5 | Google login fails | ✅ Fixed (translates errors, prevents role escalation) | Enable Google in Supabase + Google Cloud |

---

## ── CODE SIDE COMPLETE ──

Everything above this line is already shipped in the codebase. Below this
line is **operator work** (your hands, your console).

---

## Operator Action 1 — Vercel environment variables

> **BLOCKED — OPERATOR ACTION REQUIRED**

Set these in the Vercel project → Settings → Environment Variables.

### Required (production only)

| Name | Value (example) | Purpose |
|------|-----------------|---------|
| `APP_URL` | `https://blinkgo.de` | Canonical base URL. **Used by every auth redirect.** Falls back to `NEXT_PUBLIC_APP_URL` if not set, but `APP_URL` is preferred. |
| `NEXT_PUBLIC_APP_URL` | `https://blinkgo.de` | Public mirror of `APP_URL` (some client code reads this). |
| `AUTH_ALLOWED_REDIRECT_HOSTS` | `blinkgo.de,www.blinkgo.de,trycloudflare.com,loca.lt,localhost:3000` | CSV of hostnames the auth layer accepts in redirects. Add your domain. Remove localhost for production-only builds. |

### How to set in Vercel

1. Go to https://vercel.com/dashboard → your project → Settings
2. Click "Environment Variables"
3. Add the keys above with values for **Production** (and **Preview** if needed)
4. Click "Save"
5. **Redeploy** (Deployments → ⋯ → Redeploy). The new build picks up the new env vars.

### Validation

After redeploy, hit this URL in a browser or `curl`:

```bash
curl -i -X POST https://blinkgo.de/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -H "Origin: https://blinkgo.de" \
  -d '{"email":"you@blinkgo.de"}'
```

Then check your email — the reset link must start with `https://blinkgo.de/reset-password?token=...` (NOT `localhost:3000`).

If the email link still shows `localhost:3000`:
- The build did not pick up the new env var → redeploy
- The email template in Supabase still hard-codes localhost → see Action 3

---

## Operator Action 2 — Supabase SQL migration (magic link)

> **BLOCKED — OPERATOR ACTION REQUIRED**

The `magic_link_tokens` table is missing in the Supabase project. The
code now correctly returns HTTP 503 with `code: MAGIC_LINK_UNAVAILABLE`
instead of silently faking success. To enable magic link, run this SQL.

### Steps

1. Open https://supabase.com/dashboard → your project
2. Go to SQL Editor (left sidebar)
3. Click "+ New query"
4. Paste the contents of `deploy/supabase/00-INIT-MAGIC-LINK-TOKENS.sql`
5. Click "Run"
6. Verify: a row appears in the `magic_link_tokens` table list

### What it creates

- `public.magic_link_tokens` table (uuid PK, email, user_id FK, token_hash UNIQUE, expires_at, used_at, created_ip, user_agent)
- 3 indexes (token_hash unique, email+created_at, user_id+created_at, expires_at)
- RLS policy: only `service_role` can read/write
- `public.cleanup_magic_link_tokens()` SECURITY DEFINER function for periodic cleanup

### Validation

After running the SQL, test the magic link end-to-end:

```bash
# Step 1: request magic link for demo@blinkgo.de
curl -i -X POST https://blinkgo.de/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -H "Origin: https://blinkgo.de" \
  -H "Cookie: blinkgo-locale=de" \
  -d '{"email":"demo@blinkgo.de"}'
# → 200 {"ok":true,"data":{"sent":true,"requestId":"..."}}

# Step 2: check email for the link
# (the link should be https://blinkgo.de/api/auth/magic-link/verify?token=<64-char-hex>)

# Step 3: click the link
# → browser redirects to /search (or /admin, /driver/dashboard based on role)
# → cookies set, session active
```

If you see HTTP 503 with `code: MAGIC_LINK_UNAVAILABLE` after applying the
SQL, the schema cache may be stale. In the Supabase dashboard, go to
Settings → API → "Reload schema".

---

## Operator Action 3 — Supabase Authentication URL Configuration

> **BLOCKED — OPERATOR ACTION REQUIRED**

### 3a. Site URL

In Supabase → Authentication → URL Configuration:

- **Site URL**: `https://blinkgo.de`

This is the URL users land on after email confirmation, password reset
(classic Supabase flow), and OAuth callbacks.

### 3b. Redirect URLs (allowlist)

Add all the URLs that the app may redirect to:

```
https://blinkgo.de/login
https://blinkgo.de/admin
https://blinkgo.de/driver/dashboard
https://blinkgo.de/restaurant/dashboard
https://blinkgo.de/search
https://blinkgo.de/auth/callback
https://blinkgo.de/api/auth/magic-link/verify
https://blinkgo.de/reset-password
https://blinkgo.de/forgot-password
```

Also add the tunnel / preview URLs for testing:

```
https://*.trycloudflare.com/auth/callback
https://*.loca.lt/auth/callback
http://localhost:3000/auth/callback   (dev only)
http://localhost:3000/api/auth/magic-link/verify   (dev only)
```

### 3c. Email template redirect variables

For the **classic Supabase password-reset email template** (the one that
runs when Resend is unavailable as a fallback):

In Supabase → Authentication → Email Templates → "Reset Password":

The template uses `{{ .ConfirmationURL }}` which Supabase builds from the
Site URL + the `redirectTo` you pass in `resetPasswordForEmail()`. Make
sure your Site URL is the production URL.

For the **branded BlinkGo reset email** (sent by `lib/email-password-reset.ts`),
the redirect URL is built from `APP_URL` directly — see Action 1.

---

## Operator Action 4 — Enable Google OAuth in Supabase

> **BLOCKED — OPERATOR ACTION REQUIRED**

### 4a. Google Cloud Console (OAuth consent + client)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create or select a project (e.g. `blinkgo-prod`)
3. Configure the **OAuth consent screen**:
   - User type: **External**
   - App name: **BlinkGo**
   - User support email: your address
   - Developer contact: your address
   - Scopes: `email`, `profile`, `openid` (minimum)
   - Test users: add the team emails (until you submit for verification)
4. Create **OAuth client ID**:
   - Application type: **Web application**
   - Name: **BlinkGo Web**
   - Authorized JavaScript origins:
     ```
     https://blinkgo.de
     https://www.blinkgo.de
     http://localhost:3000   (dev only)
     ```
   - Authorized redirect URIs:
     ```
     https://rhdaffhlrglyknxtucux.supabase.co/auth/v1/callback
     ```
     (replace with your actual Supabase project URL)

5. Copy the **Client ID** and **Client Secret**.

### 4b. Supabase Authentication → Providers → Google

1. Go to https://supabase.com/dashboard → your project → Authentication → Providers
2. Find **Google** in the list, toggle it ON
3. Paste the **Client ID** and **Client Secret** from Google Cloud
4. Click "Save"

### 4c. Verification

After enabling, test from a fresh browser:

```bash
# Server side: verify Google is enabled (this should return 200 with a URL)
curl -i "https://blinkgo.de/api/auth/oauth?provider=google&locale=de" \
  -H "Origin: https://blinkgo.de"
# → 200 {"ok":true,"data":{"url":"https://...supabase.co/auth/v1/authorize?provider=google&..."}}
```

In a browser:
1. Go to https://blinkgo.de/login
2. Click "Mit Google fortfahren"
3. Complete the Google consent
4. You should land on https://blinkgo.de/search (or /admin, /driver/dashboard based on role)

### What the app does (already coded)

- Shows translated error message if provider is not enabled (HTTP 503 + `code: OAUTH_PROVIDER_DISABLED`)
- Creates a `public.users` row with `role: 'customer'` (NEVER driver/restaurant/admin)
- Preserves `lang=de/ar/en` through the OAuth round-trip
- Re-asserts the `blinkgo-locale` cookie after the callback

---

## Operator Action 5 — Supabase Email Provider (Resend)

> **PARTIALLY BLOCKED — operator action may be required**

The `EMAIL_FROM` env var is set to `BlinkGo <onboarding@resend.dev>`.
Resend's test sender can only send to the Resend account owner.

To send to real customers:
1. Add and verify a domain in Resend (https://resend.com/domains)
2. Set in Vercel:
   - `EMAIL_FROM=BlinkGo <noreply@blinkgo.de>` (use your verified domain)
3. Redeploy

---

## Summary of file changes (code side)

| File | Change |
|------|--------|
| `app/register/page.tsx` | "Zurück zum Login" is now a Next.js `<Link href="/login">` |
| `app/login/page.tsx` | Reads `searchParams.lang` so `?lang=ar` paints in Arabic on first render |
| `app/register/page.tsx` | Same — client-side `useEffect` re-syncs locale from `?lang=` |
| `app/forgot-password/page.tsx` | Same — reads `?lang=` and persists to cookie |
| `app/reset-password/page.tsx` | Same — reads `?lang=` and persists to cookie |
| `app/layout.tsx` | Root layout reads `?lang=` from URL (via `x-url` header from middleware) so the `<html>` element has the right `lang` + `dir` on first paint |
| `lib/auth/redirect-url.ts` | **NEW** — canonical base URL helper, blocks localhost in production, allowlist, safeNextPath |
| `lib/i18n/server-translations.ts` | New `getServerLocaleFromRequest()` that also reads URL |
| `lib/i18n/I18nProvider.tsx` | After hydration, URL `?lang=` overrides cookie (highest priority) |
| `app/api/auth/reset-password/route.ts` | Uses canonical `getCanonicalBaseUrl`, appends `?lang=` to reset link, locale-aware email |
| `app/api/auth/magic-link/route.ts` | Uses canonical base URL, removes silent-fake-success when table missing, returns 503/502 with requestId |
| `app/api/auth/magic-link/verify/route.ts` | Uses canonical base URL, sets locale cookie on success, preserves lang in redirects |
| `app/api/auth/oauth/route.ts` | Uses canonical base URL, appends `?lang=` to callback, blocks on missing APP_URL |
| `app/auth/callback/route.ts` | Locale preserved through OAuth, role hard-coded to `customer`, safeNextPath, logs without leaking tokens |
| `middleware.ts` | Forwards `request.url` as `x-url` header so server components can read it |
| `deploy/supabase/00-INIT-MAGIC-LINK-TOKENS.sql` | **NEW** — `magic_link_tokens` table, indexes, RLS, cleanup function |
| `scripts/auth-flow-test.js` | **NEW** — 60 tests covering all 5 issues + open-redirect + role-escalation |

---

## How to test after operator config is done

```bash
# 1) Reset password uses production URL
curl -i -X POST https://blinkgo.de/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -H "Origin: https://blinkgo.de" \
  -d '{"email":"demo@blinkgo.de"}'
# Check the email — link must start with https://blinkgo.de/reset-password?token=...

# 2) Magic link
curl -i -X POST https://blinkgo.de/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -H "Origin: https://blinkgo.de" \
  -d '{"email":"demo@blinkgo.de"}'
# → 200 {"ok":true,"data":{"sent":true,"requestId":"..."}}
# Check email, click link → land on /search with cookies set

# 3) Google OAuth
# Open https://blinkgo.de/login in browser, click "Mit Google fortfahren"
# Complete consent → land on /search

# 4) Locale persistence
# Click the language switcher in the header, select Arabic.
# Navigate to /login, /register, /forgot-password, /reset-password.
# All pages must render in Arabic with RTL layout.
# Refresh — language sticks.

# 5) Open redirect
curl -i "https://blinkgo.de/auth/callback?code=fake&next=//evil.com"
# → 307 → /login (not //evil.com)
```
