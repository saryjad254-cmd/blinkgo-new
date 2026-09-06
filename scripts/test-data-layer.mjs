#!/usr/bin/env node
/**
 * Data Layer Test Suite
 * ────────────────────
 * Smoke-tests every public surface of lib/data/ and lib/repositories/.
 * Run with: `npx tsx scripts/test-data-layer.mjs`
 */
import {
  createBrowserClient, createServerClient, createServiceClient,
  dbCall, withRetry, mapDbError, isDbError, QueryBuilder,
  normalizePagination, buildPaginatedResult, parseSort, SOFT_DELETE_COLUMN,
} from '../lib/data';
import {
  users, orders, restaurants, products, notifications,
  drivers, payments, addresses, favorites, coupons, support,
} from '../lib/repositories';

let pass = 0;
let failCount = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { failCount++; console.log('FAIL', name); }
}

console.log('--- Data Layer Test Suite ---\n');

// ── Pagination helpers ──────────────────────────────────────
t('normalizePagination default', JSON.stringify(normalizePagination(undefined)) === '{"page":1,"limit":20}');
t('normalizePagination page=2 limit=50', JSON.stringify(normalizePagination({ page: 2, limit: 50 })) === '{"page":2,"limit":50}');
t('normalizePagination clamps limit to 100', normalizePagination({ limit: 999 }).limit === 100);
t('normalizePagination clamps page to >=1', normalizePagination({ page: -5 }).page === 1);
t('buildPaginatedResult', buildPaginatedResult([1, 2, 3], 30, { page: 1, limit: 3 }).totalPages === 10);
t('buildPaginatedResult empty', buildPaginatedResult([], 0, { page: 1, limit: 20 }).totalPages === 1);

// ── Sort parser ─────────────────────────────────────────────
t('parseSort default', parseSort(undefined, ['name'], { column: 'name', direction: 'desc' }).column === 'name');
t('parseSort valid', parseSort('created_at:asc', ['created_at'], { column: 'name', direction: 'desc' }).direction === 'asc');
t('parseSort invalid column uses default', parseSort('evil:asc', ['name'], { column: 'name', direction: 'desc' }).column === 'name');

// ── SOFT_DELETE_COLUMN ──────────────────────────────────────
t('SOFT_DELETE_COLUMN', SOFT_DELETE_COLUMN === 'deleted_at');

// ── QueryBuilder methods exist ─────────────────────────────
t('QueryBuilder is a class', typeof QueryBuilder === 'function');
const mockQuery = {
  select: () => mockQuery,
  eq: () => mockQuery,
  neq: () => mockQuery,
  in: () => mockQuery,
  gte: () => mockQuery,
  lte: () => mockQuery,
  gt: () => mockQuery,
  lt: () => mockQuery,
  is: () => mockQuery,
  like: () => mockQuery,
  ilike: () => mockQuery,
  contains: () => mockQuery,
  or: () => mockQuery,
  order: () => mockQuery,
  range: () => mockQuery,
  limit: () => mockQuery,
  single: () => mockQuery,
  maybeSingle: () => mockQuery,
  then: (resolve) => Promise.resolve({ data: [{ id: 1, name: 'A' }], count: 1, error: null }).then(resolve),
};
const qb = new QueryBuilder(mockQuery);
t('QueryBuilder.select', typeof qb.select === 'function');
t('QueryBuilder.eq', typeof qb.eq === 'function');
t('QueryBuilder.neq', typeof qb.neq === 'function');
t('QueryBuilder.in', typeof qb.in === 'function');
t('QueryBuilder.gte', typeof qb.gte === 'function');
t('QueryBuilder.lte', typeof qb.lte === 'function');
t('QueryBuilder.gt', typeof qb.gt === 'function');
t('QueryBuilder.lt', typeof qb.lt === 'function');
t('QueryBuilder.is', typeof qb.is === 'function');
t('QueryBuilder.like', typeof qb.like === 'function');
t('QueryBuilder.ilike', typeof qb.ilike === 'function');
t('QueryBuilder.contains', typeof qb.contains === 'function');
t('QueryBuilder.or', typeof qb.or === 'function');
t('QueryBuilder.orderBy', typeof qb.orderBy === 'function');
t('QueryBuilder.paginate', typeof qb.paginate === 'function');
t('QueryBuilder.range', typeof qb.range === 'function');
t('QueryBuilder.limit', typeof qb.limit === 'function');
t('QueryBuilder.asSingle', typeof qb.asSingle === 'function');
t('QueryBuilder.asMaybeSingle', typeof qb.asMaybeSingle === 'function');
t('QueryBuilder.excludeDeleted', typeof qb.excludeDeleted === 'function');
t('QueryBuilder.execute', typeof qb.execute === 'function');
t('QueryBuilder.executeMany', typeof qb.executeMany === 'function');

