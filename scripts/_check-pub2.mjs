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

// Query the publication tables via REST
// pg_publication is accessible via information_schema
// But the simplest test: try a different table in realtime to see if it's specific to orders
// Test: notifications table
const updates = [];
const sub = service
  .channel('test-rt-notif-' + Date.now())
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
    updates.push(payload.eventType);
  })
  .subscribe();
await new Promise(r => setTimeout(r, 1500));

// Insert a notification
const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 1 });
await service.from('notifications').insert({
  user_id: realAuth.users[0].id,
  type: 'g7h_test',
  title: 'RT test',
  body: 'test',
  is_read: false,
});
await new Promise(r => setTimeout(r, 2000));
console.log('Notification updates:', JSON.stringify(updates));
await service.removeChannel(sub);

// Cleanup
await service.from('notifications').delete().eq('type', 'g7h_test');
