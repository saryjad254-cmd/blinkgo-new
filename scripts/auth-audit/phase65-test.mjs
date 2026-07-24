/** Phase 6.5 — service-client standardization verification. */
const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
async function session(code){const jar=new Jar();const ver='pkce_'+'v'.repeat(56);
  jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(ver)).toString('base64url'));
  const go=async(p,o={})=>{const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r};
  const cb=await go(`/auth/callback?code=${code}&next=%2F&lang=de`);
  return {go, authStatus: cb.status, authLoc: cb.headers.get('location')};
}
const KEY=process.env.KEY_STATE||'jwt';
let fail=0;
const line=(s,label,extra='')=>{const bad=s>=500;if(bad)fail++;console.log(`  ${bad?'⛔':'  '} ${String(s).padEnd(4)} ${label} ${extra}`)};

const cust = await session('code-new-user');
console.log(`[KEY_STATE=${KEY}] OAuth callback → ${cust.authStatus} ${cust.authLoc}`);
if (cust.authStatus >= 500) fail++;

console.log('\n── GET routes (customer session) ──');
for (const p of ['/api/orders/recent?limit=5','/api/products/bestsellers?limit=6','/api/products/recent?limit=6','/api/search?q=pizza','/api/recommendations','/api/favorites','/api/ratings?restaurant_id=rest-1','/api/orders?limit=5']) {
  const r = await cust.go(p); const b = await r.text();
  line(r.status, p.padEnd(38), b.slice(0,70).replace(/\s+/g,' '));
}

console.log('\n── page routes (server components using admin clients) ──');
for (const p of ['/restaurants','/search','/orders']) {
  const r = await cust.go(p); line(r.status, p.padEnd(38));
}

console.log('\n── restaurant/admin sessions ──');
const admin = await session('code-admin');
for (const p of ['/api/products/manage?restaurant_id=rest-1','/api/admin/daily-reset/history']) {
  const r = await admin.go(p); const b = await r.text();
  line(r.status, p.padEnd(38), b.slice(0,60).replace(/\s+/g,' '));
}
const upd = await admin.go('/api/products/manage', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id:'p1', image_urls:['https://img/x.jpg'] }) });
line(upd.status, '/api/products/manage PATCH'.padEnd(38), (await upd.text()).slice(0,60));

console.log('\n── stripe webhook (no valid signature expected; must not 500 from client construction) ──');
// Build a VALID Stripe signature so the route gets past verification and
// actually exercises its (now hardened) service client.
const crypto = await import('node:crypto');
const payload = JSON.stringify({ id:'evt_test', type:'payment_intent.succeeded',
  data:{ object:{ id:'pi_test', metadata:{ order_id:'o1' }, amount:2450, currency:'eur' } } });
const ts = Math.floor(Date.now()/1000);
const sig = crypto.createHmac('sha256', 'whsec_test_placeholder').update(`${ts}.${payload}`).digest('hex');
const wh = await fetch(APP+'/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${ts},v1=${sig}`},body:payload});
line(wh.status, '/api/stripe/webhook'.padEnd(38), (await wh.text()).slice(0,60));

console.log(`\n${fail?'✗ '+fail+' route(s) returned 5xx':'✓ no route returned 5xx'}`);
process.exit(fail?1:0);
