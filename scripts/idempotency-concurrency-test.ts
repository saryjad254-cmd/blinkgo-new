import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { InMemoryIdempotencyStore, withIdempotency } from '../lib/api/idempotency';

function request(path: string, key: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': key },
  });
}

async function body(response: NextResponse): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const store = new InMemoryIdempotencyStore();
  let executions = 0;
  let startOriginal: (() => void) | undefined;
  const originalStarted = new Promise<void>((resolve) => { startOriginal = resolve; });
  let finishOriginal: (() => void) | undefined;
  const originalMayFinish = new Promise<void>((resolve) => { finishOriginal = resolve; });

  const ctx = {
    req: request('/api/orders', 'order-key-00000001'),
    user: { id: 'customer-a' },
    method: 'POST',
  };
  const options = { store, fingerprint: { restaurant_id: 'restaurant-a', total: 25 } };

  const original = withIdempotency(ctx, async () => {
    executions += 1;
    startOriginal?.();
    await originalMayFinish;
    return NextResponse.json({ ok: true, data: { order_id: 'order-1' } }, { status: 201 });
  }, options);

  await originalStarted;
  const concurrent = await withIdempotency(
    { ...ctx, req: request('/api/orders', 'order-key-00000001') },
    async () => {
      executions += 1;
      return NextResponse.json({ ok: true, data: { order_id: 'wrong' } });
    },
    options,
  );
  assert.equal(concurrent.status, 409, 'concurrent retry must not execute');
  assert.equal(concurrent.headers.get('Retry-After'), '1');
  assert.equal(((await body(concurrent)).error as { code: string }).code, 'IDEMPOTENCY_IN_PROGRESS');
  assert.equal(executions, 1);

  finishOriginal?.();
  const first = await original;
  assert.equal(first.status, 201);

  const replay = await withIdempotency(
    { ...ctx, req: request('/api/orders', 'order-key-00000001') },
    async () => {
      executions += 1;
      return NextResponse.json({ ok: true, data: { order_id: 'wrong' } });
    },
    options,
  );
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('X-Idempotency-Replayed'), 'true');
  assert.deepEqual(await body(replay), await body(first));
  assert.equal(executions, 1, 'cached retry must not execute handler');

  const conflict = await withIdempotency(
    { ...ctx, req: request('/api/orders', 'order-key-00000001') },
    async () => NextResponse.json({ ok: true }),
    { store, fingerprint: { restaurant_id: 'restaurant-b', total: 99 } },
  );
  assert.equal(conflict.status, 409);
  assert.equal(((await body(conflict)).error as { code: string }).code, 'IDEMPOTENCY_KEY_REUSED');

  let releasedExecutions = 0;
  const failureKey = 'order-key-failure-0001';
  const failed = await withIdempotency(
    { ...ctx, req: request('/api/orders', failureKey) },
    async () => {
      releasedExecutions += 1;
      return NextResponse.json({ ok: false, error: { code: 'TEMPORARY' } }, { status: 503 });
    },
    { store, fingerprint: { order: 2 } },
  );
  assert.equal(failed.status, 503);

  const retryAfterFailure = await withIdempotency(
    { ...ctx, req: request('/api/orders', failureKey) },
    async () => {
      releasedExecutions += 1;
      return NextResponse.json({ ok: true, data: { order_id: 'order-2' } });
    },
    { store, fingerprint: { order: 2 } },
  );
  assert.equal(retryAfterFailure.status, 200);
  assert.equal(releasedExecutions, 2, 'failed responses must release their claim');

  let isolatedExecutions = 0;
  await withIdempotency(
    { req: request('/api/orders', 'shared-key-00000001'), user: { id: 'customer-a' }, method: 'POST' },
    async () => { isolatedExecutions += 1; return NextResponse.json({ ok: true }); },
    { store, fingerprint: { value: 1 } },
  );
  await withIdempotency(
    { req: request('/api/orders', 'shared-key-00000001'), user: { id: 'customer-b' }, method: 'POST' },
    async () => { isolatedExecutions += 1; return NextResponse.json({ ok: true }); },
    { store, fingerprint: { value: 1 } },
  );
  await withIdempotency(
    { req: request('/api/refunds', 'shared-key-00000001'), user: { id: 'customer-a' }, method: 'POST' },
    async () => { isolatedExecutions += 1; return NextResponse.json({ ok: true }); },
    { store, fingerprint: { value: 1 } },
  );
  assert.equal(isolatedExecutions, 3, 'keys must be isolated by user and route');

  const migration = readFileSync(
    'supabase/migrations/20260825201435_durable_order_idempotency.sql',
    'utf8',
  );
  const orderRoute = readFileSync('app/api/orders/route.ts', 'utf8');
  assert.match(migration, /alter table public\.idempotency_keys enable row level security/i);
  assert.match(migration, /revoke all on table public\.idempotency_keys from anon, authenticated/i);
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /on conflict \(key, scope\) do nothing/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /request_fingerprint/i);
  assert.match(migration, /grant execute on function public\.claim_idempotency_key[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.claim_idempotency_key[\s\S]*from public, anon, authenticated/i);
  assert.match(orderRoute, /\{ fingerprint: input \}/);
  assert.match(orderRoute, /`BLGI\$\{crypto\.createHash\('sha256'\)/);

  console.log('Idempotency concurrency and migration contract: PASS');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
