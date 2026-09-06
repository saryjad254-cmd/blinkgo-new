#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');

function loadReadiness(env) {
  const source = fs.readFileSync(path.join(root, 'lib/config/deployment-readiness.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,process,URL){${code}\n})`, {}, { filename: 'deployment-readiness.ts' })(require, loadedModule, loadedModule.exports, { env }, URL);
  return loadedModule.exports.getDeploymentReadiness();
}

const approvals = Object.fromEntries([
  'LEGAL_REVIEW_STATUS',
  'ACCESSIBILITY_REVIEW_STATUS',
  'COOKIE_CONSENT_AUDIT_STATUS',
  'TRADER_VERIFICATION_STATUS',
  'CHECKOUT_LEGAL_REVIEW_STATUS',
  'PRIVACY_DPIA_STATUS',
].map((key) => [key, 'APPROVED']));

const complete = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_123456789012345678901234',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-123456789012345678901234',
  NEXT_PUBLIC_APP_URL: 'https://blinkgo.de',
  RESET_TOKEN_SECRET: 'r'.repeat(40),
  DRAFT_SIGNING_SECRET: 'd'.repeat(40),
  DELIVERY_PIN_SECRET: 'p'.repeat(40),
  CRON_SECRET: 'c'.repeat(40),
  METRICS_TOKEN: 'm'.repeat(40),
  ALLOWED_ORIGINS: 'https://blinkgo.de,https://www.blinkgo.de',
  STRIPE_SECRET_KEY: `sk_live_${'s'.repeat(32)}`,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_${'p'.repeat(32)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(32)}`,
  GOOGLE_MAPS_API_KEY: `server_${'g'.repeat(32)}`,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: `browser_${'g'.repeat(32)}`,
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: 'BLINKGO_MAP_2026',
  RESEND_API_KEY: `re_${'r'.repeat(32)}`,
  RESEND_WEBHOOK_SECRET: `whsec_${'e'.repeat(32)}`,
  EMAIL_FROM: 'BlinkGo <auth@blinkgo.de>',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'v'.repeat(48),
  VAPID_PRIVATE_KEY: 'k'.repeat(32),
  VAPID_SUBJECT: 'mailto:support@blinkgo.de',
  ...approvals,
};

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
function item(env, id) {
  return loadReadiness(env).items.find((entry) => entry.id === id);
}

check(loadReadiness(complete).ready, 'complete production contract passes');
check(item({ ...complete, STRIPE_SECRET_KEY: '' }, 'stripe')?.status === 'missing', 'Stripe is launch-required');
check(item({ ...complete, STRIPE_SECRET_KEY: `sk_test_${'s'.repeat(32)}` }, 'stripe')?.status === 'missing', 'test Stripe secret is rejected in production');
check(item({ ...complete, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_${'p'.repeat(32)}` }, 'stripe')?.status === 'missing', 'test Stripe publishable key is rejected in production');
check(item({ ...complete, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: complete.GOOGLE_MAPS_API_KEY }, 'maps')?.status === 'missing', 'Maps browser and server keys must differ');
check(item({ ...complete, NEXT_PUBLIC_APP_URL: 'https://example.com' }, 'app_url')?.status === 'missing', 'non-BlinkGo app host is rejected');
check(item({ ...complete, ALLOWED_ORIGINS: '*' }, 'allowed_origins')?.status === 'missing', 'wildcard origin is rejected');
check(item({ ...complete, ALLOWED_ORIGINS: 'http://localhost:3000' }, 'allowed_origins')?.status === 'missing', 'localhost origin is rejected');
check(item({ ...complete, RESEND_API_KEY: '', SENDGRID_API_KEY: `SG.${'x'.repeat(32)}` }, 'email')?.status === 'missing', 'production email requires the approved Resend path');
check(item({ ...complete, NEXT_PUBLIC_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' }, 'supabase_url')?.status === 'missing', 'production Supabase URL requires HTTPS');

console.log(`Production readiness gate: PASS (${passed}/${passed})`);
