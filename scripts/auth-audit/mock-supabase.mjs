import http from 'node:http';
import fs from 'node:fs';
const LOG=(m)=>{try{fs.appendFileSync('/tmp/mock-req.log', m+'\n')}catch{}};

const PORT = 54321;
const now = () => Math.floor(Date.now() / 1000);

const users = new Map(); // id -> profile row (public.users)
const EXISTING_DRIVER_ID = 'driver00-1111-2222-3333-444455556666';
users.set(EXISTING_DRIVER_ID, {
  id: EXISTING_DRIVER_ID, email: 'driver@gmail.com', name: 'Existing Driver',
  role: 'driver', is_active: true, restaurant_id: null, is_verified: true,
});

const OWNER_ID = 'owner001-1111-2222-3333-444455556666';
users.set(OWNER_ID, { id: OWNER_ID, email: 'owner@gmail.com', name: 'Rest Owner',
  role: 'restaurant', is_active: true, restaurant_id: 'rest-1', is_verified: true });

const ADMIN_ID = 'admin001-1111-2222-3333-444455556666';
users.set(ADMIN_ID, { id: ADMIN_ID, email: 'admin@gmail.com', name: 'Admin',
  role: 'admin', is_active: true, restaurant_id: null, is_verified: true });

const identLarge = 'https://lh3.googleusercontent.com/a/' + 'X'.repeat(120) + '=s96-c';

function makeSession(userId, email, name) {
  const meta = { iss: 'https://accounts.google.com', sub: '1'.repeat(21), name, email,
    picture: identLarge, full_name: name, avatar_url: identLarge, provider_id: '1'.repeat(21),
    email_verified: true, phone_verified: false };
  const user = {
    id: userId, aud: 'authenticated', role: 'authenticated', email,
    email_confirmed_at: new Date().toISOString(), phone: '',
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: meta,
    identities: [{ identity_id: 'i1', id: meta.sub, user_id: userId, identity_data: meta,
      provider: 'google', last_sign_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), email }],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_anonymous: false,
  };
  return {
    access_token: 'at-' + userId + '-' + 'A'.repeat(700),
    token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600,
    refresh_token: 'rt-' + userId, user,
  };
}

// code -> session template (which auth user the OAuth code belongs to)
const codes = new Map();
codes.set('code-new-user', makeSession('newuser0-1111-2222-3333-444455556666', 'newbie@gmail.com', 'New Google User'));
codes.set('code-admin', makeSession(ADMIN_ID, 'admin@gmail.com', 'Admin'));
codes.set('code-restaurant-owner', makeSession(OWNER_ID, 'owner@gmail.com', 'Rest Owner'));
codes.set('code-existing-driver', makeSession(EXISTING_DRIVER_ID, 'driver@gmail.com', 'Existing Driver'));

const revoked = new Set();
let seq = 0;
const active = []; // sessions minted by pkce/refresh grants

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

