const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
const jar=new Jar();const ver='pkce_'+'v'.repeat(56);
jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(ver)).toString('base64url'));
const go=async(p,o={})=>{const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r};
await go('/auth/callback?code=code-new-user&next=%2F&lang=de');
const APIS=['/api/orders/recent?limit=5','/api/products/bestsellers?limit=6','/api/products/recent?limit=6','/api/search?q=pizza','/api/recommendations','/api/favorites'];
for(const a of APIS){
  const r=await go(a); const b=await r.text();
  console.log(`${r.status>=500?'⛔':'  '} ${String(r.status).padEnd(4)} ${a.padEnd(34)} ${b.slice(0,130).replace(/\s+/g,' ')}`);
}
