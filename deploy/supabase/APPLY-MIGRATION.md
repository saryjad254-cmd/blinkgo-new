# How to apply the email_otps migration

The `email_otps` table is required for all OTP-based flows (signup, resend,
verify, magic link, password reset). Without it, every OTP endpoint returns
`INTERNAL_ERROR: Verification code could not be saved. The email_otps
table is missing — apply the migration`.

## Option 1 — Supabase Dashboard (recommended, 30 seconds)

1. Open https://supabase.com/dashboard/project/rhdaffhlrglyknxtucux/sql
2. Paste the contents of `00-INIT-EMAIL-OTPS.sql`
3. Click **Run**
4. Confirm the table is created by running:
   ```sql
   SELECT COUNT(*) FROM public.email_otps;
   ```
   (Should return 0, not an error)

## Option 2 — Supabase CLI (if you have a PAT)

```bash
export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxxxxxx"
supabase link --project-ref rhdaffhlrglyknxtucux
supabase db push --include-all
```

## Option 3 — Direct psql (if you have the DB password)

The DB password is **separate** from `SUPABASE_SERVICE_ROLE_KEY`. Get it from
Dashboard → Project Settings → Database → Connection string → Password.

```bash
psql "postgresql://postgres:<db-password>@db.rhdaffhlrglyknxtucux.supabase.co:5432/postgres" \
  -f deploy/supabase/00-INIT-EMAIL-OTPS.sql
```

## After applying

Re-run your Vercel deployment. The auth flow will work end-to-end:

- `POST /api/auth/register` → creates user, stores OTP, sends email
- `POST /api/auth/verify {email, code}` → consumes OTP, marks user verified
- `PUT /api/auth/verify {email}` → resends a fresh OTP (replaces old one)
- `POST /api/auth/reset-password {email}` → Supabase sends reset link

No filesystem writes. No in-memory state. Pure Supabase.
