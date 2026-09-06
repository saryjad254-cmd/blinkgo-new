import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
import { createClient } from '@supabase/supabase-js';
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 1 });
const { data: rests } = await service.from('restaurants').select('id').limit(1);

// Try with longer wait
const updates = [];
const ch = service
  .channel('test-insert-' + Date.now())
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
    updates.push(payload.new?.order_number);
  })
  .subscribe();
await new Promise(r => setTimeout(r, 3000));  // Longer wait
console.log('Subscribed, status:', await new Promise(r => {
  const sub = service.channel('test-insert-' + Date.now() + '-x').subscribe(s => r(s));
  setTimeout(() => r('timeout'), 1500);
}));

// Insert
const { data: o } = await service.from('orders').insert({
  order_number: 'g7hb_rt_insert_' + Date.now(),
  customer_id: realAuth.users[0].id,
  restaurant_id: rests[0].id,
  status: 'pending',
  subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
  payment_method: 'cash', payment_status: 'succeeded',
  delivery_address: { address: 'x', lat: 0, lng: 0 },
  restaurant_latitude: 0, restaurant_longitude: 0,
  customer_latitude: 0, customer_longitude: 0,
}).select().single();

await new Promise(r => setTimeout(r, 5000));  // Longer wait for INSERT
console.log('INSERT events received:', updates.length, JSON.stringify(updates));
await service.removeChannel(ch);
await service.from('orders').delete().eq('id', o.id);
