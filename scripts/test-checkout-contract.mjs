import { readFileSync } from 'node:fs';

const files = {
  statusRoute: readFileSync('app/api/checkout/confirm/route.ts', 'utf8'),
  checkoutPage: readFileSync('app/(customer)/checkout/page.tsx', 'utf8'),
  successPage: readFileSync('app/(customer)/checkout/success/page.tsx', 'utf8'),
  paymentRoute: readFileSync('app/api/stripe/checkout/route.ts', 'utf8'),
};

const checks = [
  ['status route exports GET', /export const GET\s*=/.test(files.statusRoute)],
  ['status route keeps POST read-only with HTTP 405', /export const POST/.test(files.statusRoute) && /status:\s*405/.test(files.statusRoute)],
  ['status response strips sensitive fields', /delete safe\.client_secret/.test(files.statusRoute)],
  ['success page polls status with draft_id query', /\/api\/checkout\/confirm\?draft_id=/.test(files.successPage)],
  ['checkout page uses the Stripe checkout route', /\/api\/stripe\/checkout/.test(files.checkoutPage)],
  ['payment route creates checkout state', /export (?:async )?function POST|export const POST/.test(files.paymentRoute)],
  ['checkout UI does not POST to the status endpoint', !/fetch\(['"`]\/api\/checkout\/confirm['"`][\s\S]{0,180}method:\s*['"`]POST/.test(files.checkoutPage + files.successPage)],
];

let failures = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  if (!passed) failures += 1;
}

console.log(`\nCheckout contract: ${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exitCode = 1;
