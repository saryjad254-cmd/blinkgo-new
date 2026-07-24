# Auth Audit Harness (v79)
End-to-end authentication test suite: 26 checks against the built app with a mock Supabase backend.

Run:
1. `node scripts/auth-audit/mock-supabase.mjs &`  (mock GoTrue + PostgREST on :54321)
2. Build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (NEXT_PUBLIC_* is inlined at build time), start on :3999
3. `node scripts/auth-audit/audit.mjs`

Covers: anonymous access, new Google account, existing account (role redirect), session cookie
creation + chunking (≤4096B), verifier cleanup, middleware detection, protected routes, refresh
persistence, SSR, OAuth error paths, logout, re-login. Last run: 26/26 passed.
