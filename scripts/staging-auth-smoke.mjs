/**
 * Real Supabase staging Auth contract test.
 *
 * Creates temporary identities, verifies trusted role synchronization and
 * password login, attempts user_metadata privilege escalation, and cleans up.
 * Hard-locked to the BlinkGo staging project.
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.staging.local', override: true });

const EXPECTED_PROJECT_REF = 'egjehqoilbjvzgbnksds';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (process.env.ALLOW_STAGING_MUTATIONS !== '1') {
  throw new Error('Refusing to mutate staging without ALLOW_STAGING_MUTATIONS=1');
}
if (!url.includes(EXPECTED_PROJECT_REF)) {
  throw new Error(`Refusing to run outside BlinkGo staging (${EXPECTED_PROJECT_REF})`);
}
if (!publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Missing staging publishable key');
}
if (!secretKey.startsWith('sb_secret_')) {
  throw new Error('Missing staging secret key');
}

async function api(path, { key = secretKey, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'user-agent': 'BlinkGo-Staging-Server-Smoke/1.0',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = payload?.message ?? payload?.msg ?? payload?.error_description ?? `HTTP ${response.status}`;
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }
  return payload;
}

const stamp = Date.now();
const roles = ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin'];
const createdUserIds = [];

async function createAndVerifyUser({ label, appRole, requestedUserRole, expectedRole }) {
  const email = `qa.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const created = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      ...(appRole ? { app_metadata: { app_role: appRole } } : {}),
      user_metadata: {
        name: `BlinkGo Staging QA ${label}`,
        ...(requestedUserRole ? { role: requestedUserRole } : {}),
      },
    },
  });
  const userId = created?.id;
  if (!userId) throw new Error(`Admin API did not return an id for ${label}`);
  createdUserIds.push(userId);

  const profiles = await api(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id,email,role,is_active,is_verified`);
  const profile = profiles?.[0];
  if (!profile) throw new Error(`Profile trigger did not create ${label}`);
  if (profile.role !== expectedRole) {
    throw new Error(`${label} synced as ${profile.role}; expected ${expectedRole}; app_metadata=${JSON.stringify(created?.app_metadata ?? {})}`);
  }
  if (profile.is_active !== true) throw new Error(`${label} profile is not active`);

  const login = await api('/auth/v1/token?grant_type=password', {
    key: publishableKey,
    method: 'POST',
    body: { email, password },
  });
  if (!login?.access_token || login?.user?.id !== userId) {
    throw new Error(`Password login failed for ${label}`);
  }
}

try {
  for (const role of roles) {
    await createAndVerifyUser({ label: role, appRole: role, expectedRole: role });
  }

  await createAndVerifyUser({
    label: 'escalation-attempt',
    requestedUserRole: 'super_admin',
    expectedRole: 'customer',
  });

  console.log('Staging Auth smoke: PASS');
  console.log(`  ✓ ${roles.length} trusted app_metadata roles synchronized correctly`);
  console.log('  ✓ user_metadata privilege escalation fell back to customer');
  console.log(`  ✓ ${roles.length + 1} publishable-key password logins returned verified sessions`);
} finally {
  for (const userId of createdUserIds.reverse()) {
    try {
      await api(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { prefer: 'return=minimal' },
      });
    } catch {}
    try { await api(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }); } catch {}
  }
  if (createdUserIds.length > 0) {
    console.log(`  ✓ ${createdUserIds.length} temporary Auth/profile rows cleaned`);
  }
}
