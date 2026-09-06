#!/usr/bin/env node

import assert from 'node:assert/strict';
import { deliveryZonePricing, normalizeSurgePolicy, type DeliverySurgeRule } from '../lib/delivery-zone-pricing';

let passed = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); passed += 1; };
const base: DeliverySurgeRule = {
  delivery_fee: 7.77,
  surge_multiplier: 1.5,
  surge_days: [1],
  surge_start_local: '11:30',
  surge_end_local: '14:00',
  surge_timezone: 'Europe/Berlin',
};

let price = deliveryZonePricing(base, new Date('2026-08-17T10:30:00.000Z')); // Monday 12:30 CEST
check(price.surgeActive && price.deliveryFee === 11.66 && price.surgeAmount === 3.89, 'weekday window activates with cent-safe rounding');

price = deliveryZonePricing(base, new Date('2026-08-17T13:30:00.000Z')); // Monday 15:30 CEST
check(!price.surgeActive && price.deliveryFee === 7.77, 'weekday window ends without changing the base fee');

const overnight: DeliverySurgeRule = { ...base, surge_days: [5], surge_start_local: '22:00', surge_end_local: '02:00' };
check(deliveryZonePricing(overnight, new Date('2026-08-21T21:00:00.000Z')).surgeActive, 'overnight policy activates on its start day');
check(deliveryZonePricing(overnight, new Date('2026-08-21T23:00:00.000Z')).surgeActive, 'overnight policy remains active after midnight');
check(!deliveryZonePricing(overnight, new Date('2026-08-22T01:00:00.000Z')).surgeActive, 'overnight policy stops at the configured local time');

const dst: DeliverySurgeRule = { ...base, surge_days: [0], surge_start_local: '01:00', surge_end_local: '04:00' };
check(deliveryZonePricing(dst, new Date('2026-03-29T00:30:00.000Z')).surgeActive, 'Berlin spring-DST window is active before the clock jump');
check(deliveryZonePricing(dst, new Date('2026-03-29T01:30:00.000Z')).surgeActive, 'Berlin spring-DST window remains active after the clock jump');

check(normalizeSurgePolicy({ surge_multiplier: 2.01, surge_days: [1], surge_start_local: '10:00', surge_end_local: '11:00' }) === null, 'multiplier above 2x is rejected');
check(normalizeSurgePolicy({ surge_multiplier: 1.2 }) === null, 'incomplete active policy is rejected');
check(normalizeSurgePolicy({ surge_multiplier: 1, surge_days: [1], surge_start_local: '10:00', surge_end_local: '11:00' })?.surge_days.length === 0, 'disabled policy clears stale schedule days');
check(normalizeSurgePolicy({ surge_multiplier: 1.2, surge_days: [1, 1, 9], surge_start_local: '10:00', surge_end_local: '11:00' })?.surge_days.join(',') === '1', 'weekdays are deduplicated and bounded');

console.log(`Delivery-zone surge policy: ${passed}/${passed} checks passed.`);
