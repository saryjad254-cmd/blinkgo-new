# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please email security@blinkgo.de
(do NOT file a public GitHub issue). We will respond within 24 hours.

## Secret Scanning

This repository uses [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
to detect leaked credentials. All real secrets (Supabase keys, Resend API key,
Google Maps key, etc.) MUST be in environment variables only — never in
the source code.

### Setup

1. Copy `.env.example` to `.env` (local) or set env vars in Vercel.
2. `.env` is gitignored — never commit it.
3. All test scripts read from env vars at runtime.
4. If you need to add a new secret, add a placeholder to `.env.example` and
   document the variable in `docs/ENVIRONMENT_SETUP.md`.

### If a Secret Leaks

If you accidentally commit a real secret:

1. **Rotate it immediately** in the source (Supabase dashboard, Resend
   dashboard, Google Cloud Console, etc.).
2. Update Vercel env vars and redeploy.
3. Clean the secret from Git history:
   ```bash
   ./scripts/remove-secrets-from-history.sh
   git push --force --all
   git push --force --tags
   ```
4. Inform all collaborators to re-clone.
5. Verify GitHub Secret Scanning now passes:
   https://github.com/YOUR_ORG/blinkgo/security/secret-scanning

### CI / Pre-commit

We recommend adding a pre-commit hook that runs:

```bash
# .git/hooks/pre-commit
#!/bin/sh
if grep -rE 'sb_secret_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}' --include='*.{ts,tsx,js,jsx,md,json,sql}' --exclude-dir=node_modules --exclude-dir=.next --exclude=.env . ; then
  echo "ERROR: Real secret detected in code. Use env vars instead."
  exit 1
fi
```

## Files That Must NEVER Contain Real Secrets

- `scripts/*.js` — test scripts that hit external services
- `app/**/route.ts` — API routes
- `app/**/page.tsx` — pages (especially auth pages)
- `components/**` — React components
- `lib/**` — server-side libraries
- `docs/**` — documentation
- `README.md`, `*.md` — all markdown

## What's OK to Commit

- Project references like `rhdaffhlrglyknxtucux.supabase.co` (this is in
  every public API URL — not a secret)
- Cookie names like `sb-rhdaffhlrglyknxtucux-auth-token` (project ref is
  public)
- File paths, table names, column names
- Translations, copy, code structure
