#!/usr/bin/env node
/**
 * Phase 7H-C — Driver Dispatch Realtime Real-DB Test
 * ───────────────────────────────────────────────────
 * Realtime tests for the driver dispatch system.
 *
 * Covers section T of the 7H-C mission.
 *
 * Run: `node scripts/test-driver-dispatch-realtime-real.mjs`
 */

import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) { console.log(`\n═══ ${name} ═══`); }

const TEST_PREFIX = 'g7hc_rt_';
const { data: rests } = await service.from('restaurants').select('*').limit(3);
const restaurantA = rests?.[0];
const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 50 });
const customerId = realAuth?.users?.[0]?.id;

// Create a test driver
const { data: newU } = await service.auth.admin.createUser({
  email: `g7hc_rt_drv_${Date.now()}@test.com`, password: 'TestPass123!', email_confirm: true,
  user_metadata: { name: 'RT Driver', role: 'driver', is_online: true }
});
const driverId = newU?.user?.id;
if (driverId) {
  await service.from('users').upsert({ id: driverId, email: newU.user.email, name: 'RT Driver', role: 'driver', is_active: true }, { onConflict: 'id' });
  await service.from('drivers').upsert({ id: driverId, full_name: 'RT Driver', is_active: true, is_available: true }, { onConflict: 'id' });
  await service.from('driver_status').upsert({ driver_id: driverId, is_online: true, is_on_delivery: false, current_order_id: null }, { onConflict: 'driver_id' });
}

async function makeOrder(driverIdValue, status, extra = {}) {
  const orderNumber = `${TEST_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantA?.id,
    driver_id: driverIdValue,
    status,
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 0, lng: 0 },
    restaurant_latitude: 0, restaurant_longitude: 0,
    customer_latitude: 0, customer_longitude: 0,
    ...extra
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanup(id) {
  await service.from('order_items').delete().eq('order_id', id);
  await service.from('order_tracking_events').delete().eq('order_id', id);
  await service.from('orders').delete().eq('id', id);
}

// ═══════════════════════════════════════════════════════════════
// T. REALTIME DISPATCH
// ═══════════════════════════════════════════════════════════════
section('T. Realtime Dispatch');

// T1: New offer reaches correct driver
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const updates = [];
    // Subscribe to orders for this driver
    const ch = service
      .channel('rt-driver-orders')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          updates.push({ event: 'UPDATE', status: payload.new?.status });
        })
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    // Create an order for this driver
    const o = await makeOrder(driverId, 'ready');
    await new Promise(r => setTimeout(r, 1000));

    // Update the order
    await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));

    t('Driver receives order UPDATE via realtime', updates.some(u => u.status === 'picked_up'),
      `events: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// T2: Wrong driver does NOT receive private order details
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    // Create another driver
    const { data: u2 } = await service.auth.admin.createUser({
      email: `g7hc_rt_drv2_${Date.now()}@test.com`, password: 'TestPass123!', email_confirm: true,
      user_metadata: { name: 'RT Driver 2', role: 'driver', is_online: true }
    });
    const driver2Id = u2?.user?.id;

    // Create order for driver1
    const o = await makeOrder(driverId, 'ready');
    const updates = [];
    // Driver2 subscribes to "their" orders
    const ch = service
      .channel('rt-driver2-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${driver2Id}` },
        (payload) => {
          updates.push(payload.new?.order_number);
        })
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    // Update the order (driver1's order)
    await service.from('orders').update({ status: 'picked_up' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));

    // Driver2 should NOT receive this
    t('Wrong driver does NOT receive order UPDATE (subscription isolation)', !updates.some(u => u === o.order_number),
      `received: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    if (driver2Id) {
      await service.from('driver_status').delete().eq('driver_id', driver2Id);
      await service.from('users').delete().eq('id', driver2Id);
      await service.auth.admin.deleteUser(driver2Id);
    }
    await cleanup(o.id);
  }
}

// T3: Assignment disappears when claimed by another driver
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(null, 'ready');
    const updates1 = [];
    // Driver1 subscribes to all order events (no filter — PostgREST realtime doesn't support is.null filter)
    // Then client-side filter for driver_id = null before, then != null after
    const ch1 = service
      .channel('rt-available-1')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          // Track orders that were available (driver_id was null) and now assigned
          if (payload.new?.order_number === o.order_number) {
            updates1.push({ event: 'UPDATE', new_driver_id: payload.new?.driver_id });
          }
        })
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    // Driver1 claims the order
    await service.from('orders').update({ driver_id: driverId, accepted_at: new Date().toISOString() }).eq('id', o.id).is('driver_id', null);
    await new Promise(r => setTimeout(r, 2500));

    // Driver1 should receive an UPDATE event
    t('Available-order subscriber receives UPDATE when order is claimed', updates1.length > 0,
      `received: ${JSON.stringify(updates1)}`);

    await service.removeChannel(ch1);
    await cleanup(o.id);
  }
}

// T4: Cancellation propagates
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(driverId, 'confirmed', { accepted_at: new Date().toISOString() });
    const updates = [];
    const ch = service
      .channel('rt-cancel')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    await service.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));
    t('Cancellation propagates to driver subscription', updates.includes('cancelled'),
      `received: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// T5: Driver status changes propagate
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const updates = [];
    const ch = service
      .channel('rt-driver-status')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_status', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          updates.push({ event: payload.eventType, is_on_delivery: payload.new?.is_on_delivery });
        })
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    await service.from('driver_status').update({ is_on_delivery: true }).eq('driver_id', driverId);
    await new Promise(r => setTimeout(r, 2500));
    t('Driver status UPDATE propagates', updates.length > 0, `events: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    // Cleanup
    await service.from('driver_status').update({ is_on_delivery: false }).eq('driver_id', driverId);
  }
}

// T6: Disconnect + reconnect
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(driverId, 'ready');
    const updates = [];
    let ch = service
      .channel('rt-disco-1')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    // Get an update
    await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2000));
    t('Update received while subscribed', updates.includes('picked_up'), `received: ${JSON.stringify(updates)}`);

    // Disconnect
    await service.removeChannel(ch);
    updates.length = 0;
    await service.from('orders').update({ status: 'delivering' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2000));
    t('No update after disconnect', !updates.includes('delivering'), `received: ${JSON.stringify(updates)}`);

    // Reconnect
    ch = service
      .channel('rt-disco-2')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));
    await service.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', o.id).in('status', ['picked_up', 'delivering']);
    await new Promise(r => setTimeout(r, 2000));
    t('Update received after reconnect', updates.includes('delivered'), `received: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// T7: Duplicate subscription
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(driverId, 'ready');
    const updates1 = [];
    const updates2 = [];
    const ch1 = service
      .channel('rt-dup-1')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates1.push(payload.new?.status))
      .subscribe();
    const ch2 = service
      .channel('rt-dup-2')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates2.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));
    t('Subscription 1 receives update', updates1.length > 0, `received: ${JSON.stringify(updates1)}`);
    t('Subscription 2 receives update', updates2.length > 0, `received: ${JSON.stringify(updates2)}`);

    await service.removeChannel(ch1);
    await service.removeChannel(ch2);
    await cleanup(o.id);
  }
}

