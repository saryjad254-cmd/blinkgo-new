#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routes = [
  'app/api/cron/retail-replacements/route.ts',
  'app/api/cron/scheduled-orders/route.ts',
  'app/api/cron/cleanup-drafts/route.ts',
];

let passed = 0;
for (const route of routes) {
  const source = readFileSync(resolve(route), 'utf8');
  assert.match(source, /if \(!expected\)[\s\S]{0,180}status: 503/, `${route} must fail closed without CRON_SECRET`);
  assert.match(source, /timingSafeEqual/, `${route} must compare the bearer secret in constant time`);
  assert.match(source, /searchParams\.size > 0/, `${route} must reject query parameters`);
  assert.doesNotMatch(source, /searchParams\.get\(['"]secret['"]\)/, `${route} must not accept a query-string secret`);
  passed += 4;
}

console.log(`Cron security contract: PASS (${passed}/${routes.length * 4})`);
