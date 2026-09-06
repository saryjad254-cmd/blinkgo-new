#!/usr/bin/env node

process.env.LOG_LEVEL = 'fatal';
process.env.NODE_ENV = 'test';

const [{ NextRequest, NextResponse }, { apiRoute }] = await Promise.all([
  import('next/server.js'),
  import('../lib/api/handler.ts'),
]);

const rateLimit = { limit: 2, windowSec: 900, name: `observability-test-${Date.now()}` };
const makeHandler = () => apiRoute({
  method: 'GET',
  auth: 'public',
  rateLimit,
  handler: async () => NextResponse.json({ ok: true }),
});

const first = makeHandler();
const second = makeHandler();
const request = (pathname) => new NextRequest(`http://localhost${pathname}`, {
  method: 'GET',
  headers: { 'x-forwarded-for': '198.51.100.42' },
});

const statuses = [];
statuses.push((await first(request('/api/first'))).status);
statuses.push((await first(request('/api/first'))).status);
statuses.push((await second(request('/api/second'))).status);
statuses.push((await second(request('/api/second'))).status);
statuses.push((await first(request('/api/first'))).status);

const expected = [200, 200, 200, 200, 429];
const passed = statuses.every((status, index) => status === expected[index]);
console.log(`${passed ? 'PASS' : 'FAIL'} API rate-limit buckets are path-scoped: ${statuses.join(', ')}`);
if (!passed) process.exitCode = 1;
