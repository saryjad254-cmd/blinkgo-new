import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');

function loadCommonJs(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected dependency in ${file}: ${specifier}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {}, { filename: file })(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const fees = loadCommonJs('lib/config/fees.ts');
const { computeEarnings } = loadCommonJs('lib/services/driver-earnings.ts', { '@/lib/config/fees': fees });
const dispatchPolicy = loadCommonJs('lib/driver/dispatch-policy.ts');
const { normalizeDriverReleaseInput } = loadCommonJs('lib/driver/rejection-reasons.ts');
const arrivalPolicy = loadCommonJs('lib/driver/arrival-policy.ts');
const issuePolicy = loadCommonJs('lib/driver/issue-policy.ts');
const { createDriverOfferQuote } = loadCommonJs('lib/driver/offer-policy.ts', {
  '@/lib/config/fees': fees,
  '@/lib/driver/dispatch-policy': dispatchPolicy,
  '@/lib/services/driver-earnings': { computeEarnings },
});

let passed = 0;
let failed = 0;
function test(name, condition, details = '') {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${details ? ` (${details})` : ''}`); }
}

const freeLocal = computeEarnings({ delivery_fee: 0, tip: 0 });
test('Free customer delivery still pays the courier minimum', freeLocal.base === fees.DRIVER_MINIMUM_BASE_PAYOUT, JSON.stringify(freeLocal));

const promoted = computeEarnings({ delivery_fee: 0, tip: 2.75 });
test('Customer tips pass through in full', promoted.tip === 2.75 && promoted.total === promoted.base + 2.75, JSON.stringify(promoted));

const highFee = computeEarnings({ delivery_fee: 10, tip: 0 });
test('Contract share remains a valid payout floor', highFee.base === 8, JSON.stringify(highFee));

const distancePriced = computeEarnings({
  delivery_fee: 0,
  restaurant_latitude: 50,
  restaurant_longitude: 7,
  customer_latitude: 50.045,
  customer_longitude: 7,
});
test('Valid merchant-to-customer distance raises the guaranteed payout', distancePriced.distanceKm > 4.9 && distancePriced.base > freeLocal.base, JSON.stringify(distancePriced));
test('Distance payout uses the canonical configured rate', distancePriced.base === Math.round((fees.DRIVER_MINIMUM_BASE_PAYOUT + distancePriced.distanceKm * fees.DRIVER_DISTANCE_RATE_PER_KM) * 100) / 100, JSON.stringify(distancePriced));

const relationPriced = computeEarnings({
  delivery_fee: 0,
  restaurants: [{ name: 'Fixture', latitude: 50, longitude: 7 }],
  customer_latitude: 50.018,
  customer_longitude: 7,
});
test('Nested Supabase restaurant coordinates are supported', relationPriced.distanceKm > 1.9 && relationPriced.distanceKm < 2.1, JSON.stringify(relationPriced));

const corrupt = computeEarnings({
  delivery_fee: 0,
  restaurant_latitude: 50,
  restaurant_longitude: 7,
  customer_latitude: -50,
  customer_longitude: -7,
});
test('Implausible long-distance coordinates cannot inflate payout', corrupt.distanceKm === null && corrupt.base === fees.DRIVER_MINIMUM_BASE_PAYOUT, JSON.stringify(corrupt));

const nullIsland = computeEarnings({
  delivery_fee: 0,
  restaurant_latitude: 0,
  restaurant_longitude: 0,
  customer_latitude: 50,
  customer_longitude: 7,
});
test('Null Island coordinates are rejected', nullIsland.distanceKm === null, JSON.stringify(nullIsland));

const nearbyOffer = createDriverOfferQuote({
  delivery_fee: 0,
  driver_latitude: 50,
  driver_longitude: 7,
  restaurant_latitude: 50.01,
  restaurant_longitude: 7,
  customer_latitude: 50.03,
  customer_longitude: 7,
});
test('Nearby offer is eligible and has a complete route quote', nearbyOffer.eligible && nearbyOffer.routeDistanceKm > 3 && nearbyOffer.etaMinutes >= 8, JSON.stringify(nearbyOffer));
test('Offer quote and earnings engine return the same guaranteed payout', nearbyOffer.earnings.base === computeEarnings({ delivery_fee: 0, restaurant_latitude: 50.01, restaurant_longitude: 7, customer_latitude: 50.03, customer_longitude: 7 }).base, JSON.stringify(nearbyOffer));
test('Offer quote exposes time and distance earning efficiency', nearbyOffer.earningsPerHour > 0 && nearbyOffer.earningsPerKm > 0, JSON.stringify(nearbyOffer));

const readyNearbyOffer = createDriverOfferQuote({
  status: 'ready',
  delivery_fee: 6,
  driver_latitude: 50,
  driver_longitude: 7,
  restaurant_latitude: 50.005,
  restaurant_longitude: 7,
  customer_latitude: 50.02,
  customer_longitude: 7,
});
test('Ready nearby offers explain their recommendation with transparent signals', readyNearbyOffer.matchSignals.includes('short_pickup') && readyNearbyOffer.matchSignals.includes('ready_for_pickup'), JSON.stringify(readyNearbyOffer));
test('Offer matching never uses acceptance history or a punitive driver score', !('acceptanceRate' in readyNearbyOffer) && !('driverPenalty' in readyNearbyOffer), JSON.stringify(readyNearbyOffer));

const farPickup = createDriverOfferQuote({
  delivery_fee: 4,
  driver_latitude: 50,
  driver_longitude: 7,
  restaurant_latitude: 50.2,
  restaurant_longitude: 7,
  customer_latitude: 50.21,
  customer_longitude: 7,
});
test('Unsafe pickup distance is rejected before acceptance', !farPickup.eligible && farPickup.reason === 'pickup_too_far', JSON.stringify(farPickup));

const legacyOffer = createDriverOfferQuote({ delivery_fee: 4 });
test('Missing legacy coordinates remain visible but explicitly unpriced', legacyOffer.eligible && legacyOffer.reason === 'location_unavailable', JSON.stringify(legacyOffer));
test('Unpriced legacy offers are explicitly unrated', legacyOffer.matchLevel === 'unrated' && legacyOffer.matchSignals.length === 0, JSON.stringify(legacyOffer));

test('Driver release rejects missing reasons', normalizeDriverReleaseInput({}) === null);
test('Driver release accepts a structured reason', normalizeDriverReleaseInput({ reason_code: 'vehicle_issue' })?.reason === 'vehicle_issue');
test('Other release reason requires useful details', normalizeDriverReleaseInput({ reason_code: 'other', details: 'x' }) === null);
test('Legacy release payload remains backward compatible', normalizeDriverReleaseInput({ reason: 'legacy setup' })?.details === 'legacy setup');
test('Pickup arrival is limited to pre-pickup states', arrivalPolicy.canMarkDriverArrival('pickup', 'ready') && arrivalPolicy.canMarkDriverArrival('pickup', 'assigned') && !arrivalPolicy.canMarkDriverArrival('pickup', 'picked_up'));
test('Drop-off arrival is limited to delivery states', arrivalPolicy.canMarkDriverArrival('dropoff', 'picked_up') && !arrivalPolicy.canMarkDriverArrival('dropoff', 'ready'));
test('Arrival geofence rejects distant check-ins', !arrivalPolicy.isWithinArrivalRadius(arrivalPolicy.DRIVER_ARRIVAL_RADIUS_METERS + 1));
test('Missing coordinates keep legacy orders operable', arrivalPolicy.isWithinArrivalRadius(null));
test('Restaurant issues are limited to the pickup phase', issuePolicy.canReportDriverIssue('restaurant_delay', 'ready') && !issuePolicy.canReportDriverIssue('restaurant_delay', 'delivering'));
test('Customer issues are limited to the drop-off phase', issuePolicy.canReportDriverIssue('customer_unreachable', 'delivering') && !issuePolicy.canReportDriverIssue('customer_unreachable', 'preparing'));
test('Unsafe situations are accepted throughout active delivery', issuePolicy.canReportDriverIssue('unsafe_situation', 'confirmed') && issuePolicy.canReportDriverIssue('unsafe_situation', 'picked_up'));
test('Critical driver issues are escalated', issuePolicy.shouldEscalateDriverIssue('unsafe_situation') && issuePolicy.driverIssuePriority('unsafe_situation') === 'urgent');
test('Restaurant delays notify the customer without urgent escalation', issuePolicy.shouldNotifyCustomerAboutIssue('restaurant_delay') && !issuePolicy.shouldEscalateDriverIssue('restaurant_delay'));

console.log(`Driver earnings policy: ${failed ? 'FAIL' : 'PASS'} (${passed}/${passed + failed})`);
if (failed) process.exit(1);
