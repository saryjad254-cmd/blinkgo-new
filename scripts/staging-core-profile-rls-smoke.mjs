import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: true });

const projectRef = 'egjehqoilbjvzgbnksds';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (process.env.ALLOW_STAGING_MUTATIONS !== '1') throw new Error('Set ALLOW_STAGING_MUTATIONS=1');
if (!url.includes(projectRef)) throw new Error(`Refusing to run outside ${projectRef}`);

const service = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const customer = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `qa.profile.rls.${Date.now()}@blinkgo.invalid`;
const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
let userId;

try {
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: 'customer' },
    user_metadata: { name: 'Profile RLS Before' },
  });
  if (createError) throw createError;
  userId = created.user.id;

  const { data: initial, error: initialError } = await service
    .from('users')
    .select('id,role,is_active,is_verified')
    .eq('id', userId)
    .single();
  if (initialError) throw initialError;

  const { data: login, error: loginError } = await customer.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) throw loginError ?? new Error('No customer session');

  const { data: anonymousRows, error: anonymousError } = await anon
    .from('users')
    .select('id')
    .eq('id', userId);
  if (anonymousError) {
    assert.equal(anonymousError.code, '42501');
  } else {
    assert.deepEqual(anonymousRows, []);
  }

  const { data: ownRows, error: ownReadError } = await customer
    .from('users')
    .select('id,role,is_active,is_verified')
    .eq('id', userId);
  if (ownReadError) throw ownReadError;
  assert.equal(ownRows?.length, 1);

  const { data: renamed, error: renameError } = await customer
    .from('users')
    .update({ name: 'Profile RLS After' })
    .eq('id', userId)
    .select('id,name')
    .single();
  if (renameError) throw renameError;
  assert.equal(renamed.name, 'Profile RLS After');

  await customer
    .from('users')
    .update({ role: 'super_admin', is_active: false, is_verified: !initial.is_verified })
    .eq('id', userId);

  const { data: final, error: finalError } = await service
    .from('users')
    .select('role,is_active,is_verified,name')
    .eq('id', userId)
    .single();
  if (finalError) throw finalError;
  assert.equal(final.role, initial.role);
  assert.equal(final.is_active, initial.is_active);
  assert.equal(final.is_verified, initial.is_verified);
  assert.equal(final.name, 'Profile RLS After');

  console.log('Staging core profile RLS: PASS');
  console.log('  ✓ anonymous profile read denied');
  console.log('  ✓ customer reads and edits safe fields on own profile');
  console.log('  ✓ customer cannot escalate role or change verification/active flags');
} finally {
  if (userId) {
    await service.from('users').delete().eq('id', userId);
    await service.auth.admin.deleteUser(userId);
  }
}
