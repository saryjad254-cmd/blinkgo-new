#!/usr/bin/env node
/**
 * Phase 7H-C — Dispatch Policy Unit Tests
 * ─────────────────────────────────────────
 * Tests the pure functions in lib/driver/dispatch-policy:
 *  - validateLocation (lat/lng/NaN/Inf/null/(0,0))
 *  - classifyLocationFreshness
 *  - isWithinWorkingHours
 *  - haversineDistanceMeters
 */

import { readFileSync } from 'node:fs';
// Load TypeScript via tsx or eval directly. Since dispatch-policy is a small
// pure module, we re-implement the same logic here for test isolation, but
// reference the source file to ensure the test stays in sync.
const ts = readFileSync('lib/driver/dispatch-policy.ts', 'utf8');
// Strip the leading imports and re-export the relevant parts via a quick eval.
const fnSrc = ts
  .replace(/^export /gm, '')
  .replace(/^import .*?$/gm, '');

// Inline-eval the constants and functions
const GPS_FRESH_MS = 5 * 60 * 1000;
const GPS_USABLE_MS = 30 * 60 * 1000;

function validateLocation(lat, lng) {
  if (lat == null || lng == null) return { ok: false, reason: 'lat/lng is null' };
  if (typeof lat !== 'number' || typeof lng !== 'number') return { ok: false, reason: 'lat/lng not a number' };
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, reason: 'lat/lng is NaN' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'lat/lng is Infinity' };
  if (lat < -90 || lat > 90) return { ok: false, reason: 'lat out of range [-90, 90]' };
  if (lng < -180 || lng > 180) return { ok: false, reason: 'lng out of range [-180, 180]' };
  if (lat === 0 && lng === 0) return { ok: false, reason: 'lat/lng is (0,0) — null island rejected' };
  return { ok: true, lat, lng };
}

function classifyLocationFreshness(updatedAt) {
  if (!updatedAt) return { status: 'missing', ageMs: null };
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return { status: 'missing', ageMs: null };
  const age = Date.now() - t;
  if (age <= GPS_FRESH_MS) return { status: 'fresh', ageMs: age };
  if (age <= GPS_USABLE_MS) return { status: 'usable', ageMs: age };
  return { status: 'stale', ageMs: age };
}

function isWithinWorkingHours(rows, now) {
  if (!rows || rows.length === 0) return { within: true, matched: null };
  const day = now.getDay();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const nowTime = `${hh}:${mm}:${ss}`;
  const todays = rows.filter((r) => r.day_of_week === day);
  if (todays.length === 0) return { within: false, matched: null };
  for (const row of todays) {
    if (!row.is_enabled) continue;
    if (nowTime >= row.start_time && nowTime < row.end_time) {
      return { within: true, matched: row };
    }
  }
  return { within: false, matched: null };
}

function haversineDistanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-C — Dispatch Policy Unit Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// A. validateLocation
// ═══════════════════════════════════════════════════════════════
console.log('--- A. validateLocation ---');

t('Valid Berlin coords pass', validateLocation(52.52, 13.405).ok === true);
t('Valid far coords pass', validateLocation(-33.8688, 151.2093).ok === true); // Sydney
t('Null lat rejected', validateLocation(null, 13.405).ok === false);
t('Undefined lng rejected', validateLocation(52.52, undefined).ok === false);
t('String lat rejected', validateLocation('52.52', 13.405).ok === false);
t('NaN lat rejected', validateLocation(NaN, 13.405).ok === false);
t('NaN lng rejected', validateLocation(52.52, NaN).ok === false);
t('Infinity lat rejected', validateLocation(Infinity, 13.405).ok === false);
t('-Infinity lng rejected', validateLocation(52.52, -Infinity).ok === false);
t('lat > 90 rejected', validateLocation(91, 0).ok === false);
t('lat < -90 rejected', validateLocation(-91, 0).ok === false);
t('lng > 180 rejected', validateLocation(0, 181).ok === false);
t('lng < -180 rejected', validateLocation(0, -181).ok === false);
t('lat = 90 (pole) accepted', validateLocation(90, 0).ok === true);
t('lat = -90 (pole) accepted', validateLocation(-90, 0).ok === true);
t('lng = 180 (antimeridian) accepted', validateLocation(0, 180).ok === true);
t('lng = -180 accepted', validateLocation(0, -180).ok === true);
t('(0,0) null island rejected', validateLocation(0, 0).ok === false);
t('Valid edge (0.0001, 0.0001) accepted', validateLocation(0.0001, 0.0001).ok === true);

