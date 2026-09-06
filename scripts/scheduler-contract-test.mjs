#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const configuration = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const configured = new Map(configuration.crons.map((entry) => [entry.path, entry.schedule]));
const routeRoot = resolve('app/api/cron');
const routes = readdirSync(routeRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/api/cron/${entry.name}`)
  .sort();

assert.equal(configured.size, routes.length, 'Every cron route must have exactly one schedule');
assert.deepEqual([...configured.keys()].sort(), routes, 'Cron routes and deployed schedules must match exactly');

for (const route of routes) {
  const source = readFileSync(join(routeRoot, route.split('/').at(-1), 'route.ts'), 'utf8');
  assert.match(source, /export\s+(?:async\s+function\s+GET|const\s+GET)/, `${route} must support Vercel Cron GET`);
  assert.match(source, /CRON_SECRET/, `${route} must require the shared cron secret`);
}

assert.equal(configured.get('/api/cron/scheduled-orders'), '* * * * *');
assert.equal(configured.get('/api/cron/retail-replacements'), '* * * * *');
assert.equal(configured.get('/api/cron/reconcile-payments'), '*/15 * * * *');
assert.equal(configured.get('/api/cron/cleanup-drafts'), '0 * * * *');

console.log(`Scheduler contract: PASS (${routes.length} routes, ${configured.size} schedules)`);
