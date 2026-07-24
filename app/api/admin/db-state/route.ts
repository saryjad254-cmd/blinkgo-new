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
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
    const summary = (users?.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.user_metadata?.role || 'unknown',
      is_active: u.user_metadata?.is_active !== false,
    }));
    return NextResponse.json({ ok: true, users: summary, count: summary.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
