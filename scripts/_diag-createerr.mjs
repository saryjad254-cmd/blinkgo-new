import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});
// Warmup
await sb.auth.admin.listUsers({page:1, perPage:1});
await new Promise(r => setTimeout(r, 1500));

const r = await sb.auth.admin.createUser({
  id: '00000000-0000-0000-0000-0000000000a1',
  email: 'admin@blinkgo.de',
  password: 'BlinkGoAdmin2026!',
  email_confirm: true,
});
console.log('r.error keys:', r.error ? Object.keys(r.error) : 'null');
console.log('r.error type:', r.error?.constructor?.name);
console.log('r.error JSON:', JSON.stringify(r.error, null, 2));
console.log('r.data:', JSON.stringify(r.data));
