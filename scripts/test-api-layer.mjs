#!/usr/bin/env node
/**
 * API Layer Test Suite — Comprehensive
 * ───────────────────────────────────
 * Tests every public surface of lib/api/.
 */
import {
  apiRoute, ok, fail, methodNotAllowed, buildPaginatedMeta,
  parsePagination, parsePaginationSafe, parseCursor, encodeCursor, decodeCursor,
  withIdempotency, getIdempotencyKey, parseUploadedFile, parseUploadedFiles,
  IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, DOCUMENT_MIME_TYPES, DOCUMENT_EXTENSIONS,
} from '../lib/api/canonical';
import { z } from '../lib/foundation/zod-mini';

let pass = 0;
let failCount = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { failCount++; console.log('FAIL', name); }
}

console.log('--- API Layer Comprehensive Test Suite ---\n');

// ── 1. Pagination meta builder ─────────────────────────────
t('buildPaginatedMeta first page', JSON.stringify(buildPaginatedMeta(100, 1, 20)) === '{"page":1,"limit":20,"total":100,"totalPages":5,"hasNext":true,"hasPrev":false}');
t('buildPaginatedMeta middle page', JSON.stringify(buildPaginatedMeta(100, 3, 20)) === '{"page":3,"limit":20,"total":100,"totalPages":5,"hasNext":true,"hasPrev":true}');
t('buildPaginatedMeta last page', JSON.stringify(buildPaginatedMeta(100, 5, 20)) === '{"page":5,"limit":20,"total":100,"totalPages":5,"hasNext":false,"hasPrev":true}');
t('buildPaginatedMeta empty', JSON.stringify(buildPaginatedMeta(0, 1, 20)) === '{"page":1,"limit":20,"total":0,"totalPages":1,"hasNext":false,"hasPrev":false}');
t('buildPaginatedMeta single page', JSON.stringify(buildPaginatedMeta(5, 1, 20)) === '{"page":1,"limit":20,"total":5,"totalPages":1,"hasNext":false,"hasPrev":false}');

// ── 2. methodNotAllowed ─────────────────────────────────────
const m = methodNotAllowed('GET');
t('methodNotAllowed returns 405', m.status === 405);
t('methodNotAllowed has Allow header', m.headers.get('Allow') === 'GET');

// ── 3. apiRoute is a function ──────────────────────────────
t('apiRoute is a function', typeof apiRoute === 'function');

// ── 4. Method validation ───────────────────────────────────
{
  const handler = apiRoute({
    method: 'GET',
    auth: 'public',
    handler: async () => ok({ hello: 'world' }),
  });
  const req = new Request('http://localhost/test', { method: 'GET' });
  const res = await handler(req);
  t('GET handler responds 200 to GET', res.status === 200);
  const body = await res.json();
  t('GET handler returns hello=world', body.data?.hello === 'world');

  const req2 = new Request('http://localhost/test', { method: 'POST' });
  const res2 = await handler(req2);
  t('GET handler responds 405 to POST', res2.status === 405);
  t('GET handler responds 405 with Allow header', res2.headers.get('Allow') === 'GET');

  const req3 = new Request('http://localhost/test', { method: 'DELETE' });
  const res3 = await handler(req3);
  t('GET handler responds 405 to DELETE', res3.status === 405);
}

// ── 5. Response headers ────────────────────────────────────
{
  const handler = apiRoute({
    method: 'GET',
    auth: 'public',
    handler: async () => ok({ x: 1 }),
  });
  const res = await handler(new Request('http://localhost/test', { method: 'GET' }));
  t('Response has X-Request-Id', !!res.headers.get('X-Request-Id'));
  t('Response has X-Response-Time', !!res.headers.get('X-Response-Time'));
}

// ── 6. Body validation ─────────────────────────────────────
{
  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    bodySchema: z.object({
      name: z.string(),
      age: z.number(),
    }),
    handler: async ({ body }) => ok({ name: body.name, age: body.age }),
  });
  const okRes = await handler(
    new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    }),
  );
  t('Valid body returns 200', okRes.status === 200);
  const okBody = await okRes.json();
  t('Valid body returns correct data', okBody.data?.name === 'Alice');

  const errRes = await handler(
    new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age: 30 }),
    }),
  );
  t('Invalid body returns 400', errRes.status === 400);
  const errBody = await errRes.json();
  t('Invalid body has VALIDATION_ERROR code', errBody.error?.code === 'VALIDATION_ERROR');
}

// ── 7. Cache-Control ───────────────────────────────────────
{
  const handler = apiRoute({
    method: 'GET',
    auth: 'public',
    cacheControl: 'public, max-age=300',
    handler: async () => ok({ x: 1 }),
  });
  const res = await handler(new Request('http://localhost/test', { method: 'GET' }));
  t('Response has Cache-Control header', res.headers.get('Cache-Control')?.includes('max-age=300'));
}

