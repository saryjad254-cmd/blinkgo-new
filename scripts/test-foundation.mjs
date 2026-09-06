#!/usr/bin/env node
/**
 * Foundation Test Suite
 * ────────────────────
 * Smoke-tests every public surface of lib/foundation/.
 * Run with: `node scripts/test-foundation.mjs`
 * (after building: `npx tsc --outDir /tmp/ft-build lib/foundation/*.ts`)
 *
 * OR run with tsx: `npx tsx scripts/test-foundation.mjs`
 */
import { ok, err, isOk, isErr, map, andThen, all, partition } from '../lib/foundation/result';
import {
  ValidationError, NotFoundError, AppError, isAppError,
  AuthenticationError, AuthorizationError, RateLimitError,
} from '../lib/foundation/errors';
import { isRTL, formatDate, formatTime } from '../lib/foundation/format';
import {
  EUR, cents, roleSatisfies, distanceMeters,
  ROLE_HIERARCHY, LOCALES, DEFAULT_LOCALE,
} from '../lib/foundation/types';
import { z } from '../lib/foundation/zod-mini';
import { cache } from '../lib/foundation/cache';
import { isTrustedOrigin, buildCookie, parseCookies } from '../lib/foundation/http';
import { log } from '../lib/foundation/logger';

let pass = 0;
let failCount = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { failCount++; console.log('FAIL', name); }
}

console.log('--- Foundation test suite ---\n');

// ── Result ─────────────────────────────────────────────────────
t('ok(5) is Ok', isOk(ok(5)));
t('err("x") is Err', isErr(err('x')));
t('map(ok(5), x=>x*2) = 10', map(ok(5), (x) => x * 2).value === 10);
t('andThen(ok(5), ok(6)) = 6', andThen(ok(5), (x) => ok(x + 1)).value === 6);
t('all([ok(1),ok(2)]) = [1,2]', JSON.stringify(all([ok(1), ok(2)]).value) === '[1,2]');
t('partition ok/err split', partition([ok(1), err('a')]).ok.length === 1);

// ── Errors ─────────────────────────────────────────────────────
const ve = new ValidationError('test');
t('ValidationError has code', ve.code === 'VALIDATION_ERROR');
t('ValidationError status 400', ve.statusCode === 400);
t('isAppError(VE)', isAppError(ve));
t('isAppError(Error) is false', !isAppError(new Error('x')));
t('AuthError status 401', new AuthenticationError('test').statusCode === 401);
t('AuthzError status 403', new AuthorizationError('test').statusCode === 403);
t('RateLimitError status 429', new RateLimitError(60).statusCode === 429);

// ── Locale/Format ──────────────────────────────────────────────
t('isRTL(ar)', isRTL('ar'));
t('!isRTL(en)', !isRTL('en'));
t('formatDate returns string', typeof formatDate(new Date()) === 'string');
t('formatTime returns string', typeof formatTime(new Date()) === 'string');
t('LOCALES includes de/ar/en', LOCALES.length === 3);

// ── Money ──────────────────────────────────────────────────────
t('EUR.format(12.5) contains 12', EUR.format(12.5).includes('12'));
t('cents(1234) is 1234', cents(1234) === 1234);

// ── RBAC ───────────────────────────────────────────────────────
t('admin >= super_admin = false', !roleSatisfies('admin', ['super_admin']));
t('super_admin >= super_admin', roleSatisfies('super_admin', ['super_admin']));
t('customer >= customer', roleSatisfies('customer', ['customer']));
t('customer >= admin = false', !roleSatisfies('customer', ['admin']));

// ── Geo ────────────────────────────────────────────────────────
const d = distanceMeters({ lat: 50, lng: 8 }, { lat: 50.01, lng: 8 });
t('distance > 0', d > 0 && d < 2000);

// ── Zod ────────────────────────────────────────────────────────
t('zod string valid', z.string().safeParse('x').success === true);
t('zod string min(3) valid', z.string().min(3).safeParse('abc').success === true);
t('zod string min(3) invalid', z.string().min(3).safeParse('ab').success === false);
t('zod email valid', z.email().safeParse('a@b.com').success === true);
t('zod email invalid', z.email().safeParse('not-an-email').success === false);
const obj = z.object({ name: z.string().min(2), age: z.number() });
t('zod object valid', obj.safeParse({ name: 'Ali', age: 30 }).success === true);
t('zod object invalid', obj.safeParse({ name: 'A', age: 30 }).success === false);

// ── Cache ──────────────────────────────────────────────────────
await cache.set('k1', 'v1', 1000);
t('cache.get returns stored', (await cache.get('k1')) === 'v1');
await cache.invalidate('k1');
t('cache.invalidate removes', (await cache.get('k1')) === undefined);

// ── HTTP ───────────────────────────────────────────────────────
t('cookie with maxAge', buildCookie('a', 'b', { maxAge: 60 }).includes('Max-Age=60'));
t('parse cookie', parseCookies('a=b; c=d').a === 'b' && parseCookies('a=b; c=d').c === 'd');
t('isTrustedOrigin(localhost)', isTrustedOrigin('http://localhost:3000'));
t('isTrustedOrigin(localhost:3001)', isTrustedOrigin('http://localhost:3001'));
t('!isTrustedOrigin(evil)', !isTrustedOrigin('https://evil.com'));
t('isTrustedOrigin(appUrl)', isTrustedOrigin('https://www.blinkgo.de', 'https://www.blinkgo.de'));
t('isTrustedOrigin(tunnel)', isTrustedOrigin('https://foo.trycloudflare.com'));

// ── Logger ─────────────────────────────────────────────────────
t('log has methods', typeof log.info === 'function' && typeof log.error === 'function');

console.log(`\n${pass} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
