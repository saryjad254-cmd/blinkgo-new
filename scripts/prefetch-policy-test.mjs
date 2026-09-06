#!/usr/bin/env node

import assert from 'node:assert/strict';
import { getIdlePrefetchRoutes, isSafePrefetchHref } from '../lib/perf/prefetch-policy.ts';

const customer = getIdlePrefetchRoutes('/home');
const driver = getIdlePrefetchRoutes('/driver/dashboard');
const restaurant = getIdlePrefetchRoutes('/restaurant/kitchen');
const admin = getIdlePrefetchRoutes('/admin/live-ops');

assert.ok(customer.every((route) => !/^\/(admin|driver|restaurant)(\/|$)/.test(route)));
assert.ok(driver.every((route) => route.startsWith('/driver')));
assert.ok(restaurant.every((route) => route.startsWith('/restaurant')));
assert.ok(admin.every((route) => route === '/admin' || route.startsWith('/admin/')));
assert.deepEqual(getIdlePrefetchRoutes('/login'), []);
assert.deepEqual(getIdlePrefetchRoutes('/legal/datenschutz'), []);
assert.equal(isSafePrefetchHref('/orders/123'), true);
assert.equal(isSafePrefetchHref('https://attacker.example'), false);
assert.equal(isSafePrefetchHref('//attacker.example'), false);
assert.equal(isSafePrefetchHref('/safe\\..\\admin'), false);

console.log('Prefetch policy: PASS (customer, driver, restaurant, admin, public, unsafe URLs)');
