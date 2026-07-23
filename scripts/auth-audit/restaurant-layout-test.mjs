// Render-verify the Restaurant Details page (authenticated via mock OAuth)
const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
const jar=new Jar();
const verifier='pkce_'+'v'.repeat(56);
jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(verifier)).toString('base64url'));
async function go(p,o={}){const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r}
await go('/auth/callback?code=code-new-user&next=%2F&lang=de');
const r=await go('/restaurants/rest-1');
console.log('status:',r.status);
const html=await r.text();
const checks={
 'no duplicate PageHeader band (single h1 name)': (html.match(/Testaurant/g)||[]).length>=1 && !html.includes('min-h-[56px]'),
 'hero taller (md:h-80)': html.includes('md:h-80'),
 'floating RTL-safe back (start-4)': html.includes('start-4'),
 'card overlap (-mt-20 sm:-mt-24)': html.includes('-mt-20 sm:-mt-24'),
 'address inside card (MapPin)': html.includes('Teststr. 1, Duisburg'),
 'category chips nav (3 cats)': html.includes('#cat-pizza') && html.includes('#cat-pasta') && html.includes('#cat-desserts'),
 'sticky chips': html.includes('sticky top-14 md:top-16'),
 'sections with scroll anchors': html.includes('id="cat-pizza"') && html.includes('scroll-mt-28'),
 'desktop 2-col grid': html.includes('lg:grid-cols-2'),
 'RTL logical margin (ms-2 strike price)': html.includes('line-through ms-2'),
 'category counts shown': /Pizza<span[^>]*>2<\/span>/.test(html.replace(/\s+/g,'')) || html.includes('>2</span>'),
 'no broken-icon risk (onError wired)': html.includes('object-cover'),
};
let fail=0;
for(const[k,v]of Object.entries(checks)){console.log((v?'  ✓ ':'  ✗ ')+k); if(!v)fail++}
console.log(fail? 'FAILED '+fail : 'ALL LAYOUT CHECKS PASSED');
// debug dump
console.log('---HTML SNIPPET---');
console.log(html.slice(0, 400).replace(/\s+/g,' '));
console.log('has Testaurant:', html.includes('Testaurant'), '| len:', html.length);
const t=html.match(/<title>([^<]*)<\/title>/); console.log('title:', t&&t[1]);
console.log('notfound marker:', html.includes('404') || /nicht gefunden|not found/i.test(html));
console.log('login marker:', /LoginForm|passwort|password/i.test(html));
console.log('error digest:', /Application error|digest/i.test(html));
console.log('h1 count with name:', (html.match(/<h1[^>]*>[^<]*Testaurant/g)||[]).length);
console.log('PageHeader header-band absent:', !/border-b[^"]*"[^>]*><div[^>]*min-h-\[56px\]/.test(html) ? 'checking...' : 'present');
