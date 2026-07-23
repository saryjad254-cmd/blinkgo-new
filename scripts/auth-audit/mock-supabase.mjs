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
  LOG(`REQ ${req.method} ${req.url.slice(0,70)}`);
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


  // ── Phase 3 render-test data: restaurants + products ──
  if (url.pathname === '/rest/v1/restaurants' && req.method === 'GET') {
    const row = { id: 'rest-1', owner_id: null, name: 'Testaurant', description: 'Best test food in town',
      image_url: 'https://images.unsplash.com/photo-cover.jpg', logo_url: null, address: 'Teststr. 1, Duisburg',
      latitude: 51.43, longitude: 6.76, cuisine: ['Pizza','Pasta'], is_verified: true, is_active: true,
      min_order_amount: 10, delivery_fee: 2.5, estimated_delivery_time: '25-35 min', rating: 4.6,
      review_count: 128, is_featured: true };
    const wantsSingle = (req.headers.accept||'').includes('vnd.pgrst.object');
    return json(res, 200, wantsSingle ? row : [row]);
  }
  if (url.pathname === '/rest/v1/products' && req.method === 'GET') {
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
