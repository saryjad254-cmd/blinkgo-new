const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ACCOUNTS = {
  restaurant: ['wesseling@blinkgo.de', 'BlinkGoWesseling2026!'],
  admin: ['admin@blinkgo.com', 'BlinkGoAdmin2026!'],
};
let cookies = {};
let passed = 0;
let failed = 0;

function record(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function capture(headers) {
  const rows = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  for (const row of rows) { const pair = row.split(';')[0]; const index = pair.indexOf('='); if (index > 0) cookies[pair.slice(0, index)] = pair.slice(index + 1); }
}
async function call(path, init = {}) {
  const response = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...(init.headers || {}) } });
  capture(response.headers); const body = await response.json().catch(() => ({})); return { response, body };
}
async function login(role) {
  cookies = {}; const [email, password] = ACCOUNTS[role]; return call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

async function run() {
  console.log('\nBlinkGo product governance integration');
  await call('/api/dev/test/reset', { method: 'POST' });
  const restaurantLogin = await login('restaurant');
  record('Restaurant signs in', restaurantLogin.response.ok, JSON.stringify(restaurantLogin.body));
  const dash = await call('/api/restaurant/dashboard');
  const restaurantId = dash.body?.stats?.restaurantId || dash.body?.data?.stats?.restaurantId;
  record('Restaurant context resolved', Boolean(restaurantId));

  const direct = await call('/api/products/manage', { method: 'POST', body: JSON.stringify({ restaurant_id: restaurantId, name: 'Forbidden direct product', price: 1 }) });
  record('Restaurant cannot publish directly', direct.response.status === 403, `${direct.response.status}`);
  const productList = await call(`/api/products/manage?restaurant_id=${restaurantId}`);
  const existingId = productList.body?.products?.[0]?.id;
  if (existingId) {
    const deletion = await call('/api/products/manage', { method: 'DELETE', body: JSON.stringify({ id: existingId }) });
    record('Restaurant cannot delete products', deletion.response.status === 403, `${deletion.response.status}`);
    const forbiddenEdit = await call('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: existingId, name: 'Tampered name' }) });
    record('Restaurant name edit is rejected by allow-list', forbiddenEdit.response.status === 400 && forbiddenEdit.body?.ok === false);
  }

  const name = `Governance Bowl ${Date.now()}`;
  const submitted = await call('/api/product-requests', { method: 'POST', body: JSON.stringify({ name, description: 'Automated approval workflow', category: 'Bowls', suggested_price: 13.4, preparation_time: 12 }) });
  const requestId = submitted.body?.request?.id;
  record('Restaurant submits pending request', submitted.response.status === 201 && submitted.body?.request?.status === 'pending', JSON.stringify(submitted.body));

  const before = await call(`/api/products/by-restaurant?restaurant_id=${restaurantId}`);
  record('Pending product hidden from customers', !(before.body?.products || []).some((p) => p.name === name));

  await login('admin');
  const approved = await call('/api/admin/product-requests', { method: 'PATCH', body: JSON.stringify({ action: 'approve', id: requestId }) });
  record('Admin approves request atomically', approved.response.ok && Boolean(approved.body?.product_id), JSON.stringify(approved.body));
  const duplicate = await call('/api/admin/product-requests', { method: 'PATCH', body: JSON.stringify({ action: 'approve', id: requestId }) });
  record('Concurrent/double approval rejected', duplicate.response.status === 409, `${duplicate.response.status}`);

  const after = await call(`/api/products/by-restaurant?restaurant_id=${restaurantId}`);
  const customerProduct = (after.body?.products || []).find((p) => p.name === name);
  record('Approved product becomes customer-visible', customerProduct?.approval_status === 'approved' && customerProduct?.archived_at == null);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run().catch((error) => { console.error(error); process.exit(1); });
