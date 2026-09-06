#!/usr/bin/env node

import { isRestaurantOpenAt, isRestaurantOpenNow, normalizeRestaurantHours, restaurantHoursToRows, rowsToRestaurantHours } from '../lib/restaurant-hours.ts';

let passed = 0;
function ok(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

const legacy = Array.from({ length: 7 }, (_, index) => ({ day: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][index], is_open: index !== 6, open_time: '09:00', close_time: '22:00' }));
const canonical = normalizeRestaurantHours(legacy);
ok(Boolean(canonical.mon && canonical.sat && !canonical.sun), 'Legacy seven-row schedules normalize to canonical short-day keys');
ok(Object.keys(rowsToRestaurantHours(restaurantHoursToRows(canonical))).length === 6, 'Schedule rows round-trip without reopening closed days');
ok(isRestaurantOpenNow(null, new Date('2026-08-10T12:00:00Z'), 'UTC'), 'Missing schedule preserves the backward-compatible always-open policy');
ok(!isRestaurantOpenNow({}, new Date('2026-08-10T12:00:00Z'), 'UTC'), 'Explicitly empty schedule means closed');
ok(isRestaurantOpenNow({ mon: { open: '09:00', close: '22:00' } }, new Date('2026-08-10T12:00:00Z'), 'UTC'), 'Restaurant opens inside a same-day interval');
ok(!isRestaurantOpenNow({ mon: { open: '09:00', close: '22:00' } }, new Date('2026-08-10T22:00:00Z'), 'UTC'), 'Closing time is an exclusive boundary');
const overnight = { mon: { open: '22:00', close: '02:00' } };
ok(isRestaurantOpenNow(overnight, new Date('2026-08-10T23:30:00Z'), 'UTC'), 'Overnight schedule opens before midnight');
ok(isRestaurantOpenNow(overnight, new Date('2026-08-11T01:30:00Z'), 'UTC'), 'Overnight schedule remains open after midnight');
ok(!isRestaurantOpenNow(overnight, new Date('2026-08-11T02:00:00Z'), 'UTC'), 'Overnight schedule closes at its boundary');
ok(isRestaurantOpenNow({ mon: { open: '11:00', close: '13:00' } }, new Date('2026-07-06T10:00:00Z'), 'Europe/Berlin'), 'Europe/Berlin summer-time conversion is applied');
const weeklyMonday = { mon: { open: '09:00', close: '22:00' } };
ok(!isRestaurantOpenAt(weeklyMonday, new Date('2026-08-10T12:00:00Z'), [{ service_date: '2026-08-10', is_closed: true, open_time: null, close_time: null }], 'UTC'), 'A full-day special closure overrides regular weekly hours');
ok(isRestaurantOpenAt({}, new Date('2026-08-10T12:00:00Z'), [{ service_date: '2026-08-10', is_closed: false, open_time: '11:00', close_time: '14:00' }], 'UTC'), 'Special opening hours can open a regularly closed day');
ok(!isRestaurantOpenAt(weeklyMonday, new Date('2026-08-10T15:00:00Z'), [{ service_date: '2026-08-10', is_closed: false, open_time: '11:00', close_time: '14:00' }], 'UTC'), 'Special opening hours close outside their override interval');
ok(isRestaurantOpenAt({}, new Date('2026-08-11T01:00:00Z'), [{ service_date: '2026-08-10', is_closed: false, open_time: '22:00', close_time: '02:00' }], 'UTC'), 'Special overnight hours carry into the following date');

console.log(`Restaurant hours logic: PASS (${passed}/${passed})`);
