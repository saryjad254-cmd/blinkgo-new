import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: true });

const expectedRef = 'egjehqoilbjvzgbnksds';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const appUrl = process.env.BLINKGO_STAGING_APP_URL ?? 'http://localhost:3000';

if (!supabaseUrl.includes(expectedRef)) throw new Error(`Refusing to test outside ${expectedRef}`);

const client = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: login, error: loginError } = await client.auth.signInWithPassword({
  email: 'demo@blinkgo.de',
  password: 'DemoCustomer!2024',
});
if (loginError || !login.session?.access_token) throw loginError ?? new Error('Customer login returned no token');

const response = await fetch(`${appUrl}/api/addresses`, {
  headers: { authorization: `Bearer ${login.session.access_token}` },
});
const payload = await response.json();
assert.equal(response.status, 200, JSON.stringify(payload));
const addresses = payload?.data?.addresses ?? payload?.addresses ?? [];
assert.ok(Array.isArray(addresses), 'Address API did not return an array');
assert.ok(
  addresses.some((address) => address.id === 'b1000000-0000-4000-8000-000000000501'),
  `Fixture address missing from API response: ${JSON.stringify(payload)}`,
);

console.log('Staging app API: PASS');
console.log('  ✓ Bearer session authenticated through BlinkGo security middleware');
console.log('  ✓ Customer address API returned the owned staging address');