// ── QueryBuilder execution ──────────────────────────────────
const result = await qb.execute();
t('QueryBuilder.execute returns data array', Array.isArray(result.data) && result.data.length === 1);
t('QueryBuilder.execute returns count', result.count === 1);
t('QueryBuilder.execute returns no error', result.error === null);

const resultMany = await qb.executeMany();
t('QueryBuilder.executeMany always returns array', Array.isArray(resultMany.data));

// ── QueryBuilder.empty IN ───────────────────────────────────
const emptyIn = new QueryBuilder(mockQuery);
emptyIn.in('id', []);
const r2 = await emptyIn.execute();
t('QueryBuilder empty IN returns no rows', r2.error !== null || (r2.data && r2.data.length === 0));

// ── Error mapping ───────────────────────────────────────────
const pgError = { code: 'PGRST116', message: 'Results contain 0 rows' };
const mapped = mapDbError(pgError);
t('mapDbError maps PGRST116 to NotFoundError', mapped.name === 'NotFoundError');
t('mapDbError preserves status 404', mapped.statusCode === 404);

const uniqueViolation = { code: '23505', message: 'duplicate key' };
const mapped2 = mapDbError(uniqueViolation);
t('mapDbError maps 23505 to ConflictError', mapped2.name === 'ConflictError');
t('mapDbError preserves status 409', mapped2.statusCode === 409);

const fkViolation = { code: '23503', message: 'foreign key' };
const mapped3 = mapDbError(fkViolation);
t('mapDbError maps 23503 to ValidationError', mapped3.name === 'ValidationError');
t('mapDbError preserves status 400', mapped3.statusCode === 400);

const permDenied = { code: '42501', message: 'permission denied' };
const mapped4 = mapDbError(permDenied);
t('mapDbError maps 42501 to AuthorizationError', mapped4.name === 'AuthorizationError');
t('mapDbError preserves status 403', mapped4.statusCode === 403);

const genericError = new Error('unexpected');
const mapped5 = mapDbError(genericError);
t('mapDbError maps Error to AppError', mapped5.name === 'AppError' || mapped5.name === 'InternalError');

const networkError = new Error('fetch failed: ECONNREFUSED');
const mapped6 = mapDbError(networkError);
t('mapDbError maps network error to 503', mapped6.statusCode === 503);

t('isDbError detects DbError', isDbError({ code: 'PGRST116' }));
t('isDbError rejects non-DbError', !isDbError({ foo: 'bar' }));
t('isDbError rejects null', !isDbError(null));
t('isDbError rejects string', !isDbError('error'));

// ── Retry policy ────────────────────────────────────────────
let attempts = 0;
const resultRetry = await withRetry(
  async () => {
    attempts++;
    if (attempts < 3) {
      const err = new Error('fetch failed');
      throw err;
    }
    return 'ok';
  },
  { initialBackoffMs: 10, maxBackoffMs: 50, label: 'test.retry' },
);
t('withRetry succeeds on 3rd attempt', resultRetry === 'ok');
t('withRetry retried correct number of times', attempts === 3);

// Non-retryable should throw immediately
let nonRetryable = 0;
try {
  await withRetry(
    async () => {
      nonRetryable++;
      throw new Error('validation error in input');
    },
    { maxAttempts: 5, initialBackoffMs: 5, label: 'test.nonretry' },
  );
} catch {
  // expected
}
t('withRetry non-retryable error throws after 1 attempt', nonRetryable === 1);

