import ts from 'typescript'; import fs from 'node:fs';
const mods = {};
function load(file, stubs = {}) {
  if (mods[file]) return mods[file];
  const src = fs.readFileSync(file, 'utf-8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function('module','exports','require', js)(m, m.exports, (x) => {
    if (stubs[x]) return stubs[x];
    if (x === './distance' || x === '@/lib/maps/distance') return load('lib/maps/distance.ts');
    if (x === '@/lib/maps/zones' || x === './zones') return load('lib/maps/zones.ts');
    throw new Error('no stub: ' + x);
  });
  return (mods[file] = m.exports);
}
let ZONES = [];
const svcStub = { createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: ZONES }) }) }) }) }) };
const logStub = { logger: { warn: () => {} } };
const svc = load('lib/services/delivery-zone-service.ts', {
  '@/lib/supabase/service': svcStub, '@/lib/logging': logStub,
});
const D = load('lib/maps/distance.ts');

const wesselingRestaurant = { id: 'r1', latitude: 50.8233, longitude: 6.9772, delivery_radius_km: 15 };
const duisburgRestaurant  = { id: 'r2', latitude: 51.4325, longitude: 6.7652, delivery_radius_km: 7 };
const noRadiusRestaurant  = { id: 'r3', latitude: 50.9375, longitude: 6.9603, delivery_radius_km: null };

const P = {
  keldenich:   { lat: 50.8152, lng: 6.9550 },                    // 1.8 km — THE bug address
  bruehl:      { lat: 50.8286, lng: 6.9040 },                    // 5.2 km (was vetoed by zones + blocked by 5km client cap)
  koeln:       { lat: 50.9375, lng: 6.9603 },                    // 12.7 km — inside 15
  boundary:    { lat: 50.8233 + 14.95/111.195, lng: 6.9772 },   // ~15.00 km
  outside:     { lat: 50.8233 + 15.6/111.132, lng: 6.9772 },     // ~15.6 km — must reject
  bonn:        { lat: 50.7374, lng: 7.0982 },                    // ~12.8 km
  duesseldorf: { lat: 51.2277, lng: 6.7735 },                    // ~47 km — must reject
  duisburgNear:{ lat: 51.4500, lng: 6.7800 },                    // ~2.2 km from Duisburg restaurant
  duisburgFar: { lat: 51.5000, lng: 6.9000 },                    // ~12 km > 7 — must reject
  farFromR3:   { lat: 51.4, lng: 6.8 },                          // ~52.6 km from no-radius restaurant → > 50 fallback
};

const wesselingZones = [
  { id:'z1', name:'Wesseling (Complete City)', center_lat:50.8233, center_lng:6.9772, radius_km:3.0, polygon:null, priority:50 },
  { id:'z2', name:'Wesseling Polygon (Precise)', center_lat:null, center_lng:null, radius_km:null, priority:60, polygon: [
    [50.8420,6.9450],[50.8450,6.9650],[50.8430,6.9850],[50.8400,7.0000],[50.8350,7.0100],[50.8250,7.0120],
    [50.8150,7.0080],[50.8050,7.0000],[50.7980,6.9900],[50.7920,6.9750],[50.7900,6.9600],[50.7930,6.9450],
    [50.8000,6.9380],[50.8120,6.9350],[50.8250,6.9380],[50.8350,6.9420]] },
];

let pass=0, fail=0;
async function t(name, restaurant, point, zones, expectOk, expectLimitKm=null){
  ZONES = zones;
  const r = await svc.checkDeliveryDistance(restaurant, point);
  const km = (D.haversineDistance({lat:restaurant.latitude,lng:restaurant.longitude}, point)/1000).toFixed(2);
  const okMatch = r.ok === expectOk;
  const limMatch = expectLimitKm == null || r.ok || Math.round((r.limitM||0)/1000) === expectLimitKm;
  const good = okMatch && limMatch;
  good ? pass++ : fail++;
  console.log(`${good?'✓':'✗'} ${name} [${km} km] → ok=${r.ok}${r.zoneName?' zone='+r.zoneName:''}${r.message?' msg='+r.message:''}${good?'':' EXPECTED ok='+expectOk}`);
}

console.log('── THE reported bug (Wesseling, radius 15 km, zones seeded) ──');
await t('Keldenich (An d. Elsmar 2) inside zone', wesselingRestaurant, P.keldenich, wesselingZones, true);
await t('Brühl 5.2km — outside zones but INSIDE 15km radius (old code vetoed)', wesselingRestaurant, P.bruehl, wesselingZones, true);
await t('Köln 12.7km — outside zones, inside radius', wesselingRestaurant, P.koeln, wesselingZones, true);
await t('Bonn 12.8km — inside radius', wesselingRestaurant, P.bonn, wesselingZones, true);
console.log('── boundary precision ──');
await t('exactly on 15.00 km boundary → accepted', wesselingRestaurant, P.boundary, wesselingZones, true);
await t('15.6 km — slightly outside → rejected with limit 15', wesselingRestaurant, P.outside, wesselingZones, false, 15);
await t('Düsseldorf 47 km → rejected', wesselingRestaurant, P.duesseldorf, wesselingZones, false, 15);
console.log('── different restaurant / city (Duisburg, radius 7 km, NO zones) ──');
await t('2.2 km inside', duisburgRestaurant, P.duisburgNear, [], true);
await t('12 km outside 7km radius → rejected with limit 7', duisburgRestaurant, P.duisburgFar, [], false, 7);
console.log('── no configured radius → 50 km platform fallback ──');
await t('47km with no own radius → accepted (fallback 50)', noRadiusRestaurant, P.duesseldorf, [], true);
await t('52.6km with no own radius → rejected with limit 50', noRadiusRestaurant, P.farFromR3, [], false, 50);
console.log('── zones table empty/missing behaves the same ──');
await t('Keldenich with NO zones — radius rule accepts', wesselingRestaurant, P.keldenich, [], true);
console.log('── client-side rule (cart) uses the identical limit ──');
const cartLimitKm = D.effectiveRadiusMeters({ delivery_radius_km: 15 }) / 1000;
const cartKm = D.haversineKm({lat:50.8233,lng:6.9772}, P.bruehl);
console.log(`${cartKm <= cartLimitKm ? '✓' : '✗'} cart check: Brühl ${cartKm.toFixed(1)}km ≤ limit ${cartLimitKm}km (old code blocked at 5km)`); cartKm <= cartLimitKm ? pass++ : fail++;
const cartNoRadius = D.effectiveRadiusMeters({ delivery_radius_km: null }) / 1000;
console.log(`${cartNoRadius === 50 ? '✓' : '✗'} cart fallback = server fallback (50 km)`); cartNoRadius === 50 ? pass++ : fail++;

console.log(`\n══ ${pass} passed, ${fail} failed ══`);
process.exit(fail?1:0);
