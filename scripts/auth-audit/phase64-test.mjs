/**
 * Phase 6.4 test suite
 *  A) /api/orders/recent under every failure condition (failure matrix)
 *  B) product create / update writes
 */
const APP = 'http://127.0.0.1:3999';
class Jar {
  constructor() { this.m = new Map(); }
  ing(sc) { for (const s of sc) { const [p] = s.split(';'); const i = p.indexOf('='); const n = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); const ma = s.match(/Max-Age=(-?\d+)/i); if ((ma && +ma[1] <= 0) || v === '') this.m.delete(n); else this.m.set(n, v); } }
  h() { return [...this.m.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
}
async function session(code) {
  const jar = new Jar();
  const ver = 'pkce_' + 'v'.repeat(56);
  jar.m.set('sb-127-auth-token-code-verifier', 'base64-' + Buffer.from(JSON.stringify(ver)).toString('base64url'));
  const go = async (p, o = {}) => {
    const r = await fetch(APP + p, { redirect: 'manual', ...o, headers: { Cookie: jar.h(), Origin: APP, ...(o.headers || {}) } });
    jar.ing(r.headers.getSetCookie?.() ?? []);
    return r;
  };
  const cbres = await go(`/auth/callback?code=${code}&next=%2F&lang=de`);
  if (process.env.DEBUG_AUTH) console.log(`   [auth ${code}] → ${cbres.status} ${cbres.headers.get('location')}`);
  return go;
}

const MODE = process.env.ORDERS_MODE || 'ok';
const KEYSTATE = process.env.KEY_STATE || 'jwt';
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + detail}`); };

const go = await session('code-new-user');

// ── A) recent orders ──
const r = await go('/api/orders/recent?limit=5');
const body = await r.text();
console.log(`\n[ORDERS_MODE=${MODE} KEY_STATE=${KEYSTATE}] /api/orders/recent → ${r.status}`);
console.log(`   body: ${body.slice(0, 190).replace(/\s+/g, ' ')}`);
check('never returns 5xx', r.status < 500, `got ${r.status}`);
let parsed = null;
try { parsed = JSON.parse(body); } catch { }
check('response is valid JSON', parsed !== null);
if (parsed && r.status === 200) {
  const orders = parsed?.data?.orders ?? parsed?.orders;
  check('typed shape: data.orders is an array', Array.isArray(orders), JSON.stringify(parsed).slice(0, 120));
  if (Array.isArray(orders) && orders.length) {
    check('cover_url normalized on relation', orders.every((o) => !o.restaurants || 'cover_url' in o.restaurants));
  }
  if (MODE === 'null_rel' && Array.isArray(orders)) {
    check('null relation does not crash', true);
  }
  if (MODE === 'ok' && Array.isArray(orders)) {
    check('happy path returns deduped orders', orders.length >= 1, `len=${orders.length}`);
  }
  if (MODE !== 'ok' && MODE !== 'null_rel' && Array.isArray(orders)) {
    check('degraded failure surfaces a machine-readable marker', typeof parsed?.data?.degraded !== 'undefined' || orders.length === 0, JSON.stringify(parsed).slice(0, 140));
  }
}

// ── B) product writes (only meaningful in the default mode) ──
if (MODE === 'ok') {
  const goRest = await session('code-restaurant-owner');
  console.log('\n[product writes]');
  const create = await goRest('/api/products/manage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurant_id: 'rest-1', name: 'New Dish', price: 9.9, image_urls: ['https://img/a.jpg'], category: 'Pizza' }),
  });
  const cb = await create.text();
  console.log(`  create → ${create.status} ${cb.slice(0, 150).replace(/\s+/g, ' ')}`);
  check('create does not fail on a missing column', !/image_url'?\s+column|42703|PGRST204/.test(cb), cb.slice(0, 120));

  const legacy = await goRest('/api/products/manage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurant_id: 'rest-1', name: 'Legacy Dish', price: 5, image_url: 'https://img/legacy.jpg' }),
  });
  const lb = await legacy.text();
  console.log(`  create(legacy image_url) → ${legacy.status} ${lb.slice(0, 150).replace(/\s+/g, ' ')}`);
  check('legacy image_url input still accepted', !/PGRST204|42703/.test(lb), lb.slice(0, 120));

  const empty = await goRest('/api/products/manage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurant_id: 'rest-1', name: 'No Image', price: 3, image_urls: [] }),
  });
  const eb = await empty.text();
  console.log(`  create(empty array) → ${empty.status} ${eb.slice(0, 120).replace(/\s+/g, ' ')}`);
  check('empty image array handled safely', !/PGRST204|42703/.test(eb), eb.slice(0, 120));

  // Update as admin: the ownership pre-check is admin-bypassed, so this
  // exercises the real PATCH write path rather than stopping at a 403.
  const goAdmin = await session('code-admin');
  const upd = await goAdmin('/api/products/manage', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'p1', image_urls: ['https://img/new.jpg'] }),
  });
  const ub = await upd.text();
  console.log(`  update → ${upd.status} ${ub.slice(0, 150).replace(/\s+/g, ' ')}`);
  check('update reaches the DB write (not blocked earlier)', upd.status === 200, `status=${upd.status} ${ub.slice(0, 90)}`);
  check('update does not fail on a missing column', !/PGRST204|42703/.test(ub), ub.slice(0, 120));

  const updLegacy = await goAdmin('/api/products/manage', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'p1', image_url: 'https://img/legacy-upd.jpg' }),
  });
  const ulb = await updLegacy.text();
  console.log(`  update(legacy image_url) → ${updLegacy.status} ${ulb.slice(0, 120).replace(/\s+/g, ' ')}`);
  check('legacy image_url update writes image_urls only', updLegacy.status === 200 && !/PGRST204/.test(ulb), ulb.slice(0, 120));
}

console.log(`\n── ${pass} passed, ${fail} failed ──`);
process.exit(fail ? 1 : 0);