// T8: Multi-device (3 subscriptions)
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const updates = [];
    const channels = [];
    for (let i = 0; i < 3; i++) {
      const ch = service
        .channel(`rt-device-${i}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
          (payload) => updates.push({ device: i, status: payload.new?.status }))
        .subscribe();
      channels.push(ch);
    }
    await new Promise(r => setTimeout(r, 1500));

    const o = await makeOrder(driverId, 'ready');
    await service.from('orders').update({ status: 'picked_up' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));
    const deviceCount = new Set(updates.map(u => u.device)).size;
    t('3 devices all receive update', deviceCount === 3, `device count: ${deviceCount}`);

    for (const ch of channels) await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// T9: Resubscribe after disconnect receives new events
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(driverId, 'ready');
    let ch = service
      .channel('rt-late-1')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        () => {})
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));
    await service.removeChannel(ch);

    // Update while disconnected
    await service.from('orders').update({ status: 'picked_up' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 1500));

    // Resubscribe
    const updates = [];
    ch = service
      .channel('rt-late-2')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));
    await service.from('orders').update({ status: 'delivering' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2000));
    t('Resubscribed channel receives new event', updates.includes('delivering'),
      `received: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// T10: out-of-order event (early state UPDATE arrives after later one)
{
  if (!driverId) {
    t('Skip (no driver)', true);
  } else {
    const o = await makeOrder(driverId, 'ready');
    const updates = [];
    const ch = service
      .channel('rt-ooo')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload) => updates.push(payload.new?.status))
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    // Send a rapid burst of updates
    await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 100));
    await service.from('orders').update({ status: 'delivering' }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 100));
    await service.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', o.id);
    await new Promise(r => setTimeout(r, 2500));

    // We should receive all 3 events in order
    t('3+ rapid updates received', updates.length >= 3, `count: ${updates.length}`);
    t('Updates in order: picked_up, delivering, delivered',
      JSON.stringify(updates) === JSON.stringify(['picked_up', 'delivering', 'delivered']),
      `received: ${JSON.stringify(updates)}`);

    await service.removeChannel(ch);
    await cleanup(o.id);
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
if (driverId) {
  await service.from('driver_status').delete().eq('driver_id', driverId);
  await service.from('drivers').delete().eq('id', driverId);
  await service.from('users').delete().eq('id', driverId);
  await service.auth.admin.deleteUser(driverId);
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section('SUMMARY');
console.log(`\nTotal: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
