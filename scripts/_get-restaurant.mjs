import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});
const { data: r } = await sb.from('restaurants').select('id, name, owner_id, is_active').eq('id', '00000000-0000-0000-0000-000000000020').single();
console.log('Target restaurant:', JSON.stringify(r, null, 2));
