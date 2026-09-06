import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const base = process.env.MOCK_SUPABASE_URL || 'http://localhost:54321';
let passed = 0;

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function products(vertical) {
  const response = await fetch(`${base}/rest/v1/products?storefront_vertical=eq.${vertical}&select=id,name,restaurant_id,storefront_vertical`);
  assert.equal(response.ok, true);
  return response.json();
}

const market = await products('market');
const shop = await products('shop');

await check('market and shop both use persistent product rows', async () => {
  assert.ok(market.length > 0);
  assert.ok(shop.length > 0);
});

await check('the two storefront inventories are disjoint', async () => {
  const marketIds = new Set(market.map((item) => item.id));
  assert.equal(shop.some((item) => marketIds.has(item.id)), false);
});

await check('every retail card has a live product and seller target', async () => {
  for (const item of [...market, ...shop]) {
    const [productResponse, sellerResponse] = await Promise.all([
      fetch(`${base}/rest/v1/products?id=eq.${item.id}&select=id`),
      fetch(`${base}/rest/v1/restaurants?id=eq.${item.restaurant_id}&select=id,is_active`),
    ]);
    assert.equal(productResponse.ok, true);
    assert.equal(sellerResponse.ok, true);
    assert.equal((await productResponse.json()).length, 1);
    assert.equal((await sellerResponse.json()).length, 1);
  }
});

await check('customer pages request their explicit storefront vertical', async () => {
  const marketPage = await readFile(path.join(root, 'app/(customer)/market/page.tsx'), 'utf8');
  const shopPage = await readFile(path.join(root, 'app/(customer)/shop/page.tsx'), 'utf8');
  assert.match(marketPage, /loadRetailCatalog\('market'\)/);
  assert.match(shopPage, /loadRetailCatalog\('shop'\)/);
});

await check('catalog supports search, category, sorting, seller links and delivery radius', async () => {
  const client = await readFile(path.join(root, 'components/customer/RetailCatalogClient.tsx'), 'utf8');
  for (const contract of ['retail-sort', 'price-low', 'popular', '/restaurants/${product.restaurant_id}', 'seller_delivery_radius_km', 'blinkgo-last-location']) assert.ok(client.includes(contract));
});

await check('database migration enforces and indexes the vertical contract', async () => {
  const migration = await readFile(path.join(root, 'supabase/migrations/20260814032646_add_product_storefront_vertical.sql'), 'utf8');
  assert.match(migration, /set not null/);
  assert.match(migration, /products_storefront_vertical_check/);
  assert.match(migration, /products_storefront_catalog_idx/);
});

console.log(`Storefront separation: ${passed}/${passed} checks passed.`);
