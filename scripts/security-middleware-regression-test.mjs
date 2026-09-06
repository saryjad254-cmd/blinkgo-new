const BASE = process.env.BASE_URL || 'http://localhost:3000';
const accounts = {
  customer: ['demo@blinkgo.de', 'DemoCustomer!2024'],
  driver: ['driver@blinkgo.com', 'BlinkGoDriver2026!'],
  admin: ['admin@blinkgo.com', 'BlinkGoAdmin2026!'],
};

const groups = {
  admin: [
    '/api/admin/inspect-schema', '/api/admin/heatmap', '/api/admin/settings',
    '/api/admin/payouts', '/api/admin/announcements', '/api/admin/db-state',
    '/api/admin/daily-reset', '/api/admin/daily-reset/history',
  ],
  driver: ['/api/driver/working-hours'],
  customer: ['/api/loyalty', '/api/notifications/preferences'],
};

function captureCookies(response, jar) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function login(role) {
  const jar = new Map();
  const [email, password] = accounts[role];
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Origin: BASE,
      'x-forwarded-for': `10.61.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
      'x-blinkgo-test-run': 'local-e2e',
    },
    body: JSON.stringify({ email, password }),
  });
  captureCookies(response, jar);
  if (!response.ok) throw new Error(`${role} login failed (${response.status})`);
  return jar;
}

let failures = 0;
let checked = 0;

const deepLink = '/search?q=Blink%20Burger%20Lab&view=map';
const anonymousRedirect = await fetch(`${BASE}${deepLink}`, { redirect: 'manual' });
const redirectLocation = anonymousRedirect.headers.get('location');
const preservedRedirect = redirectLocation
  ? new URL(redirectLocation, BASE).searchParams.get('redirect')
  : null;
const expectedDeepLink = new URL(deepLink, BASE);
const actualDeepLink = preservedRedirect ? new URL(preservedRedirect, BASE) : null;
const deepLinkOk = [302, 303, 307, 308].includes(anonymousRedirect.status)
  && actualDeepLink?.pathname === expectedDeepLink.pathname
  && actualDeepLink.searchParams.get('q') === expectedDeepLink.searchParams.get('q')
  && actualDeepLink.searchParams.get('view') === expectedDeepLink.searchParams.get('view');
checked++;
console.log(`  ${deepLinkOk ? '✓' : '✗'} anonymous deep-link redirect preserves query → ${anonymousRedirect.status}`);
if (!deepLinkOk) failures++;

for (const [role, paths] of Object.entries(groups)) {
  const jar = await login(role);
  for (const path of paths) {
    const response = await fetch(`${BASE}${path}`, {
      headers: {
        Cookie: cookieHeader(jar), Origin: BASE,
        'x-forwarded-for': `10.62.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
        'x-blinkgo-test-run': 'local-e2e',
      },
    });
    checked++;
    const ok = response.status >= 200 && response.status < 500;
    console.log(`  ${ok ? '✓' : '✗'} ${role} ${path} → ${response.status}`);
    if (!ok) failures++;
  }
}

console.log(`Security middleware regression: ${failures ? 'FAIL' : 'PASS'} (${checked} routes)`);
process.exit(failures ? 1 : 0);
