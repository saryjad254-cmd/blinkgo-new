// Phase 6.3 — authenticated crawl hunting the global error boundary
const APP='http://127.0.0.1:3999';
class Jar{constructor(){this.m=new Map()}ing(sc){for(const s of sc){const[p]=s.split(';');const i=p.indexOf('=');const n=p.slice(0,i).trim(),v=p.slice(i+1).trim();const ma=s.match(/Max-Age=(-?\d+)/i);if((ma&&+ma[1]<=0)||v==='')this.m.delete(n);else this.m.set(n,v)}}h(){return[...this.m.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}}
const jar=new Jar();
const verifier='pkce_'+'v'.repeat(56);
jar.m.set('sb-127-auth-token-code-verifier','base64-'+Buffer.from(JSON.stringify(verifier)).toString('base64url'));
async function go(p,extra={}){const r=await fetch(APP+p,{redirect:'manual',headers:{Cookie:jar.h()+(extra.lang?`; blinkgo-locale=${extra.lang}`:''),Origin:APP}});jar.ing(r.headers.getSetCookie?.()??[]);return r}
await go('/auth/callback?code=code-new-user&next=%2F&lang=de');
const pages=['/','/welcome','/register','/forgot-password','/help','/share','/coming-soon','/customer','/notifications','/profile','/payment-history','/legal/impressum','/legal/agb','/auth/verify','/auth/oauth-error'];
const langs=['de','ar'];
let crashes=0;
for(const lang of langs){
  for(const p of pages){
    let r=await go(p,{lang});
    let hops=0, path=p;
    while(r.status>=300&&r.status<400&&hops<4){const loc=r.headers.get('location');path=loc.replace(APP,'');r=await go(path,{lang});hops++;}
    const html=await r.text();
    const globalErr=html.includes('Etwas ist schiefgelaufen');
    const segErr=/Something went wrong|digest/.test(html)&&r.status===200&&!globalErr&&html.length<25000&&/error/i.test(html.slice(0,2000))?false:false;
    const apiIssue='';
    console.log(`${globalErr?'💥 GLOBAL-ERROR':'  ok'} [${lang}] ${p}${path!==p?' → '+path:''} (${r.status}, ${html.length}B)`);
    if(globalErr)crashes++;
  }
}
console.log(crashes?`\n${crashes} page(s) hit the GLOBAL error boundary`:'\nNo global-error hits');
// Also hit the suspect APIs directly
for(const api of ['/api/products/bestsellers','/api/products/recent','/api/search?q=dish','/api/orders/recent']){
  const r=await go(api);
  const body=await r.text();
  console.log(`API ${api} → ${r.status} ${body.slice(0,120)}`);
}
