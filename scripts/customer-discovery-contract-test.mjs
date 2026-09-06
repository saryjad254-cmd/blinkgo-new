import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
let passed = 0;

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function check(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${name}`);
}

const [home, search, retail, marketplace] = await Promise.all([
  source('app/(customer)/home/HomeClient.tsx'),
  source('app/(customer)/search/page.tsx'),
  source('components/customer/RetailCatalogClient.tsx'),
  source('components/customer/CustomerMarketplaceNav.tsx'),
]);

check('hero grocery CTA opens the market storefront', home.includes("groceries: '/market'"));
check('hero availability CTA opens search with live availability', home.includes("availability: '/search?open_now=1'"));
check('home filter shortcut has a deep-link contract', home.includes("router.push('/search?filter=1')"));
check('search initializes the filter panel from its URL', search.includes("params?.get('filter') === '1'"));
check('search filter toggle writes and removes its URL state', search.includes("next.set('filter', '1')") && search.includes("next.delete('filter')"));
check('browser history restores the complete search state from the URL', search.includes("addEventListener('popstate'") && search.includes('setShowFilters(next.get(\'filter\') === \'1\')') && search.includes('setView(nextRawView'));
check('retail search, category and sort initialize from the URL', ['params.get(\'q\')', 'params.get(\'category\')', "params.get('sort')"].every((value) => retail.includes(value)));
check('retail filters persist through replace navigation', retail.includes('router.replace') && retail.includes('paramsString'));
check('retail empty results provide a filter reset', retail.includes('onClick={clearFilters}') && retail.includes('setSort(\'recommended\')'));
check('three customer storefront routes remain explicit', ['/restaurants', '/market', '/shop'].every((route) => marketplace.includes(route)));

console.log(`Customer discovery contract: ${passed}/${passed} checks passed.`);