// ── 8. Multiple body schemas (nested) ─────────────────────
{
  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    bodySchema: z.object({
      user: z.object({
        name: z.string(),
        email: z.string(),
      }),
    }),
    handler: async ({ body }) => ok({ received: body.user }),
  });
  const res = await handler(
    new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: { name: 'Bob', email: 'bob@example.com' } }),
    }),
  );
  t('Nested schema validation works', res.status === 200);
  const body = await res.json();
  t('Nested data flows through', body.data?.received?.email === 'bob@example.com');
}

// ── 9. Pagination helpers ──────────────────────────────────
{
  const q = { page: '2', limit: '20' };
  const p = parsePagination(q);
  t('parsePagination page=2, limit=20', p.page === 2 && p.limit === 20 && p.offset === 20);

  const p2 = parsePagination({});
  t('parsePagination defaults', p2.page === 1 && p2.limit === 20 && p2.offset === 0);

  const p3 = parsePaginationSafe({ page: 'invalid', limit: '999' });
  t('parsePaginationSafe falls back on invalid', p3.page === 1);

  try {
    parsePagination({ page: '-1' });
    t('parsePagination throws on negative page', false);
  } catch (e) {
    t('parsePagination throws on negative page', true);
  }

  try {
    parsePagination({ limit: '1000' });
    t('parsePagination throws on limit > MAX', false);
  } catch (e) {
    t('parsePagination throws on limit > MAX', true);
  }
}

// ── 10. Cursor encoding/decoding ───────────────────────────
{
  const cursor = encodeCursor({ id: '123', ts: 1700000000 });
  const decoded = decodeCursor(cursor);
  t('Cursor round-trip', decoded?.id === '123' && decoded?.ts === 1700000000);

  const invalid = decodeCursor('not-valid-base64!@#$');
  t('Invalid cursor returns null', invalid === null);

  const parsed = parseCursor({ cursor: 'abc', limit: '50' });
  t('parseCursor with cursor', parsed.cursor === 'abc' && parsed.limit === 50);

  const noCursor = parseCursor({});
  t('parseCursor without cursor', noCursor.cursor === undefined && noCursor.limit === 20);
}

// ── 11. Idempotency helpers ────────────────────────────────
{
  const req = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': 'test-123' },
  });
  t('getIdempotencyKey returns key', getIdempotencyKey(req) === 'test-123');

  const reqNoKey = new Request('http://localhost/test', { method: 'POST' });
  t('getIdempotencyKey returns null when missing', getIdempotencyKey(reqNoKey) === null);
}

// ── 12. Idempotency wrapper ────────────────────────────────
{
  let innerCallCount = 0;
  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    handler: async ({ req, user }) => {
      // The OUTER handler is called every time apiRoute runs the body
      // but the INNER (inside withIdempotency) should only run once
      return withIdempotency(
        { req, user, method: 'POST' },
        async () => {
          innerCallCount++;
          return ok({ call: innerCallCount });
        },
      );
    },
  });

  const req1 = new Request('http://localhost/test', {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': 'idem-test-1',
    },
  });
  const res1 = await handler(req1);
  t('Idempotency: first call succeeds', res1.status === 200);
  t('Idempotency: first call runs inner', innerCallCount === 1);

  // Second call with same key — should hit cache
  const res2 = await handler(req1);
  t('Idempotency: second call still 200', res2.status === 200);
  t('Idempotency: second call does NOT run inner (cached)', innerCallCount === 1);

  // Different key — should run inner again
  const req3 = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': 'idem-test-2' },
  });
  await handler(req3);
  t('Idempotency: different key runs inner', innerCallCount === 2);
}

// ── 13. Upload helpers (constants) ────────────────────────
t('IMAGE_MIME_TYPES has 5 types', IMAGE_MIME_TYPES.length === 5);
t('IMAGE_EXTENSIONS has 6 exts', IMAGE_EXTENSIONS.length === 6);
t('DOCUMENT_MIME_TYPES has 3 types', DOCUMENT_MIME_TYPES.length === 3);
t('DOCUMENT_EXTENSIONS has 3 exts', DOCUMENT_EXTENSIONS.length === 3);

// ── 14. Error envelope shape ───────────────────────────────
{
  const failRes = fail(new Error('test'));
  t('fail() returns valid response', failRes.status === 500);
  const body = await failRes.json();
  t('fail() envelope has ok:false', body.ok === false);
  t('fail() envelope has error', body.error?.message !== undefined);
  t('fail() envelope has requestId', typeof body.requestId === 'string');
}

// ── 15. ok() envelope shape ────────────────────────────────
{
  const okRes = ok({ user: { id: 1 } }, { extra: 'meta' });
  const body = await okRes.json();
  t('ok() returns ok:true', body.ok === true);
  t('ok() returns data', body.data?.user?.id === 1);
  t('ok() returns meta', body.meta?.extra === 'meta');
}

