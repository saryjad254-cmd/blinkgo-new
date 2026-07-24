/** Phase 6.3 — full authenticated crawl, all locales, both error boundaries. */
const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
async function auth(code){const jar=new Jar();const ver='pkce_'+'v'.repeat(56);
  jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(ver)).toString('base64url'));
  const go=async(p,o={})=>{const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r};
  await go(`/auth/callback?code=${code}&next=%2F&lang=de`); return go;}

const GLOBAL='Etwas ist schiefgelaufen', CUST='Ein Fehler ist aufgetreten';
const CUSTOMER=['/','/restaurants','/search','/favorites','/cart','/orders','/profile','/notifications','/payment-history','/account','/restaurants/rest-1','/customer/support','/help','/welcome'];
const DRIVER=['/driver/dashboard','/driver/orders','/driver/orders/available','/driver/earnings','/driver/history','/driver/documents','/driver/settings','/driver/payouts','/driver/support'];
const REST=['/restaurant/dashboard','/restaurant/orders','/restaurant/menu','/restaurant/menu/new','/restaurant/kitchen','/restaurant/settings','/restaurant/support'];
const ADMIN=['/admin','/admin/dashboard','/admin/restaurants','/admin/drivers','/admin/orders','/admin/users','/admin/analytics','/admin/finance','/admin/system','/admin/control-center','/admin/executive','/admin/operations','/admin/support','/admin/coupons','/admin/refunds'];

const globalHits=[], custHits=[], fivexx=[];
async function crawl(label, go, routes, locale){
  for(const r of routes){
    let res; try{ res=await go(r,{headers:{Cookie:'blinkgo-locale='+locale}}); }catch(e){ console.log(`  ${r} FETCH-FAIL ${e.message}`); continue; }
    if(res.status>=500){ fivexx.push(`${r} [${locale}] ${res.status}`); console.log(`  ⛔ ${res.status} ${r} [${locale}]`); continue; }
    if(res.status!==200) continue;
    const html=await res.text();
    if(html.includes(GLOBAL)){ globalHits.push(`${r} [${locale}]`); console.log(`  ⛔ GLOBAL-ERROR ${r} [${locale}]`); }
    else if(html.includes(CUST)){ custHits.push(`${r} [${locale}]`); console.log(`  ⚠ customer-error ${r} [${locale}]`); }
  }
}
const goCustomer=await auth('code-new-user');
const goDriver=await auth('code-existing-driver');
for(const loc of ['de','ar','en']){
  console.log(`\n── locale ${loc} : customer routes ──`);
  await crawl('customer',goCustomer,CUSTOMER,loc);
  console.log(`── locale ${loc} : driver routes ──`);
  await crawl('driver',goDriver,DRIVER,loc);
  console.log(`── locale ${loc} : restaurant+admin routes (role-guarded) ──`);
  await crawl('rest',goCustomer,[...REST,...ADMIN],loc);
}
console.log('\n════ RESULT ════');
console.log('GLOBAL error boundary hits :', globalHits.length?globalHits.join(', '):'NONE');
console.log('customer error boundary hits:', custHits.length?custHits.join(', '):'NONE');
console.log('5xx routes                 :', fivexx.length?fivexx.join(', '):'NONE');
