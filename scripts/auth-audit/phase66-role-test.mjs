/** Phase 6.6 — role routing + authorization verification for all four roles. */
const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
async function session(code){const jar=new Jar();const ver='pkce_'+'v'.repeat(56);
  jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(ver)).toString('base64url'));
  const go=async(p,o={})=>{const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r};
  const cb=await go(`/auth/callback?code=${code}&next=%2F&lang=de`);
  return {go, redirect:(cb.headers.get('location')||'').replace(/^https?:\/\/[^/]+/,'').split('?')[0]};
}
let pass=0,fail=0;
/**
 * Next.js streaming SSR returns HTTP 200 for a server-side redirect() — the
 * redirect resolves on the client. So denial CANNOT be detected by status.
 * A denied request ships the loading shell + a NEXT_REDIRECT marker and never
 * contains the protected page's content; an allowed one renders real content.
 */
async function classify(res) {
  const html = await res.text();
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const redirected = /NEXT_REDIRECT/.test(html) || (res.status >= 300 && res.status < 400);
  const shellOnly = /^BlinkGo (Wird geladen|جاري التحميل|Loading)/.test(visible) || visible.length < 60;
  return { denied: redirected && shellOnly, rendered: !redirected && !shellOnly, visible: visible.slice(0, 60), status: res.status };
}
const check=(n,c,d='')=>{c?pass++:fail++;console.log(`  ${c?'✓':'✗'} ${n}${c?'':'   '+d}`)};

console.log('── 1) OAuth callback role routing ──');
const ROLES = [
  ['customer',   'code-new-user',          '/search'],
  ['driver',     'code-existing-driver',   '/driver/dashboard'],
  ['restaurant', 'code-restaurant-owner',  '/restaurant/dashboard'],
  ['admin',      'code-admin',             '/admin'],
];
const S = {};
for (const [role, code, expected] of ROLES) {
  const s = await session(code); S[role] = s;
  check(`${role.padEnd(10)} → ${expected}`, s.redirect === expected, `got ${s.redirect}`);
}

console.log('\n── 2) restaurant user CAN access restaurant routes ──');
for (const p of ['/restaurant/dashboard','/restaurant/orders','/restaurant/menu','/restaurant/kitchen','/restaurant/settings','/restaurant/support']) {
  const c = await classify(await S.restaurant.go(p));
  check(`${p.padEnd(24)} allowed`, !c.denied, `status=${c.status} "${c.visible}"`);
}

console.log('\n── 3) restaurant user CANNOT access admin/driver routes ──');
for (const p of ['/admin','/admin/dashboard','/admin/users','/driver/dashboard','/driver/earnings']) {
  const c = await classify(await S.restaurant.go(p));
  check(`${p.padEnd(24)} denied`, c.denied, `status=${c.status} "${c.visible}"`);
}

console.log('\n── 4) other roles keep their own boundaries ──');
const neg = [
  ['customer','/admin'],['customer','/restaurant/dashboard'],['customer','/driver/dashboard'],
  ['driver','/admin'],['driver','/restaurant/dashboard'],
];
for (const [role,p] of neg) {
  const c = await classify(await S[role].go(p));
  check(`${role.padEnd(10)} denied ${p.padEnd(22)}`, c.denied, `status=${c.status} "${c.visible}"`);
}
console.log('\n── 5) admin keeps admin access ──');
{ const c = await classify(await S.admin.go('/admin')); check('admin → /admin allowed', !c.denied, `status=${c.status} "${c.visible}"`); }


console.log('\n── 6) support ticket write boundary (deployed CHECK constraint) ──');
{
  const r = await S.restaurant.go('/api/support', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ category:'technical', subject:'Test ticket', message:'Hello from a restaurant user', priority:'normal' }),
  });
  const b = await r.text();
  const okCreate = r.status < 400 && !/23514|check constraint/.test(b);
  console.log(`  ${okCreate?'✓':'✗'} restaurant user can file a support ticket  (status=${r.status}) ${b.slice(0,90).replace(/\s+/g,' ')}`);
  if (!okCreate) process.exitCode = 1;
}

console.log(`
══ ${pass} passed, ${fail} failed ══`);
process.exit(fail?1:0);