http.createServer(async (req, res) => {
  {
    const a = req.headers.authorization || '';
    const k = String(req.headers.apikey || '');
    // Flag the exact production failure mode: a new-format secret sent as a Bearer JWT.
    if (a.startsWith('Bearer sb_secret_')) LOG(`UNSAFE_BEARER ${req.method} ${req.url.slice(0,50)}`);
    LOG(`REQ ${req.method} ${req.url.slice(0,60)} auth=${a ? a.slice(0,14) + '…' : 'NONE'} apikey=${k ? k.slice(0,10) + '…' : 'NONE'}`);
  }
  const _end = res.end.bind(res);
  res.end = (...a) => { LOG(`RES ${req.method} ${req.url.slice(0,50)} -> ${res.statusCode}`); return _end(...a); };
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let body = '';
  for await (const chunk of req) body += chunk;
  const parsed = body ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : {};

  // ── GoTrue ──
  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'pkce') {
      if (!parsed.auth_code || !parsed.code_verifier)
        return json(res, 400, { error: 'invalid_request', error_description: 'both auth code and code verifier should be non-empty' });
      const tmpl = codes.get(parsed.auth_code);
      if (!tmpl) return json(res, 400, { error: 'invalid_grant', error_description: 'invalid oauth code' });
      // Real Supabase mints FRESH tokens on every exchange — do the same.
      const n = ++seq;
      const fresh = { ...tmpl, access_token: `at-${n}-` + tmpl.user.id + '-' + 'A'.repeat(700), refresh_token: `rt-${n}-` + tmpl.user.id, expires_at: now() + 3600 };
      active.push(fresh);
      return json(res, 200, fresh);
    }
    if (grant === 'refresh_token') {
      const rt = parsed.refresh_token;
      const prev = active.find((s) => s.refresh_token === rt);
      if (!rt || revoked.has(rt) || !prev) return json(res, 400, { error: 'invalid_grant', error_description: 'refresh token revoked' });
      const n = ++seq;
      const fresh = { ...prev, access_token: `at-${n}-` + prev.user.id + '-' + 'B'.repeat(700), refresh_token: `rt-${n}-` + prev.user.id, expires_at: now() + 3600 };
      active.push(fresh);
      return json(res, 200, fresh);
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const auth = req.headers.authorization || '';
    const sess = active.find((s) => auth.includes(s.access_token));
    if (!sess || revoked.has(sess.refresh_token)) { LOG(`USER401 active=${active.length} authHead=${auth.slice(0,40)}`); return json(res, 401, { message: 'invalid JWT' }); }
    return json(res, 200, sess.user);
  }
  if (url.pathname === '/auth/v1/logout') {
    const auth = req.headers.authorization || '';
    const sess = active.find((s) => auth.includes(s.access_token));
    if (sess) revoked.add(sess.refresh_token);
    res.writeHead(204); return res.end();
  }
  if (url.pathname.startsWith('/auth/v1/admin/')) { res.writeHead(204); return res.end(); }



  // ── Phase 6.3 PRODUCTION REPRODUCTION ──
  // Emulate the real production schema: public.products has NO `image_url`
  // column (only `image_urls`). PostgREST answers 400/42703 exactly as the
  // Vercel logs showed: "column products.image_url does not exist".
  if (url.pathname === '/rest/v1/products') {
    const sel = url.searchParams.get('select') || '';
    const refsMissingCol = /(^|[,(\s])image_url([,)\s]|$)/.test(sel);
    if (refsMissingCol) {
      LOG(`PRODUCTS_42703 select=${sel.slice(0,80)}`);
      return json(res, 400, { code: '42703', details: null, hint: null,
        message: 'column products.image_url does not exist' });
    }
  }

  // Hypothesis test: production `restaurants` may also lack `image_url`
  // (same schema drift as products). Toggle with STRICT_RESTAURANTS=1.
  if (process.env.STRICT_RESTAURANTS === '1' && url.pathname === '/rest/v1/restaurants') {
    const sel = url.searchParams.get('select') || '';
    if (/image_url/.test(sel)) {
      LOG(`RESTAURANTS_42703 select=${sel.slice(0,90)}`);
      return json(res, 400, { code: '42703', details: null, hint: null,
        message: 'column restaurants.image_url does not exist' });
    }
  }

  // Emulate PostgREST rejecting an INVALID api key (KEY_STATE=invalid).
  if (url.pathname.startsWith('/rest/v1') && process.env.KEY_STATE === 'invalid') {
    LOG('INVALID_API_KEY ' + req.method + ' ' + url.pathname);
    return json(res, 401, { code: '401', message: 'Invalid API key', details: null, hint: null });
  }

  // Real PostgREST rejects a Bearer sb_secret_* token on every REST endpoint.
  if (url.pathname.startsWith('/rest/v1') && (req.headers.authorization || '').startsWith('Bearer sb_secret_')) {
    LOG(`PGRST301 ${req.method} ${url.pathname}`);
    return json(res, 401, { code: 'PGRST301', message: 'invalid JWT: unable to parse or verify signature, token is unverifiable: error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256', details: null, hint: null });
  }

  // ── Phase 6.6: support_tickets CHECK constraint as deployed ──
  if (url.pathname === '/rest/v1/support_tickets' && req.method === 'POST') {
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    // Post-migration 46 constraint: canonical 'restaurant'
    const ALLOWED = ['customer', 'driver', 'restaurant', 'admin'];
    for (const r of rows) {
      if (!ALLOWED.includes(r?.user_role)) {
        LOG(`SUPPORT_CHECK_VIOLATION user_role=${r?.user_role}`);
        return json(res, 400, { code: '23514', message: 'new row for relation "support_tickets" violates check constraint "support_tickets_user_role_check"', details: null, hint: null });
      }
    }
    LOG(`SUPPORT_TICKET_OK user_role=${rows[0]?.user_role}`);
    return json(res, 201, rows.map((r, i) => ({ id: 'tkt-' + (i + 1), status: 'open', ...r })));
  }

  // ── Phase 6.4: production-accurate products WRITES ──
  // The deployed products table has image_urls but NO image_url column.
  if (url.pathname === '/rest/v1/products' && (req.method === 'POST' || req.method === 'PATCH')) {
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const r of rows) {
      if (r && Object.prototype.hasOwnProperty.call(r, 'image_url')) {
        LOG(`PRODUCT_WRITE_42703 method=${req.method} keys=${Object.keys(r).join(',')}`);
        return json(res, 400, { code: 'PGRST204', details: null, hint: null,
          message: "Could not find the 'image_url' column of 'products' in the schema cache" });
      }
    }
    LOG(`PRODUCT_WRITE_OK method=${req.method} image_urls=${JSON.stringify(rows[0]?.image_urls)}`);
    const saved = rows.map((r, i) => ({ id: r.id || 'new-prod-' + (i + 1), ...r }));
    return json(res, req.method === 'POST' ? 201 : 200, saved);
  }

  // ── Phase 6.4: /rest/v1/orders with configurable failure modes ──
  if (url.pathname === '/rest/v1/orders' && req.method === 'GET') {
    const mode = process.env.ORDERS_MODE || 'ok';
    const auth = req.headers.authorization || '';
    LOG('ORDERS_AUTH_HDR=' + auth.slice(0,30) + ' apikey=' + String(req.headers.apikey||'').slice(0,18));
    // Reproduce the real PostgREST rejection when a new-format sb_secret_* key
    // is sent as `Authorization: Bearer` (see lib/supabase/service.ts).
    if (mode === 'jwt_kid' || (auth.startsWith('Bearer sb_secret_'))) {
      LOG('ORDERS_JWT_KID auth=' + auth.slice(0, 26));
      return json(res, 401, { code: 'PGRST301', details: null, hint: null,
        message: 'invalid JWT: unable to parse or verify signature, token is unverifiable: error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256' });
    }
    if (mode === 'col_missing') {
      return json(res, 400, { code: '42703', message: 'column orders.total does not exist', details: null, hint: null });
    }
    if (mode === 'rel_missing') {
      return json(res, 400, { code: 'PGRST200', message: "Could not find a relationship between 'orders' and 'restaurants' in the schema cache", details: null, hint: null });
    }
    const rest = { id: 'rest-1', name: 'Testaurant', image_url: 'https://img/cover.jpg', delivery_fee: 2.5 };
    const items = [{ product_id: 'p1', name: 'Dish 1', category: 'Pizza' }];
    const base = [
      { id: 'o1', status: 'delivered', total: 24.5, items, created_at: new Date().toISOString(), restaurant_id: 'rest-1', restaurants: mode === 'null_rel' ? null : rest },
      { id: 'o2', status: 'completed', total: 12.0, items, created_at: new Date().toISOString(), restaurant_id: 'rest-2', restaurants: mode === 'null_rel' ? null : { ...rest, id: 'rest-2', image_url: null } },
    ];
    return json(res, 200, base);
  }
  // ── Phase 3 render-test data: restaurants + products ──
  if (url.pathname === '/rest/v1/restaurants' && req.method === 'GET') {
    const ownerFilter = url.searchParams.get('owner_id');
    if (ownerFilter) {
      const wantsOne = (req.headers.accept || '').includes('vnd.pgrst.object');
      const owned = { id: 'rest-1', owner_id: ownerFilter.replace('eq.', ''), name: 'Testaurant' };
      return json(res, 200, wantsOne ? owned : [owned]);
    }
    const row = { id: 'rest-1', owner_id: null, name: 'Testaurant', description: 'Best test food in town',
      image_url: 'https://images.unsplash.com/photo-cover.jpg', logo_url: null, address: 'Teststr. 1, Duisburg',
      latitude: 51.43, longitude: 6.76, cuisine: ['Pizza','Pasta'], is_verified: true, is_active: true,
      min_order_amount: 10, delivery_fee: 2.5, estimated_delivery_time: '25-35 min', rating: 4.6,
      review_count: 128, is_featured: true };
    const wantsSingle = (req.headers.accept||'').includes('vnd.pgrst.object');
    return json(res, 200, wantsSingle ? row : [row]);
  }
  if (url.pathname === '/rest/v1/products' && req.method === 'GET') {
    // PROD-FAITHFUL (Phase 6.3): production's products table has NO image_url
    // column (only image_urls). Reject exactly like PostgREST does.
    const sel = url.searchParams.get('select') || '';
    if (/(^|,|\s)image_url(,|$|\s)/.test(sel.replace(/:[^,]+/g, ''))) {
      return json(res, 400, { code: '42703', details: null, hint: null, message: 'column products.image_url does not exist' });
    }
    const mk = (i, cat) => ({ id: 'p'+i, restaurant_id: 'rest-1', category_id: null, category: cat,
      name: 'Dish '+i, description: 'Tasty test dish number '+i, price: 9.9+i, discount_price: i===1?7.9:null,
      image_urls: [], image_url: (i%2)? 'https://images.unsplash.com/photo-'+i+'.jpg' : null,
      is_available: true, is_featured: i===1, sold_count: 10*i });
    return json(res, 200, [mk(1,'Pizza'), mk(2,'Pizza'), mk(3,'Pasta'), mk(4,'Pasta'), mk(5,'Desserts')]);
  }
  // ── PostgREST: public.users ──
  if (url.pathname === '/rest/v1/users') {
    if (req.method === 'GET') {
      const idFilter = url.searchParams.get('id'); // eq.<uuid>
      const id = idFilter?.replace('eq.', '');
      const row = id ? users.get(id) : null;
      const wantsSingle = (req.headers.accept || '').includes('vnd.pgrst.object');
      if (wantsSingle) {
        if (!row) return json(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return json(res, 200, row);
      }
      return json(res, 200, row ? [row] : []);
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const out = [];
      for (const r of rows) {
        if (!users.has(r.id)) users.set(r.id, { restaurant_id: null, ...r });
        out.push(users.get(r.id));
      }
      return json(res, 201, out);
    }
  }
  // Any other table used incidentally (audit logs, driver_status, etc.)
  if (url.pathname.startsWith('/rest/v1/')) {
    if (req.method === 'GET') return json(res, 200, []);
    return json(res, 201, []);
  }

  json(res, 404, { message: 'not found: ' + url.pathname });
}).listen(PORT, '127.0.0.1', () => console.log('mock supabase on :' + PORT));
