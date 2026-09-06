#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const configuration = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
assert.equal(configuration.crons, undefined, 'Frequent jobs must run on Supabase Cron, not Vercel Hobby Cron');
const schedulerMigration = readFileSync(
  resolve('supabase/migrations/20260906023000_supabase_background_scheduler.sql'),
  'utf8',
);
const proxySource = readFileSync(resolve('proxy.ts'), 'utf8');
assert.match(proxySource, /['"]\/api\/cron['"]/, 'Authenticated background jobs must bypass only the storefront launch gate');
const configured = new Map();
for (const match of schedulerMigration.matchAll(
  /cron\.schedule\('[^']+','([^']+)',\$job\$SELECT public\.invoke_blinkgo_cron\('([^']+)'\);\$job\$\)/g,
)) {
  configured.set(match[2], match[1]);
}
const routeRoot = resolve('app/api/cron');
const routes = readdirSync(routeRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/api/cron/${entry.name}`)
  .sort();

assert.equal(configured.size, routes.length, 'Every cron route must have exactly one schedule');
assert.deepEqual([...configured.keys()].sort(), routes, 'Cron routes and deployed schedules must match exactly');

for (const route of routes) {
  const source = readFileSync(join(routeRoot, route.split('/').at(-1), 'route.ts'), 'utf8');
  assert.match(source, /export\s+(?:async\s+function\s+GET|const\s+GET)/, `${route} must support authenticated scheduler GET`);
  assert.match(source, /CRON_SECRET/, `${route} must require the shared cron secret`);
}

assert.equal(configured.get('/api/cron/scheduled-orders'), '* * * * *');
assert.equal(configured.get('/api/cron/retail-replacements'), '* * * * *');
assert.equal(configured.get('/api/cron/reconcile-payments'), '*/15 * * * *');
assert.equal(configured.get('/api/cron/cleanup-drafts'), '0 * * * *');

assert.match(schedulerMigration, /vault\.decrypted_secrets/, 'Scheduler credentials must come from Supabase Vault');
assert.match(schedulerMigration, /REVOKE ALL ON FUNCTION/, 'Scheduler helper must not be public');

console.log(`Scheduler contract: PASS (${routes.length} routes, ${configured.size} Supabase schedules)`);
