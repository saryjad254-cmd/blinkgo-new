import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
import { createClient } from '@supabase/supabase-js';
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Test driver_status, orders, notifications
const tables = ['driver_status', 'orders', 'notifications'];
for (const tbl of tables) {
  const updates = [];
  const sub = service
    .channel(`test-rt-${tbl}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tbl }, (payload) => {
      updates.push(payload.eventType);
    })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500));

  // Trigger an update on existing rows
  if (tbl === 'driver_status') {
    const { data } = await service.from('driver_status').select('driver_id').limit(1);
    if (data?.[0]) {
      await service.from('driver_status').update({ updated_at: new Date().toISOString() }).eq('driver_id', data[0].driver_id);
    }
  } else if (tbl === 'orders') {
    const { data } = await service.from('orders').select('id').limit(1);
    if (data?.[0]) {
      await service.from('orders').update({ updated_at: new Date().toISOString() }).eq('id', data[0].id);
    }
  } else if (tbl === 'notifications') {
    // insert + delete
    const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 1 });
    const { data: ins } = await service.from('notifications').insert({
      user_id: realAuth.users[0].id,
      type: 'g7h_test',
      title: 't', body: 't', is_read: false,
    }).select().single();
    if (ins) {
      await service.from('notifications').delete().eq('id', ins.id);
    }
  }

  await new Promise(r => setTimeout(r, 2000));
  console.log(`${tbl}: ${updates.length} updates (events: ${JSON.stringify(updates)})`);
  await service.removeChannel(sub);
}