// ── 16. Query params parsing ──────────────────────────────
{
  const handler = apiRoute({
    method: 'GET',
    auth: 'public',
    handler: async ({ query }) => {
      return ok({ q: query.q, page: query.page });
    },
  });
  const url = 'http://localhost/test?q=hello&page=2';
  const res = await handler(new Request(url, { method: 'GET' }));
  const body = await res.json();
  t('Query param q', body.data?.q === 'hello');
  t('Query param page', body.data?.page === '2');
}

// ── 17. Context typing (compile-time check via handler)
{
  let ctxPassed = null;
  const handler = apiRoute({
    method: 'GET',
    auth: 'public',
    handler: async (ctx) => {
      ctxPassed = ctx;
      return ok({ ip: ctx.ip, ua: ctx.userAgent });
    },
  });
  const req = new Request('http://localhost/test', {
    method: 'GET',
    headers: {
      'X-Forwarded-For': '1.2.3.4',
      'User-Agent': 'Test/1.0',
    },
  });
  await handler(req);
  t('Context has ip', ctxPassed?.ip !== undefined);
  t('Context has userAgent', ctxPassed?.userAgent === 'Test/1.0');
  t('Context has requestId', typeof ctxPassed?.requestId === 'string');
  t('Context has startTime', typeof ctxPassed?.startTime === 'number');
  t('Context has method', ctxPassed?.method === 'GET');
  t('Context has path', ctxPassed?.path === '/test');
}

// ── 18. Multiple routes work in parallel ───────────────────
{
  const h1 = apiRoute({ method: 'GET', auth: 'public', handler: async () => ok({ id: 1 }) });
  const h2 = apiRoute({ method: 'GET', auth: 'public', handler: async () => ok({ id: 2 }) });
  const [r1, r2] = await Promise.all([
    h1(new Request('http://localhost/a', { method: 'GET' })),
    h2(new Request('http://localhost/b', { method: 'GET' })),
  ]);
  const b1 = await r1.json();
  const b2 = await r2.json();
  t('Parallel handlers return different data', b1.data?.id === 1 && b2.data?.id === 2);
}

// ── 19. File upload helpers ────────────────────────────────
{
  // Create a test file
  const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
  const formData = new FormData();
  formData.append('file', file);

  const req = new Request('http://localhost/upload', {
    method: 'POST',
    body: formData,
  });

  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    handler: async ({ req }) => {
      const uploaded = await parseUploadedFile(req, {
        fieldName: 'file',
        maxSize: 1024,
      });
      return ok({ name: uploaded.name, size: uploaded.size, hash: uploaded.hash });
    },
  });

  const res = await handler(req);
  t('File upload: text file accepted', res.status === 200);
  const body = await res.json();
  t('File upload: name preserved', body.data?.name === 'test.txt');
  t('File upload: size correct', body.data?.size === 11);
  t('File upload: hash computed', body.data?.hash?.length === 64);
}

// ── 20. File upload size limit ─────────────────────────────
{
  const big = new File([new Uint8Array(2000).fill(120)], 'big.bin', { type: 'application/octet-stream' });
  const fd = new FormData();
  fd.append('file', big);
  const req = new Request('http://localhost/upload', {
    method: 'POST',
    body: fd,
  });

  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    handler: async ({ req }) => {
      const uploaded = await parseUploadedFile(req, { maxSize: 1000 });
      return ok({ size: uploaded.size });
    },
  });

  const res = await handler(req);
  t('File upload: oversize rejected with 400', res.status === 400);
  const body = await res.json();
  t('File upload: VALIDATION_ERROR for oversize', body.error?.code === 'VALIDATION_ERROR');
}

// ── 21. File upload type validation ────────────────────────
{
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'doc.pdf', { type: 'application/pdf' });
  const fd = new FormData();
  fd.append('file', pdf);
  const req = new Request('http://localhost/upload', {
    method: 'POST',
    body: fd,
  });

  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    handler: async ({ req }) => {
      const uploaded = await parseUploadedFile(req, {
        allowedTypes: ['image/jpeg', 'image/png'],
      });
      return ok({ type: uploaded.type });
    },
  });

  const res = await handler(req);
  t('File upload: wrong type rejected with 400', res.status === 400);
}

// ── 22. Multi-file upload ─────────────────────────────────
{
  const f1 = new File(['aaa'], 'a.txt', { type: 'text/plain' });
  const f2 = new File(['bbb'], 'b.txt', { type: 'text/plain' });
  const fd = new FormData();
  fd.append('file1', f1);
  fd.append('file2', f2);
  const req = new Request('http://localhost/upload', {
    method: 'POST',
    body: fd,
  });

  const handler = apiRoute({
    method: 'POST',
    auth: 'public',
    handler: async ({ req }) => {
      const files = await parseUploadedFiles(req, { maxFiles: 5 });
      return ok({ count: files.length });
    },
  });

  const res = await handler(req);
  const body = await res.json();
  t('Multi-file upload: 2 files', body.data?.count === 2);
}

console.log(`\n${pass} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
