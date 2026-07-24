const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
async function session(code){const jar=new Jar();const ver='pkce_'+'v'.repeat(56);
  jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(ver)).toString('base64url'));
  const go=async(p,o={})=>{const r=await fetch(APP+p,{redirect:'manual',...o,headers:{Cookie:jar.h(),Origin:APP,...(o.headers||{})}});jar.ing(r.headers.getSetCookie?.()??[]);return r};
  await go(`/auth/callback?code=${code}&next=%2F&lang=de`); return go;}
const go = await session("code-new-user");
const r = await go("/admin");
const html = await r.text();
console.log('customer → /admin  status:', r.status, 'bytes:', html.length);
const strip = html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ');
console.log('VISIBLE TEXT:', strip.split(/\s+/).filter(Boolean).join(' ').slice(0,160));
console.log('contains NEXT_REDIRECT marker:', /NEXT_REDIRECT|replace\("\/login|__next_redirect/.test(html));
console.log('contains /login reference:', html.includes('/login'));
console.log('contains admin-only markers (Dashboard/Umsatz/Benutzer):', /Umsatz|Benutzer verwalten|Admin/i.test(strip));
