import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [registerPage, registerRoute, resetVerifyRoute, rateLimit, migration] = await Promise.all([
  read('app/register/page.tsx'),
  read('app/api/auth/register/route.ts'),
  read('app/api/auth/reset-password/verify/route.ts'),
  read('lib/rate-limit.ts'),
  read('supabase/migrations/20260824112356_signup_legal_acceptance.sql'),
]);

assert.match(registerPage, /register-legal-acceptance/);
assert.match(registerPage, /CUSTOMER_TERMS_VERSION/);
assert.match(registerPage, /PRIVACY_NOTICE_VERSION/);
assert.match(registerPage, /showConfirmPassword/);
assert.match(registerRoute, /acceptedTerms !== true/);
assert.match(registerRoute, /legal_acceptance_records/);
assert.match(registerRoute, /Legal acceptance rollback failed/);

assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all.*anon, authenticated/i);
assert.doesNotMatch(migration, /\b(email|ip_address|user_agent)\b\s+(text|varchar)/i);

assert.match(resetVerifyRoute, /timingSafeEqual/);
assert.match(resetVerifyRoute, /passwordResetVerify/);
assert.match(resetVerifyRoute, /RESET_TOKEN_STORE_UNAVAILABLE/);
assert.match(resetVerifyRoute, /\.is\('used_at', null\)/);
assert.doesNotMatch(resetVerifyRoute, /auth\.admin\.listUsers/);
assert.match(rateLimit, /passwordResetVerify/);

console.log('Auth registration and recovery contract: PASS');
