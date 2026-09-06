import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatAddressArea } from '../lib/format-address.ts';

const cases = [
  ['Musterstraße 9, 50389 Wesseling, Germany', '50389 Wesseling'],
  [{ street: 'Musterstraße 9', postal_code: '50389', city: 'Wesseling' }, '50389 Wesseling'],
  [JSON.stringify({ address: 'Musterstraße 9, 50389 Wesseling, Germany' }), '50389 Wesseling'],
  ['Musterstraße 9, Wesseling', 'HIDDEN'],
];

for (const [input, expected] of cases) {
  assert.equal(formatAddressArea(input, 'HIDDEN'), expected);
}

const [offerPage, offerClient, detailPage] = await Promise.all([
  readFile(new URL('../app/driver/orders/available/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/driver/AvailableOrdersClient.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/driver/orders/[id]/page.tsx', import.meta.url), 'utf8'),
]);

assert.match(offerPage, /delivery_address:\s*privateDeliveryAddress/);
assert.match(offerPage, /delivery_area:\s*formatAddressArea\(privateDeliveryAddress/);
assert.match(offerPage, /\.\.\.safeOrder,/);
assert.match(offerClient, /delivery_area\?:\s*string/);
assert.doesNotMatch(offerClient, /delivery_address\?:/);
assert.match(detailPage, /if \(order\.driver_id !== driverId\) return null/);

console.log(`driver offer privacy: ${cases.length + 6}/${cases.length + 6} passed`);
