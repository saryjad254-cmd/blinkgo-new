import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminOrDev } from '@/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireAdminOrDev();
  if (!guard.ok) return guard.error;
  
  try {
    const supabase = createServiceClient();
    const tables = ['orders', 'restaurants', 'users', 'order_items', 'notifications'];
    const results: any = {};
    
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (!error && data && data[0]) {
        results[t] = { fields: Object.keys(data[0]), sample: data[0] };
      } else {
        results[t] = { error: error?.message || 'no data' };
      }
    }
    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