// Non-idempotent skips retry
let nonIdemp = 0;
try {
  await withRetry(
    async () => {
      nonIdemp++;
      throw new Error('fetch failed');
    },
    { isIdempotent: false, maxAttempts: 5, label: 'test.nonidemp' },
  );
} catch {
  // expected
}
t('withRetry non-idempotent skips retry', nonIdemp === 1);

// ── dbCall ──────────────────────────────────────────────────
const dbResult = await dbCall(async () => 'test', { label: 'test.dbCall' });
t('dbCall returns value', dbResult === 'test');

// ── Client factories exist ──────────────────────────────────
t('createBrowserClient is function', typeof createBrowserClient === 'function');
t('createServerClient is function', typeof createServerClient === 'function');
t('createServiceClient is function', typeof createServiceClient === 'function');

// ── Repository modules ──────────────────────────────────────
t('users.findById is function', typeof users.findById === 'function');
t('users.findByEmail is function', typeof users.findByEmail === 'function');
t('users.list is function', typeof users.list === 'function');
t('users.create is function', typeof users.create === 'function');

t('orders.findById is function', typeof orders.findById === 'function');
t('orders.findByOrderNumber is function', typeof orders.findByOrderNumber === 'function');
t('orders.list is function', typeof orders.list === 'function');
t('orders.listByCustomer is function', typeof orders.listByCustomer === 'function');
t('orders.listByDriver is function', typeof orders.listByDriver === 'function');
t('orders.listByRestaurant is function', typeof orders.listByRestaurant === 'function');
t('orders.create is function', typeof orders.create === 'function');
t('orders.updateStatus is function', typeof orders.updateStatus === 'function');
t('orders.assignDriver is function', typeof orders.assignDriver === 'function');
t('orders.listItems is function', typeof orders.listItems === 'function');
t('orders.listTracking is function', typeof orders.listTracking === 'function');

t('restaurants.findById is function', typeof restaurants.findById === 'function');
t('restaurants.findByOwner is function', typeof restaurants.findByOwner === 'function');
t('restaurants.findBySlug is function', typeof restaurants.findBySlug === 'function');
t('restaurants.list is function', typeof restaurants.list === 'function');
t('restaurants.listVisible is function', typeof restaurants.listVisible === 'function');

t('products.findById is function', typeof products.findById === 'function');
t('products.findByIds is function', typeof products.findByIds === 'function');
t('products.list is function', typeof products.list === 'function');
t('products.topSellers is function', typeof products.topSellers === 'function');

t('notifications.findById is function', typeof notifications.findById === 'function');
t('notifications.listForUser is function', typeof notifications.listForUser === 'function');
t('notifications.create is function', typeof notifications.create === 'function');
t('notifications.markRead is function', typeof notifications.markRead === 'function');
t('notifications.markAllRead is function', typeof notifications.markAllRead === 'function');

t('drivers.findByUserId is function', typeof drivers.findByUserId === 'function');
t('drivers.listOnline is function', typeof drivers.listOnline === 'function');
t('drivers.updateLocation is function', typeof drivers.updateLocation === 'function');
t('drivers.recordLocation is function', typeof drivers.recordLocation === 'function');

t('payments.findById is function', typeof payments.findById === 'function');
t('payments.findByOrderId is function', typeof payments.findByOrderId === 'function');
t('payments.create is function', typeof payments.create === 'function');
t('payments.updateStatus is function', typeof payments.updateStatus === 'function');

t('addresses.findById is function', typeof addresses.findById === 'function');
t('addresses.listForCustomer is function', typeof addresses.listForCustomer === 'function');
t('addresses.getDefault is function', typeof addresses.getDefault === 'function');

t('favorites.listForCustomer is function', typeof favorites.listForCustomer === 'function');
t('favorites.isFavorite is function', typeof favorites.isFavorite === 'function');
t('favorites.add is function', typeof favorites.add === 'function');
t('favorites.remove is function', typeof favorites.remove === 'function');

t('coupons.findByCode is function', typeof coupons.findByCode === 'function');
t('coupons.isValid is function', typeof coupons.isValid === 'function');
t('coupons.applyDiscount is function', typeof coupons.applyDiscount === 'function');

t('support.findById is function', typeof support.findById === 'function');
t('support.listTickets is function', typeof support.listTickets === 'function');
t('support.createTicket is function', typeof support.createTicket === 'function');

console.log(`\n${pass} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