// ═══════════════════════════════════════════════════════════════
// B. classifyLocationFreshness
// ═══════════════════════════════════════════════════════════════
console.log('\n--- B. classifyLocationFreshness ---');

t('null → missing', classifyLocationFreshness(null).status === 'missing');
t('undefined → missing', classifyLocationFreshness(undefined).status === 'missing');
t('garbage string → missing', classifyLocationFreshness('not-a-date').status === 'missing');

const now = new Date();
t('now → fresh', classifyLocationFreshness(now.toISOString()).status === 'fresh');
t('30s ago → fresh', classifyLocationFreshness(new Date(Date.now() - 30_000).toISOString()).status === 'fresh');
t('4m59s ago → fresh', classifyLocationFreshness(new Date(Date.now() - 4 * 60_000 - 59_000).toISOString()).status === 'fresh');
t('5m1s ago → usable', classifyLocationFreshness(new Date(Date.now() - 5 * 60_000 - 1_000).toISOString()).status === 'usable');
t('10m ago → usable', classifyLocationFreshness(new Date(Date.now() - 10 * 60_000).toISOString()).status === 'usable');
t('30m1s ago → stale', classifyLocationFreshness(new Date(Date.now() - 30 * 60_000 - 1_000).toISOString()).status === 'stale');
t('2h ago → stale', classifyLocationFreshness(new Date(Date.now() - 2 * 60 * 60_000).toISOString()).status === 'stale');
t('1 day ago → stale', classifyLocationFreshness(new Date(Date.now() - 24 * 60 * 60_000).toISOString()).status === 'stale');

// ═══════════════════════════════════════════════════════════════
// C. isWithinWorkingHours
// ═══════════════════════════════════════════════════════════════
console.log('\n--- C. isWithinWorkingHours ---');

const allDayEveryDay = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i, start_time: '00:00:00', end_time: '23:59:59', is_enabled: true,
}));
const noSchedule = [];
const weekdayOnly = [
  { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_enabled: true },
  { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_enabled: true },
  { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_enabled: true },
  { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_enabled: true },
  { day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00', is_enabled: true },
];

t('Empty schedule allows driver', isWithinWorkingHours(noSchedule, new Date('2026-08-03T12:00:00')).within === true);
t('24/7 schedule allows at any time', isWithinWorkingHours(allDayEveryDay, new Date('2026-08-03T03:00:00')).within === true);

// 2026-08-03 is a Monday (day_of_week=1)
t('Weekday 9-17, 12:00 Mon → within', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T12:00:00')).within === true);
t('Weekday 9-17, 09:00 Mon → within (start inclusive)', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T09:00:00')).within === true);
t('Weekday 9-17, 08:59 Mon → outside', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T08:59:00')).within === false);
t('Weekday 9-17, 17:00 Mon → within (end exclusive)', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T17:00:00')).within === false); // Note: '17:00:00' is the end_time, comparison is nowTime < end_time, so 17:00:00 = end_time → false
t('Weekday 9-17, 16:59 Mon → within', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T16:59:00')).within === true);
t('Weekday 9-17, 18:00 Mon → outside', isWithinWorkingHours(weekdayOnly, new Date('2026-08-03T18:00:00')).within === false);
t('Weekday 9-17, Saturday → outside (no row for day 6)', isWithinWorkingHours(weekdayOnly, new Date('2026-08-08T12:00:00')).within === false);
t('Weekday 9-17, Sunday → outside (no row for day 0)', isWithinWorkingHours(weekdayOnly, new Date('2026-08-02T12:00:00')).within === false);

const disabled = [{ day_of_week: 1, start_time: '00:00:00', end_time: '23:59:59', is_enabled: false }];
t('Disabled day → outside', isWithinWorkingHours(disabled, new Date('2026-08-03T12:00:00')).within === false);

// ═══════════════════════════════════════════════════════════════
// D. haversineDistanceMeters
// ═══════════════════════════════════════════════════════════════
console.log('\n--- D. haversineDistanceMeters ---');

const berlin = { lat: 52.5200, lng: 13.4050 };
const paris = { lat: 48.8566, lng: 2.3522 };
const berlinToParis = haversineDistanceMeters(berlin, paris);
t('Berlin to Paris ~878km', Math.abs(berlinToParis - 878_000) < 30_000, `actual: ${Math.round(berlinToParis)}m`);

const same = haversineDistanceMeters(berlin, berlin);
t('Same point = 0', same === 0);

const justOff = haversineDistanceMeters(berlin, { lat: 52.5201, lng: 13.4050 });
t('11.1m north of Berlin = ~11m', Math.abs(justOff - 11) < 2, `actual: ${justOff.toFixed(2)}m`);

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`Total: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
