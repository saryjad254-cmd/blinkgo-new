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

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, secretKey, options);
const anon = createClient(url, publishableKey, options);
const ownerClient = createClient(url, publishableKey, options);
const strangerClient = createClient(url, publishableKey, options);
const adminClient = createClient(url, publishableKey, options);
const stamp = Date.now();
const ids = { users: [], ticket: crypto.randomUUID(), publicReply: crypto.randomUUID(), internalReply: crypto.randomUUID(), refund: crypto.randomUUID(), draft: `qa-secure-${stamp}` };

async function makeUser(label, appRole) {
  const email = `qa.checkout.support.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { app_role: appRole }, user_metadata: { name: `QA ${label}` } });
  if (error) throw error;
  ids.users.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(client, user) {
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
}

async function assertNoAccess(client, table, action) {
  const result = action === 'select'
    ? await client.from(table).select('*').limit(1)
    : await client.from(table).insert({});
  assert.ok(result.error || (Array.isArray(result.data) && result.data.length === 0), `${table} ${action} must be denied`);
}

try {
  const owner = await makeUser('owner', 'customer');
  const stranger = await makeUser('stranger', 'customer');
  const admin = await makeUser('admin', 'admin');
  await Promise.all([signIn(ownerClient, owner), signIn(strangerClient, stranger), signIn(adminClient, admin)]);

  const { data: restaurant, error: restaurantError } = await service.from('restaurants').select('id').limit(1).single();
  if (restaurantError || !restaurant) throw new Error('Staging requires one restaurant for draft RLS smoke');

  const now = new Date();
  const { error: draftError } = await service.from('order_drafts').insert({
    id: ids.draft,
    customer_id: owner.id,
    restaurant_id: restaurant.id,
    draft: { qa: true },
    signature: crypto.randomUUID(),
    expires_at: new Date(now.getTime() + 60_000).toISOString(),
  });
  if (draftError) throw draftError;

  const { error: refundError } = await service.from('refunds').insert({ id: ids.refund, order_id: crypto.randomUUID(), amount: 1, status: 'pending', reason: 'qa_rls' });
  if (refundError) throw refundError;

  const { error: ticketError } = await service.from('support_tickets').insert({
    id: ids.ticket,
    reference_code: `QA-${stamp}`,
    user_id: owner.id,
    user_role: 'customer',
    category: 'other',
    issue_type: 'other',
    subject: 'RLS smoke',
    message: 'RLS smoke',
    status: 'open',
    priority: 'normal',
    next_action: 'waiting_support',
    sla_due_at: new Date(now.getTime() + 3_600_000).toISOString(),
  });
  if (ticketError) throw ticketError;
  const { error: repliesError } = await service.from('support_ticket_replies').insert([
    { id: ids.publicReply, ticket_id: ids.ticket, user_id: owner.id, message: 'Public reply', is_internal: false },
    { id: ids.internalReply, ticket_id: ids.ticket, user_id: admin.id, message: 'Internal reply', is_internal: true },
  ]);
  if (repliesError) throw repliesError;

  for (const client of [ownerClient, strangerClient, adminClient]) {
    await assertNoAccess(client, 'order_drafts', 'select');
    await assertNoAccess(client, 'order_drafts', 'insert');
    await assertNoAccess(client, 'refunds', 'select');
    await assertNoAccess(client, 'refunds', 'insert');
    await assertNoAccess(client, 'support_tickets', 'insert');
    await assertNoAccess(client, 'support_ticket_replies', 'insert');
  }

  assert.equal((await ownerClient.from('support_tickets').select('id').eq('id', ids.ticket)).data?.length, 1, 'owner reads own ticket');
  assert.equal((await strangerClient.from('support_tickets').select('id').eq('id', ids.ticket)).data?.length, 0, 'stranger cannot read ticket');
  assert.equal((await adminClient.from('support_tickets').select('id').eq('id', ids.ticket)).data?.length, 1, 'admin reads ticket');

  const ownerReplies = await ownerClient.from('support_ticket_replies').select('id').eq('ticket_id', ids.ticket);
  assert.deepEqual(ownerReplies.data?.map((row) => row.id), [ids.publicReply], 'owner sees public reply only');
  assert.equal((await strangerClient.from('support_ticket_replies').select('id').eq('ticket_id', ids.ticket)).data?.length, 0, 'stranger sees no replies');
  assert.equal((await adminClient.from('support_ticket_replies').select('id').eq('ticket_id', ids.ticket)).data?.length, 2, 'admin sees public and internal replies');

  for (const table of ['order_drafts', 'refunds', 'support_tickets', 'support_ticket_replies']) {
    await assertNoAccess(anon, table, 'select');
  }

  console.log('Staging checkout/support RLS: PASS');
  console.log('  ✓ checkout drafts and legacy refunds are server-only');
  console.log('  ✓ support owners cannot read internal staff replies');
  console.log('  ✓ authenticated browser sessions cannot mutate support workflow state');
} finally {
  await service.from('support_ticket_replies').delete().in('id', [ids.publicReply, ids.internalReply]);
  await service.from('support_tickets').delete().eq('id', ids.ticket);
  await service.from('refunds').delete().eq('id', ids.refund);
  await service.from('order_drafts').delete().eq('id', ids.draft);
  for (const id of ids.users.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
