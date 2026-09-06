import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
let passed = 0;
function ok(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function loadReadiness(env) {
  const source = fs.readFileSync(path.join(root, 'lib/config/deployment-readiness.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,process,URL){${code}\n})`, {}, { filename: 'deployment-readiness.ts' })(require, loadedModule, loadedModule.exports, { env }, URL);
  return loadedModule.exports.getDeploymentReadiness();
}

const base = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_12345678901234567890',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-12345678901234567890',
  NEXT_PUBLIC_APP_URL: 'https://blinkgo.example',
  RESET_TOKEN_SECRET: 'r'.repeat(40),
  DRAFT_SIGNING_SECRET: 'd'.repeat(40),
  CRON_SECRET: 'c'.repeat(40),
  ALLOWED_ORIGINS: 'https://blinkgo.example',
  RESEND_API_KEY: 're_123456789012345678901234',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'p'.repeat(48),
  VAPID_PRIVATE_KEY: 'v'.repeat(32),
  VAPID_SUBJECT: 'mailto:ops@blinkgo.example',
};
const approvalKeys = ['LEGAL_REVIEW_STATUS', 'ACCESSIBILITY_REVIEW_STATUS', 'COOKIE_CONSENT_AUDIT_STATUS', 'TRADER_VERIFICATION_STATUS', 'CHECKOUT_LEGAL_REVIEW_STATUS', 'PRIVACY_DPIA_STATUS'];
const pending = loadReadiness({ ...base });
const pendingLegal = pending.items.filter((item) => item.category === 'legal');
ok(pendingLegal.length === 6 && pendingLegal.every((item) => item.status === 'missing' && item.required), 'Production blocks all six undocumented German/EU legal reviews');
const approved = loadReadiness({ ...base, ...Object.fromEntries(approvalKeys.map((key) => [key, 'APPROVED'])) });
ok(approved.items.filter((item) => item.category === 'legal').every((item) => item.status === 'ready'), 'Documented legal approvals turn green in deployment readiness');

const checkout = fs.readFileSync(path.join(root, 'app/(customer)/checkout/page.tsx'), 'utf8');
ok(checkout.includes("confirmOrder: 'Zahlungspflichtig bestellen'") && !checkout.includes('checkoutCopy.payNow'), 'Every checkout payment method uses the unambiguous statutory payment wording');
const cart = fs.readFileSync(path.join(root, 'app/(customer)/cart/page.tsx'), 'utf8');
ok(cart.includes("'Weiter zur Kasse'") && cart.includes('Noch keine Bestellung.'), 'Cart clearly opens review and does not pretend to place the paid order');
const consentHelper = fs.readFileSync(path.join(root, 'lib/privacy/consent.ts'), 'utf8');
const consentBanner = fs.readFileSync(path.join(root, 'components/privacy/CookieConsentBanner.tsx'), 'utf8');
const trackedSurfaces = [cart, checkout, fs.readFileSync(path.join(root, 'components/customer/ProductDetailModal.tsx'), 'utf8')];
ok(consentHelper.includes('analytics: false') && trackedSurfaces.every((file) => file.includes('hasAnalyticsConsent()')), 'Optional analytics are off by default and gated at every customer event source');
ok(consentBanner.includes('reject_non_essential') && consentBanner.includes('blinkgo:open-consent'), 'Consent can be rejected as easily as accepted and reopened for withdrawal');
const consentMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260811084212_consent_audit_records.sql'), 'utf8');
ok(consentMigration.includes('enable row level security') && consentMigration.includes('revoke all') && !consentMigration.includes('ip_address'), 'Consent audit table is RLS-protected and data-minimised');
const legalFiles = [
  fs.readFileSync(path.join(root, 'app/legal/impressum/page.tsx'), 'utf8'),
  fs.readFileSync(path.join(root, 'app/legal/agb/page.tsx'), 'utf8'),
].join('\n');
ok(!legalFiles.includes('ec.europa.eu/consumers/odr') && !legalFiles.includes('§ 5 TMG'), 'Legal pages remove the discontinued EU ODR link and obsolete TMG citation');
const proxy = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8');
ok(proxy.includes('LEGAL_LAUNCH_BLOCKED') && proxy.includes("status: 503"), 'Production middleware fails closed when launch evidence is incomplete');

console.log(`Germany legal readiness: PASS (${passed}/${passed})`);
